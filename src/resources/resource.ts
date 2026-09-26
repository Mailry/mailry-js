import type { HttpClient } from '../client';
import type { MailryListResponse, PaginationParams, RequestOptions } from '../types';

export abstract class Resource {
  constructor(protected readonly http: HttpClient) {}

  protected async *paginate<T, P extends PaginationParams>(
    fetchPage: (params: P, options?: RequestOptions) => Promise<MailryListResponse<T>>,
    params: P,
    options?: RequestOptions,
  ): AsyncGenerator<T, void, undefined> {
    let page = params.page ?? 1;
    while (true) {
      const response = await fetchPage({ ...params, page }, options);
      yield* response.data;
      const { totalPage } = response.pagination;
      if (response.data.length === 0 || page >= totalPage) return;
      page += 1;
    }
  }
}
