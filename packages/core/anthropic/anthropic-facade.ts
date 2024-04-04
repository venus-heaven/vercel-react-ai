import { generateId, loadApiKey } from '../spec';
import { AnthropicMessagesLanguageModel } from './anthropic-messages-language-model';
import {
  AnthropicMessagesModelId,
  AnthropicMessagesSettings,
} from './anthropic-messages-settings';

/**
 * Anthropic provider.
 */
export class Anthropic {
  readonly baseUrl?: string;
  readonly apiKey?: string;

  private readonly generateId: () => string;

  constructor(
    options: {
      baseUrl?: string;
      apiKey?: string;
      generateId?: () => string;
    } = {},
  ) {
    this.baseUrl = options.baseUrl;
    this.apiKey = options.apiKey;
    this.generateId = options.generateId ?? generateId;
  }

  private get baseConfig() {
    return {
      baseUrl: this.baseUrl ?? 'https://api.anthropic.com/v1',
      headers: () => ({
        'anthropic-version': '2023-06-01',
        'x-api-key': loadApiKey({
          apiKey: this.apiKey,
          environmentVariableName: 'ANTHROPIC_API_KEY',
          description: 'Anthropic',
        }),
      }),
    };
  }

  messages(
    modelId: AnthropicMessagesModelId,
    settings: AnthropicMessagesSettings = {},
  ) {
    return new AnthropicMessagesLanguageModel(modelId, settings, {
      provider: 'anthropic.messages',
      ...this.baseConfig,
      generateId: this.generateId,
    });
  }
}

/**
 * Default Anthropic provider instance.
 */
export const anthropic = new Anthropic();
