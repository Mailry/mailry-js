import type { Domain, ListDomainsParams, MailryListResponse, RequestOptions } from '../types';
import { Resource } from './resource';

export class Domains extends Resource {
  list(params: ListDomainsParams = {}, options?: RequestOptions): Promise<MailryListResponse<Domain>> {
    return this.http.request<MailryListResponse<Domain>>({
      method: 'GET',
      path: '/public/domain',
      query: {
        search: params.search,
        page: params.page,
        limit: params.limit,
      },
      options,
    });
  }

  listAll(params: ListDomainsParams = {}, options?: RequestOptions): AsyncGenerator<Domain, void, undefined> {
    return this.paginate((p, o) => this.list(p, o), { limit: 100, ...params }, options);
  }
}
