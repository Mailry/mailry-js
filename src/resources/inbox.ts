import { MailryError } from '../errors';
import { appendValue, toBlob } from '../form-data';
import type {
  Attachment,
  RequestOptions,
  SendEmailParams,
  SendEmailResponse,
  UploadAttachmentResponse,
} from '../types';
import { Resource } from './resource';

export const MAX_SEND_ATTACHMENTS = 10;

export class Inbox extends Resource {
  async send(params: SendEmailParams, options?: RequestOptions): Promise<SendEmailResponse> {
    assertSendParams(params);

    const form = new FormData();
    appendValue(form, 'emailId', params.emailId);
    appendValue(form, 'to', params.to);
    appendValue(form, 'cc', params.cc);
    appendValue(form, 'subject', params.subject);
    appendValue(form, 'plainBody', params.plainBody);
    appendValue(form, 'htmlBody', params.htmlBody);
    for (const attachment of params.attachments ?? []) {
      const { blob, filename } = toBlob(attachment);
      form.append('attachments', blob, filename);
    }

    return this.http.request<SendEmailResponse>({
      method: 'POST',
      path: '/public/inbox/send',
      body: form,
      options,
    });
  }

  async uploadAttachment(file: Attachment, options?: RequestOptions): Promise<UploadAttachmentResponse> {
    const { blob, filename } = toBlob(file);
    const form = new FormData();
    form.append('file', blob, filename);

    return this.http.request<UploadAttachmentResponse>({
      method: 'POST',
      path: '/public/inbox/upload-attachment',
      body: form,
      options,
    });
  }
}

function assertSendParams(params: SendEmailParams): void {
  if (!params || typeof params !== 'object') throw new MailryError('send() expects a params object.');
  if (!params.emailId) {
    throw new MailryError('`emailId` is required. Use mailry.emailAccounts.list() to find the id of your mailbox.');
  }
  if (!params.to || (Array.isArray(params.to) && params.to.length === 0)) {
    throw new MailryError('`to` is required.');
  }
  if (!params.subject) throw new MailryError('`subject` is required.');
  if (!params.plainBody && !params.htmlBody) {
    throw new MailryError('Provide at least one of `plainBody` or `htmlBody`.');
  }
  if ((params.attachments?.length ?? 0) > MAX_SEND_ATTACHMENTS) {
    throw new MailryError(`A message can carry at most ${MAX_SEND_ATTACHMENTS} attachments.`);
  }
}
