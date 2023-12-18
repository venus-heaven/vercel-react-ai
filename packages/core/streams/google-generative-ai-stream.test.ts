import {
  GoogleGenerativeAIStream,
  StreamingTextResponse,
  experimental_StreamData,
} from '.';
import { readAllChunks } from '../tests/utils/mock-client';

function simulateGenerativeAIResponse(chunks: any[]) {
  chunks = chunks.slice(); // make a copy
  return {
    stream: {
      [Symbol.asyncIterator]() {
        return {
          next() {
            const chunk = chunks.shift();
            if (chunk) {
              return Promise.resolve({
                value: chunk,
                done: false,
              });
            } else {
              return Promise.resolve({ done: true });
            }
          },
        };
      },
    } as AsyncIterable<any>,
  };
}

export const googleGenerativeAIChunks = [
  {
    candidates: [
      {
        content: {
          parts: [{ text: 'Hello' }],
        },
      },
    ],
  },
  {
    candidates: [
      {
        content: {
          parts: [{ text: ',' }],
        },
      },
    ],
  },
  {
    candidates: [
      {
        content: {
          parts: [{ text: ' world' }],
        },
      },
    ],
  },
  {
    candidates: [
      {
        content: {
          parts: [{ text: '.' }],
        },
      },
    ],
  },
];

it('should be able to parse SSE and receive the streamed response', async () => {
  const aiResponse = simulateGenerativeAIResponse(googleGenerativeAIChunks);
  const stream = GoogleGenerativeAIStream(aiResponse);
  const response = new StreamingTextResponse(stream);

  expect(await readAllChunks(response)).toEqual(['Hello', ',', ' world', '.']);
});

describe('StreamData protocol', () => {
  it('should send text', async () => {
    const data = new experimental_StreamData();

    const aiResponse = simulateGenerativeAIResponse(googleGenerativeAIChunks);
    const stream = GoogleGenerativeAIStream(aiResponse, {
      onFinal() {
        data.close();
      },
      experimental_streamData: true,
    });

    const response = new StreamingTextResponse(stream, {}, data);

    expect(await readAllChunks(response)).toEqual([
      '0:"Hello"\n',
      '0:","\n',
      '0:" world"\n',
      '0:"."\n',
    ]);
  });

  it('should send text and data', async () => {
    const data = new experimental_StreamData();

    data.append({ t1: 'v1' });

    const aiResponse = simulateGenerativeAIResponse(googleGenerativeAIChunks);
    const stream = GoogleGenerativeAIStream(aiResponse, {
      onFinal() {
        data.close();
      },
      experimental_streamData: true,
    });

    const response = new StreamingTextResponse(stream, {}, data);

    expect(await readAllChunks(response)).toEqual([
      '2:[{"t1":"v1"}]\n',
      '0:"Hello"\n',
      '0:","\n',
      '0:" world"\n',
      '0:"."\n',
    ]);
  });
});
