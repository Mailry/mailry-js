export type FetchLike = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

export interface MailryOptions {
  apiKey?: string;
  baseUrl?: string;
  timeout?: number;
  maxRetries?: number;
  headers?: Record<string, string>;
  fetch?: FetchLike;
}

export interface RequestOptions {
  signal?: AbortSignal;
  timeout?: number;
  maxRetries?: number;
  headers?: Record<string, string>;
}

export interface MailryResponse<T> {
  data: T;
  message: string;
  status_code: number;
}

export interface Pagination {
  currentPage: number;
  totalPage: number;
  totalData: number;
}

export interface MailryListResponse<T> extends MailryResponse<T[]> {
  pagination: Pagination;
}

export interface PaginationParams {
  page?: number;
  limit?: number;
}

export type BinaryContent = Blob | ArrayBuffer | ArrayBufferView;

export interface AttachmentInput {
  filename: string;
  content: BinaryContent | string;
  contentType?: string;
}

export type Attachment = AttachmentInput | File;

export interface SendEmailParams {
  emailId: string;
  to: string | string[];
  cc?: string | string[];
  subject: string;
  plainBody?: string;
  htmlBody?: string;
  attachments?: Attachment[];
}

export type SendEmailResponse = MailryResponse<Record<string, never>>;

export interface UploadedAttachment {
  id: string;
  fileName: string;
  fileSize: number;
}

export type UploadAttachmentResponse = MailryResponse<UploadedAttachment>;

export const EmailAccountStatus = {
  Restricted: 0,
  Active: 1,
  Initializing: 2,
  Reactivating: 3,
} as const;

export type EmailAccountStatus = (typeof EmailAccountStatus)[keyof typeof EmailAccountStatus];

export const DomainStatus = {
  Active: 'active',
  Inactive: 'inactive',
} as const;

export type DomainStatus = (typeof DomainStatus)[keyof typeof DomainStatus];

export interface Domain {
  id: string;
  createdAt: string;
  updatedAt: string;
  userId: string | null;
  domainName: string;
  dkim: string | null;
  dkimIdentifier: string | null;
  dkimStatus: boolean;
  spf: string | null;
  spfStatus: boolean;
  mxStatus: boolean;
  returnPathStatus: boolean;
  status: DomainStatus;
}

export interface EmailAccount {
  id: string;
  createdAt: string;
  updatedAt: string;
  userId: string;
  domainId: string;
  avatar: string | null;
  firstName: string;
  lastName: string;
  email: string;
  storage: number;
  status: EmailAccountStatus;
  isStandalone: boolean;
  domain?: Domain;
  totalInbox?: number;
  unreadInbox?: number;
}

export interface ListEmailAccountsParams extends PaginationParams {
  domainId?: string;
  search?: string;
}

export interface ListDomainsParams extends PaginationParams {
  search?: string;
}
