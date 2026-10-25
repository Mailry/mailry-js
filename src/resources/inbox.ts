import { MailryError } from '../errors';
import { appendValue, toBlob } from '../form-data';
import type {
  Attachment,
  ListMessagesParams,
  MailryListResponse,
  MailryResponse,
  Message,
  RequestOptions,
  SendEmailParams,
  SendEmailResponse,
  UpdatedCount,
  UploadAttachmentResponse,
} from '../types';
import { Resource } from './resource';

export const MAX_SEND_ATTACHMENTS = 10;
export const MAX_BULK_MESSAGES = 100;

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

  list(params: ListMessagesParams = {}, options?: RequestOptions): Promise<MailryListResponse<Message>> {
    return this.http.request<MailryListResponse<Message>>({
      method: 'GET',
      path: '/public/inbox',
      query: {
        search: params.search,
        domainId: params.domainId,
        emailId: params.emailId,
        folder: params.folder,
        isStarred: params.isStarred,
        page: params.page,
        limit: params.limit,
      },
      options,
    });
  }

  listAll(params: ListMessagesParams = {}, options?: RequestOptions): AsyncGenerator<Message, void, undefined> {
    return this.paginate((p, o) => this.list(p, o), { limit: 100, ...params }, options);
  }

  async get(id: string, options?: RequestOptions): Promise<MailryResponse<Message>> {
    assertId(id, 'get()');
    return this.http.request<MailryResponse<Message>>({
      method: 'GET',
      path: `/public/inbox/${encodeURIComponent(id)}`,
      options,
    });
  }

  async thread(id: string, options?: RequestOptions): Promise<MailryResponse<Message[]>> {
    assertId(id, 'thread()');
    return this.http.request<MailryResponse<Message[]>>({
      method: 'GET',
      path: `/public/inbox/${encodeURIComponent(id)}/thread`,
      options,
    });
  }

  async delete(ids: string | string[], options?: RequestOptions): Promise<MailryResponse<Record<string, never>>> {
    const inboxId = toIdList(ids, 'delete()');
    return this.http.request<MailryResponse<Record<string, never>>>({
      method: 'DELETE',
      path: '/public/inbox',
      body: { inboxId },
      options,
    });
  }

  async markSpam(ids: string | string[], isSpam = true, options?: RequestOptions): Promise<MailryResponse<UpdatedCount>> {
    const inboxId = toIdList(ids, 'markSpam()', MAX_BULK_MESSAGES);
    return this.http.request<MailryResponse<UpdatedCount>>({
      method: 'PATCH',
      path: '/public/inbox/spam',
      body: { inboxId, isSpam },
      options,
    });
  }

  async star(ids: string | string[], isStarred = true, options?: RequestOptions): Promise<MailryResponse<UpdatedCount>> {
    const inboxId = toIdList(ids, 'star()', MAX_BULK_MESSAGES);
    return this.http.request<MailryResponse<UpdatedCount>>({
      method: 'PATCH',
      path: '/public/inbox/star',
      body: { inboxId, isStarred },
      options,
    });
  }

  async deleteAttachment(id: string, options?: RequestOptions): Promise<MailryResponse<Record<string, never>>> {
    assertId(id, 'deleteAttachment()');
    return this.http.request<MailryResponse<Record<string, never>>>({
      method: 'DELETE',
      path: `/public/inbox/attachment/${encodeURIComponent(id)}`,
      options,
    });
  }
}

function assertId(id: string, method: string): void {
  if (!id || typeof id !== 'string') throw new MailryError(`${method} expects a message id.`);
}

function toIdList(ids: string | string[], method: string, max = Infinity): string[] {
  const list = Array.isArray(ids) ? ids : [ids];
  if (list.length === 0 || list.some((id) => !id || typeof id !== 'string')) {
    throw new MailryError(`${method} expects one or more message ids.`);
  }
  if (list.length > max) {
    throw new MailryError(`${method} accepts at most ${max} message ids per call.`);
  }
  return list;
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
