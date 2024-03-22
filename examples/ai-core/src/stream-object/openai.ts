import { experimental_streamObject } from 'ai';
import { OpenAI } from 'ai/openai';
import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config();

const openai = new OpenAI();

async function main() {
  const result = await experimental_streamObject({
    model: openai.chat('gpt-4-turbo-preview'),
    maxTokens: 2000,
    schema: z.object({
      characters: z.array(
        z.object({
          name: z.string(),
          class: z
            .string()
            .describe('Character class, e.g. warrior, mage, or thief.'),
          description: z.string(),
        }),
      ),
    }),
    prompt:
      'Generate 3 character descriptions for a fantasy role playing game.',
  });

  for await (const partialObject of result.objectStream) {
    console.clear();
    console.log(partialObject);
  }
}

main();
