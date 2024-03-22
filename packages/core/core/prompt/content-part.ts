import { DataContent } from './data-content';

export interface TextPart {
  type: 'text';

  /**
   * The text content.
   */
  text: string;
}

export interface ImagePart {
  type: 'image';

  /**
   * Image data. Can either be:
   *
   * - data: a base64-encoded string, a Uint8Array, an ArrayBuffer, or a Buffer
   * - URL: a URL that points to the image
   */
  image: DataContent | URL;

  /**
   * Optional mime type of the image.
   */
  mimeType?: string;
}

export interface ToolCallPart {
  type: 'tool-call';

  toolCallId: string;
  toolName: string;

  args: unknown;
}

export interface ToolResultPart {
  type: 'tool-result';

  toolCallId: string;
  toolName: string;

  result: unknown;
}
