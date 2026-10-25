<p align="center">
  <a href="https://mailry.co">
    <img src="https://mailry.co/images/logo/mailry-web-logo.svg" alt="Mailry" width="200" />
  </a>
</p>

# Mailry SDK for JavaScript & TypeScript

The official Node.js and TypeScript client for the [Mailry.co](https://mailry.co) public API. Send email from your mailboxes, read and manage the messages they hold, upload attachments and look up your domains and email accounts.

- Written in TypeScript, with full type definitions
- Works with ESM and CommonJS
- No runtime dependencies (uses the native `fetch`, `FormData` and `Blob`)
- Automatic retries with backoff for rate limits and transient errors
- Typed errors for every failure mode

## Requirements

Node.js 18 or later. It also runs on Bun, Deno and edge runtimes that provide `fetch`.

## Installation

```bash
npm install mailry
# or
pnpm add mailry
# or
yarn add mailry
# or
bun add mailry
```

## Quick start

Create an API key in the Mailry dashboard, then:

```ts
import { Mailry } from 'mailry';

const mailry = new Mailry('your_api_key');

const { data: accounts } = await mailry.emailAccounts.list();

await mailry.inbox.send({
  emailId: accounts[0].id,
  to: 'jane@example.com',
  subject: 'Hello from Mailry',
  plainBody: 'Hello!',
  htmlBody: '<p>Hello!</p>',
});
```

CommonJS:

```js
const { Mailry } = require('mailry');
```

If you leave out the API key, the client reads it from the `MAILRY_API_KEY` environment variable:

```ts
const mailry = new Mailry();
```

> Keep your API key on the server. Never ship it in browser code.

## Configuration

```ts
const mailry = new Mailry({
  apiKey: 'your_api_key',
  baseUrl: 'https://api.mailry.co',
  timeout: 60_000,
  maxRetries: 2,
  headers: { 'X-Request-Source': 'billing-service' },
  fetch: customFetch,
});
```

| Option       | Default                                                  | Description                                          |
| ------------ | -------------------------------------------------------- | ---------------------------------------------------- |
| `apiKey`     | `process.env.MAILRY_API_KEY`                             | Your Mailry API key                                  |
| `baseUrl`    | `process.env.MAILRY_BASE_URL` or `https://api.mailry.co` | API base URL, for example `http://localhost:4000`    |
| `timeout`    | `60000`                                                  | Request timeout in milliseconds                      |
| `maxRetries` | `2`                                                      | Retries for rate limited or transient failures       |
| `headers`    | `{}`                                                     | Extra headers sent with every request                |
| `fetch`      | `globalThis.fetch`                                       | Custom `fetch` implementation                        |

Every method also takes an optional last argument to override these per request:

```ts
const controller = new AbortController();

await mailry.domains.list({}, { timeout: 5_000, maxRetries: 0, signal: controller.signal });
```

## Usage

### Send an email

`POST /public/inbox/send`

```ts
const result = await mailry.inbox.send({
  emailId: 'b3f1c2d4-...',
  to: ['jane@example.com', 'John <john@example.com>'],
  subject: 'Weekly report',
  plainBody: 'The report is attached.',
  htmlBody: '<p>The report is attached.</p>',
});

console.log(result.message);
```

| Field         | Type                 | Required | Description                                                       |
| ------------- | -------------------- | -------- | ----------------------------------------------------------------- |
| `emailId`     | `string`             | Yes      | ID of the mailbox you send from (see `emailAccounts.list()`)      |
| `to`          | `string \| string[]` | Yes      | Recipients, up to 50 per request                                  |
| `cc`          | `string \| string[]` | No       | Carbon copy recipients                                            |
| `subject`     | `string`             | Yes      | Subject line                                                      |
| `plainBody`   | `string`             | One of   | Plain text body                                                   |
| `htmlBody`    | `string`             | One of   | HTML body                                                         |
| `attachments` | `Attachment[]`       | No       | Up to 10 files, 5MB each: doc, docx, pdf, xlsx, xls, txt          |

At least one of `plainBody` or `htmlBody` is required. Each call counts against your daily API send quota.

#### Attachments

An attachment is either a `File` or an object with a `filename` and `content`. `content` can be a `Buffer`, `Uint8Array`, `ArrayBuffer`, `Blob` or string. The content type is inferred from the file extension unless you set `contentType`.

```ts
import { readFile } from 'node:fs/promises';

await mailry.inbox.send({
  emailId,
  to: 'jane@example.com',
  subject: 'Your invoice',
  htmlBody: '<p>Your invoice is attached.</p>',
  attachments: [
    { filename: 'invoice.pdf', content: await readFile('./invoice.pdf') },
    { filename: 'notes.txt', content: 'Thanks for your business!' },
    { filename: 'data.xlsx', content: spreadsheetBuffer, contentType: 'application/vnd.ms-excel' },
  ],
});
```

### Upload an attachment

`POST /public/inbox/upload-attachment`

Upload an office document (doc, docx, xls, xlsx, ppt, pptx, pdf, up to 25MB) ahead of time and get back its ID.

```ts
const { data } = await mailry.inbox.uploadAttachment({
  filename: 'contract.pdf',
  content: await readFile('./contract.pdf'),
});

console.log(data.id, data.fileName, data.fileSize);
```

### List messages

`GET /public/inbox`

Messages come newest first, one row per conversation. With `search`, which matches subject, sender and body, each matching message is returned on its own.

```ts
import { MessageFolder } from 'mailry';

const { data, pagination } = await mailry.inbox.list({
  emailId: 'b3f1c2d4-...',
  folder: MessageFolder.Inbox,
  isStarred: true,
  search: 'invoice',
  page: 1,
  limit: 20,
});

for (const message of data) {
  console.log(message.id, message.from, message.subject, message.isReaded);
}
```

| Field       | Type            | Description                                                  |
| ----------- | --------------- | ------------------------------------------------------------ |
| `emailId`   | `string`        | Only messages of this mailbox                                |
| `domainId`  | `string`        | Only messages of mailboxes on this domain                    |
| `folder`    | `MessageFolder` | `Inbox` (1), `Sent` (2), `Draft` (3) or `Spam` (4)            |
| `isStarred` | `boolean`       | `true` returns only starred messages                         |
| `search`    | `string`        | Matches subject, sender and body                             |
| `page`      | `number`        | Page number, starting at 1                                   |
| `limit`     | `number`        | Page size, up to 100                                         |

### Get a message

`GET /public/inbox/{id}`

Returns one message with its bodies and attachments, and marks it as read.

```ts
const { data: message } = await mailry.inbox.get(messageId);

console.log(message.subject, message.textBody);

for (const attachment of message.attachments ?? []) {
  console.log(attachment.originalFileName, attachment.fileUrl);
}
```

Each attachment's `fileUrl` is a signed link that expires after a short time. Download it right away rather than storing it.

### Get a conversation

`GET /public/inbox/{id}/thread`

Returns every message in the same conversation as the given one, oldest first, and marks them as read.

```ts
const { data: messages } = await mailry.inbox.thread(messageId);
```

### Star messages

`PATCH /public/inbox/star`

Star or unstar up to 100 messages at a time. Returns how many were updated.

```ts
await mailry.inbox.star([firstId, secondId]);

const { data } = await mailry.inbox.star(firstId, false);
console.log(data.updated);
```

### Mark messages as spam

`PATCH /public/inbox/spam`

Move up to 100 received messages to the Spam folder, or pass `false` to move them back to the Inbox. Sent and draft messages are left untouched. Returns how many were moved.

```ts
await mailry.inbox.markSpam(messageId);
await mailry.inbox.markSpam(messageId, false);
```

### Delete messages

`DELETE /public/inbox`

Permanently delete messages and their attachments, freeing the storage they used.

```ts
await mailry.inbox.delete([firstId, secondId]);
```

### Delete an attachment

`DELETE /public/inbox/attachment/{id}`

Delete an attachment you uploaded and no longer need, or one on a stored message.

```ts
const { data: uploaded } = await mailry.inbox.uploadAttachment(file);

await mailry.inbox.deleteAttachment(uploaded.id);
```

### List email accounts

`GET /public/email`

```ts
const { data, pagination } = await mailry.emailAccounts.list({
  domainId: 'a1b2c3d4-...',
  search: 'support',
  page: 1,
  limit: 20,
});

for (const account of data) {
  console.log(account.id, account.email, account.firstName, account.lastName);
}
```

### List domains

`GET /public/domain`

```ts
import { DomainStatus } from 'mailry';

const { data } = await mailry.domains.list({ search: 'acme' });

const ready = data.filter((domain) => domain.status === DomainStatus.Active);
```

### Pagination

List methods return one page along with `pagination` (`currentPage`, `totalPage`, `totalData`). Page size is capped at 100 by the API.

To walk through every page, use `listAll()`, which fetches pages as you iterate:

```ts
for await (const domain of mailry.domains.listAll()) {
  console.log(domain.domainName);
}

for await (const account of mailry.emailAccounts.listAll({ domainId })) {
  console.log(account.email);
}

for await (const message of mailry.inbox.listAll({ folder: MessageFolder.Inbox })) {
  console.log(message.subject);
}
```

## Error handling

Every error thrown by the SDK extends `MailryError`, which has `status`, `body` and `headers`. Errors returned by the API also have `details`, a list of every validation message.

```ts
import {
  Mailry,
  MailryError,
  AuthenticationError,
  BadRequestError,
  RateLimitError,
} from 'mailry';

try {
  await mailry.inbox.send({ emailId, to, subject, plainBody });
} catch (error) {
  if (error instanceof AuthenticationError) {
    console.error('Check your API key');
  } else if (error instanceof BadRequestError) {
    console.error('Invalid request:', error.details);
  } else if (error instanceof RateLimitError) {
    console.error(`Slow down, retry in ${error.retryAfter}ms`);
  } else if (error instanceof MailryError) {
    console.error(error.status, error.message);
  } else {
    throw error;
  }
}
```

| Error class             | When                                             |
| ----------------------- | ------------------------------------------------ |
| `BadRequestError`       | `400` or `422`: invalid input, quota exceeded    |
| `AuthenticationError`   | `401`: missing or invalid API key                |
| `PermissionDeniedError` | `403`: the key lacks permission                  |
| `NotFoundError`         | `404`                                            |
| `PayloadTooLargeError`  | `413`: attachment too large                      |
| `RateLimitError`        | `429`: over 120 requests per minute              |
| `InternalServerError`   | `5xx`                                            |
| `ConnectionError`       | The API could not be reached                     |
| `TimeoutError`          | The request exceeded `timeout`                   |
| `MailryError`           | Base class, also used for invalid SDK arguments  |

### Retries

The API allows 120 requests per minute per API key. Rate limited requests (`429`) are retried automatically, honouring the `Retry-After` header. Read requests (`GET`) are also retried on network errors, timeouts and `5xx` responses. Sends are never retried after they reach the server, so an email is not delivered twice. Set `maxRetries: 0` to turn retries off.

## TypeScript

All request and response types are exported:

```ts
import type {
  SendEmailParams,
  SendEmailResponse,
  Message,
  MessageAttachment,
  ListMessagesParams,
  EmailAccount,
  Domain,
  MailryListResponse,
  Attachment,
} from 'mailry';
```

## Development

```bash
pnpm install
pnpm test
pnpm typecheck
pnpm build
```

## API reference

See the full API reference at [api.mailry.co/docs/public](https://api.mailry.co/docs/public#description/introduction).
