import {
  InvalidDataContentError,
  convertBase64ToUint8Array,
  convertUint8ArrayToBase64,
} from '../../spec';

/**
Data content. Can either be a base64-encoded string, a Uint8Array, an ArrayBuffer, or a Buffer.
 */
export type DataContent = string | Uint8Array | ArrayBuffer | Buffer;

/**
Converts data content to a base64-encoded string.

@param content - Data content to convert.
@returns Base64-encoded string.
*/
export function convertDataContentToBase64String(content: DataContent): string {
  if (typeof content === 'string') {
    return content;
  }

  if (content instanceof ArrayBuffer) {
    return convertUint8ArrayToBase64(new Uint8Array(content));
  }

  return convertUint8ArrayToBase64(content);
}

/**
Converts data content to a Uint8Array.

@param content - Data content to convert.
@returns Uint8Array.
 */
export function convertDataContentToUint8Array(
  content: DataContent,
): Uint8Array {
  if (content instanceof Uint8Array) {
    return content;
  }

  if (typeof content === 'string') {
    return convertBase64ToUint8Array(content);
  }

  if (content instanceof ArrayBuffer) {
    return new Uint8Array(content);
  }

  throw new InvalidDataContentError({ content });
}
