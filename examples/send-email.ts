import { readFile } from 'node:fs/promises';
import { Mailry, MailryError, RateLimitError } from 'mailry';

const mailry = new Mailry(process.env.MAILRY_API_KEY);

async function main() {
  const { data: accounts } = await mailry.emailAccounts.list({ limit: 1 });
  const sender = accounts[0];
  if (!sender) throw new Error('Create a mailbox in the Mailry dashboard first.');

  const invoice = await readFile('./invoice.pdf');

  const result = await mailry.inbox.send({
    emailId: sender.id,
    to: ['jane@example.com'],
    subject: 'Your invoice',
    plainBody: 'Hi Jane, your invoice is attached.',
    htmlBody: '<p>Hi Jane, your invoice is attached.</p>',
    attachments: [{ filename: 'invoice.pdf', content: invoice }],
  });

  console.log(result.message);
}

main().catch((error) => {
  if (error instanceof RateLimitError) {
    console.error(`Rate limited, retry in ${error.retryAfter}ms`);
  } else if (error instanceof MailryError) {
    console.error(`Mailry error ${error.status}: ${error.message}`);
  } else {
    console.error(error);
  }
  process.exit(1);
});
