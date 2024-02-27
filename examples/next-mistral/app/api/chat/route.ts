import MistralClient from '@mistralai/mistralai';
import { MistralStream, StreamingTextResponse } from 'ai';

export const runtime = 'edge';

const mistral = new MistralClient(process.env.MISTRAL_API_KEY || '');

export async function POST(req: Request) {
  // Extract the `messages` from the body of the request
  const { messages } = await req.json();

  const response = mistral.chatStream({
    model: 'mistral-small',
    maxTokens: 1000,
    messages,
  });

  // Convert the response into a friendly text-stream. The Mistral client responses are
  // compatible with the Vercel AI SDK MistralStream adapter.
  const stream = MistralStream(response);

  // Respond with the stream
  return new StreamingTextResponse(stream);
}
