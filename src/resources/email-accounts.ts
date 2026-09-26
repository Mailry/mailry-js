import type {
  EmailAccount,
  ListEmailAccountsParams,
  MailryListResponse,
  RequestOptions,
} from '../types';
import { Resource } from './resource';

export class EmailAccounts extends Resource {
  list(params: ListEmailAccountsParams = {}, options?: RequestOptions): Promise<MailryListResponse<EmailAccount>> {
    return this.http.request<MailryListResponse<EmailAccount>>({
      method: 'GET',
      path: '/public/email',
      query: {
        domainId: params.domainId,
        search: params.search,
        page: params.page,
        limit: params.limit,
      },
      options,
    });
  }

  listAll(params: ListEmailAccountsParams = {}, options?: RequestOptions): AsyncGenerator<EmailAccount, void, undefined> {
    return this.paginate((p, o) => this.list(p, o), { limit: 100, ...params }, options);
  }
}
