import { HttpClient } from './client';
import { Domains } from './resources/domains';
import { EmailAccounts } from './resources/email-accounts';
import { Inbox } from './resources/inbox';
import type { MailryOptions } from './types';

export class Mailry {
  readonly inbox: Inbox;
  readonly emailAccounts: EmailAccounts;
  readonly domains: Domains;

  constructor(apiKey?: string, options?: Omit<MailryOptions, 'apiKey'>);
  constructor(options?: MailryOptions);
  constructor(apiKeyOrOptions?: string | MailryOptions, options: Omit<MailryOptions, 'apiKey'> = {}) {
    const resolved: MailryOptions =
      typeof apiKeyOrOptions === 'string' ? { ...options, apiKey: apiKeyOrOptions } : { ...apiKeyOrOptions };

    const http = new HttpClient(resolved);
    this.inbox = new Inbox(http);
    this.emailAccounts = new EmailAccounts(http);
    this.domains = new Domains(http);
  }
}
