import { MailryError } from './errors';
import type { Attachment, BinaryContent } from './types';

const MIME_TYPES: Record<string, string> = {
  doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xls: 'application/vnd.ms-excel',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  ppt: 'application/vnd.ms-powerpoint',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  pdf: 'application/pdf',
  txt: 'text/plain',
};

export function guessContentType(filename: string): string {
  const extension = filename.split('.').pop()?.toLowerCase() ?? '';
  return MIME_TYPES[extension] ?? 'application/octet-stream';
}

export function toBlob(attachment: Attachment): { blob: Blob; filename: string } {
  if (isFile(attachment)) {
    const type = attachment.type || guessContentType(attachment.name);
    const blob = attachment.type ? attachment : new Blob([attachment], { type });
    return { blob, filename: attachment.name };
  }

  if (!attachment || typeof attachment.filename !== 'string' || !attachment.filename) {
    throw new MailryError('Each attachment needs a `filename`.');
  }

  const type = attachment.contentType ?? guessContentType(attachment.filename);
  const { content } = attachment;
  let blob: Blob;

  if (content instanceof Blob) {
    blob = content.type === type ? content : new Blob([content], { type });
  } else if (typeof content === 'string') {
    blob = new Blob([content], { type });
  } else if (isBinary(content)) {
    blob = new Blob([toUint8Array(content)], { type });
  } else {
    throw new MailryError(
      `Unsupported content for attachment "${attachment.filename}". Use a Blob, Buffer, ArrayBuffer, typed array or string.`,
    );
  }

  return { blob, filename: attachment.filename };
}

export function appendValue(form: FormData, key: string, value: string | string[] | undefined): void {
  if (value === undefined) return;
  const joined = Array.isArray(value) ? value.join(', ') : value;
  form.append(key, joined);
}

function isFile(value: unknown): value is File {
  return typeof File !== 'undefined' && value instanceof File;
}

function isBinary(value: unknown): value is BinaryContent {
  return value instanceof ArrayBuffer || ArrayBuffer.isView(value);
}

function toUint8Array(content: ArrayBuffer | ArrayBufferView): Uint8Array<ArrayBuffer> {
  if (content instanceof ArrayBuffer) return new Uint8Array(content);
  const copy = new Uint8Array(content.byteLength);
  copy.set(new Uint8Array(content.buffer, content.byteOffset, content.byteLength));
  return copy;
}
