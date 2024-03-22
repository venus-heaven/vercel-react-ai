import { z } from 'zod';
import {
  LanguageModelV1,
  LanguageModelV1StreamPart,
  ParseResult,
  UnsupportedFunctionalityError,
  createEventSourceResponseHandler,
  createJsonResponseHandler,
  generateId,
  isParseableJson,
  postJsonToApi,
  scale,
} from '../ai-model-specification';
import { convertToOpenAIChatMessages } from './convert-to-openai-chat-messages';
import { mapOpenAIFinishReason } from './map-openai-finish-reason';
import { OpenAIChatModelId, OpenAIChatSettings } from './openai-chat-settings';
import { openaiFailedResponseHandler } from './openai-error';

type OpenAIChatConfig = {
  provider: string;
  baseUrl: string;
  headers: () => Record<string, string | undefined>;
};

export class OpenAIChatLanguageModel implements LanguageModelV1 {
  readonly specificationVersion = 'v1';
  readonly defaultObjectGenerationMode = 'tool';

  readonly modelId: OpenAIChatModelId;
  readonly settings: OpenAIChatSettings;

  private readonly config: OpenAIChatConfig;

  constructor(
    modelId: OpenAIChatModelId,
    settings: OpenAIChatSettings,
    config: OpenAIChatConfig,
  ) {
    this.modelId = modelId;
    this.settings = settings;
    this.config = config;
  }

  get provider(): string {
    return this.config.provider;
  }

  private getArgs({
    mode,
    prompt,
    maxTokens,
    temperature,
    topP,
    frequencyPenalty,
    presencePenalty,
    seed,
  }: Parameters<LanguageModelV1['doGenerate']>[0]) {
    const type = mode.type;

    const baseArgs = {
      // model id:
      model: this.modelId,

      // model specific settings:
      logit_bias: this.settings.logitBias,
      user: this.settings.user,

      // standardized settings:
      max_tokens: maxTokens,
      temperature: scale({
        value: temperature,
        outputMin: 0,
        outputMax: 2,
      }),
      top_p: topP,
      frequency_penalty: scale({
        value: frequencyPenalty,
        inputMin: -1,
        inputMax: 1,
        outputMin: -2,
        outputMax: 2,
      }),
      presence_penalty: scale({
        value: presencePenalty,
        inputMin: -1,
        inputMax: 1,
        outputMin: -2,
        outputMax: 2,
      }),
      seed,

      // messages:
      messages: convertToOpenAIChatMessages(prompt),
    };

    switch (type) {
      case 'regular': {
        // when the tools array is empty, change it to undefined to prevent OpenAI errors:
        const tools = mode.tools?.length ? mode.tools : undefined;

        return {
          ...baseArgs,
          tools: tools?.map(tool => ({
            type: 'function',
            function: {
              name: tool.name,
              description: tool.description,
              parameters: tool.parameters,
            },
          })),
        };
      }

      case 'object-json': {
        return {
          ...baseArgs,
          response_format: { type: 'json_object' },
        };
      }

      case 'object-tool': {
        return {
          ...baseArgs,
          tool_choice: { type: 'function', function: { name: mode.tool.name } },
          tools: [{ type: 'function', function: mode.tool }],
        };
      }

      case 'object-grammar': {
        throw new UnsupportedFunctionalityError({
          functionality: 'object-grammar mode',
          provider: this.provider,
        });
      }

      default: {
        const _exhaustiveCheck: never = type;
        throw new Error(`Unsupported type: ${_exhaustiveCheck}`);
      }
    }
  }

  async doGenerate(
    options: Parameters<LanguageModelV1['doGenerate']>[0],
  ): Promise<Awaited<ReturnType<LanguageModelV1['doGenerate']>>> {
    const args = this.getArgs(options);

    const response = await postJsonToApi({
      url: `${this.config.baseUrl}/chat/completions`,
      headers: this.config.headers(),
      body: args,
      failedResponseHandler: openaiFailedResponseHandler,
      successfulResponseHandler: createJsonResponseHandler(
        openAIChatResponseSchema,
      ),
      abortSignal: options.abortSignal,
    });

    const { messages: rawPrompt, ...rawSettings } = args;
    const choice = response.choices[0];

    return {
      text: choice.message.content ?? undefined,
      toolCalls: choice.message.tool_calls?.map(toolCall => ({
        toolCallType: 'function',
        toolCallId: toolCall.id,
        toolName: toolCall.function.name,
        args: toolCall.function.arguments!,
      })),
      finishReason: mapOpenAIFinishReason(choice.finish_reason),
      usage: {
        promptTokens: response.usage.prompt_tokens,
        completionTokens: response.usage.completion_tokens,
      },
      rawCall: { rawPrompt, rawSettings },
      warnings: [],
    };
  }

  async doStream(
    options: Parameters<LanguageModelV1['doStream']>[0],
  ): Promise<Awaited<ReturnType<LanguageModelV1['doStream']>>> {
    const args = this.getArgs(options);

    const response = await postJsonToApi({
      url: `${this.config.baseUrl}/chat/completions`,
      headers: this.config.headers(),
      body: {
        ...args,
        stream: true,
      },
      failedResponseHandler: openaiFailedResponseHandler,
      successfulResponseHandler: createEventSourceResponseHandler(
        openaiChatChunkSchema,
      ),
      abortSignal: options.abortSignal,
    });

    const { messages: rawPrompt, ...rawSettings } = args;

    const toolCalls: Array<{
      id?: string;
      type?: 'function';
      function?: {
        name?: string;
        arguments?: string;
      };
    }> = [];

    return {
      stream: response.pipeThrough(
        new TransformStream<
          ParseResult<z.infer<typeof openaiChatChunkSchema>>,
          LanguageModelV1StreamPart
        >({
          transform(chunk, controller) {
            if (!chunk.success) {
              controller.enqueue({ type: 'error', error: chunk.error });
              return;
            }

            const value = chunk.value;

            if (value.choices?.[0]?.delta == null) {
              return;
            }

            const delta = value.choices[0].delta;

            if (delta.content != null) {
              controller.enqueue({
                type: 'text-delta',
                textDelta: delta.content,
              });
            }

            if (delta.tool_calls != null) {
              for (const toolCallDelta of delta.tool_calls) {
                const index = toolCallDelta.index;

                // new tool call, add to list
                if (toolCalls[index] == null) {
                  toolCalls[index] = toolCallDelta;
                  continue;
                }

                // existing tool call, merge
                const toolCall = toolCalls[index];

                if (toolCallDelta.function?.arguments != null) {
                  toolCall.function!.arguments +=
                    toolCallDelta.function?.arguments ?? '';
                }

                // send delta
                controller.enqueue({
                  type: 'tool-call-delta',
                  toolCallType: 'function',
                  toolCallId: toolCall.id ?? '', // TODO empty?
                  toolName: toolCall.function?.name ?? '', // TODO empty?
                  argsTextDelta: toolCallDelta.function?.arguments ?? '', // TODO empty?
                });

                // check if tool call is complete
                if (
                  toolCall.function?.name == null ||
                  toolCall.function?.arguments == null ||
                  !isParseableJson(toolCall.function.arguments)
                ) {
                  continue;
                }

                controller.enqueue({
                  type: 'tool-call',
                  toolCallType: 'function',
                  toolCallId: toolCall.id ?? generateId(),
                  toolName: toolCall.function.name,
                  args: toolCall.function.arguments,
                });
              }
            }
          },
        }),
      ),
      rawCall: { rawPrompt, rawSettings },
      warnings: [],
    };
  }
}

// limited version of the schema, focussed on what is needed for the implementation
// this approach limits breakages when the API changes and increases efficiency
const openAIChatResponseSchema = z.object({
  choices: z.array(
    z.object({
      message: z.object({
        role: z.literal('assistant'),
        content: z.string().nullable(),
        tool_calls: z
          .array(
            z.object({
              id: z.string(),
              type: z.literal('function'),
              function: z.object({
                name: z.string(),
                arguments: z.string(),
              }),
            }),
          )
          .optional(),
      }),
      index: z.number(),
      finish_reason: z.string().optional().nullable(),
    }),
  ),
  object: z.literal('chat.completion'),
  usage: z.object({
    prompt_tokens: z.number(),
    completion_tokens: z.number(),
  }),
});

// limited version of the schema, focussed on what is needed for the implementation
// this approach limits breakages when the API changes and increases efficiency
const openaiChatChunkSchema = z.object({
  object: z.literal('chat.completion.chunk'),
  choices: z.array(
    z.object({
      delta: z.object({
        role: z.enum(['assistant']).optional(),
        content: z.string().nullable().optional(),
        tool_calls: z
          .array(
            z.object({
              index: z.number(),
              id: z.string().optional(),
              type: z.literal('function').optional(),
              function: z.object({
                name: z.string().optional(),
                arguments: z.string().optional(),
              }),
            }),
          )
          .optional(),
      }),
      finish_reason: z.string().nullable().optional(),
      index: z.number(),
    }),
  ),
});
