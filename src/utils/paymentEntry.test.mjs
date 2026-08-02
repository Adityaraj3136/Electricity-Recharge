/**
 * Self-check for how a gateway handoff is read out of PGRequestService.
 *
 * The regression this guards: only the plain-URL shape was accepted, so every
 * gateway except HDFC failed with "SBPDCL did not return a payment page".
 *
 * Shapes mirror the portal's own callPgRequest, which tries JSON.parse and
 * treats a parse failure as a redirect URL.
 *
 * Run: npx esbuild src/utils/sbpdclApi.ts --bundle --format=esm \
 *        --outfile=<tmp>/api.mjs && node src/utils/paymentEntry.test.mjs <tmp>/api.mjs
 */
import assert from 'node:assert';
import { pathToFileURL } from 'node:url';

const { parsePaymentEntry } = await import(pathToFileURL(process.argv[2]).href);

// hdfcV2: a bare URL, not JSON.
{
  const e = parsePaymentEntry('https://pay.example.in/session/abc123');
  assert.strictEqual(e.kind, 'url');
  assert.strictEqual(e.url, 'https://pay.example.in/session/abc123');
}

// Surrounding whitespace must not defeat the URL test.
assert.strictEqual(parsePaymentEntry('  https://pay.example.in/x  ').kind, 'url');

// bbaroda / easebuzz: JSON carrying the action URL plus hidden fields.
{
  const e = parsePaymentEntry(JSON.stringify({
    url: 'https://pay.easebuzz.in/pay/initiate',
    key: 'ABC123', txnid: 'T-1', amount: '100', productinfo: 'Recharge',
    firstname: 'CHABI NATH SAH', email: 'NA', phone: 'NA', hash: 'deadbeef',
  }));
  assert.strictEqual(e.kind, 'form');
  assert.strictEqual(e.url, 'https://pay.easebuzz.in/pay/initiate');
  assert.strictEqual(e.fields.hash, 'deadbeef');
  assert.strictEqual(e.fields.amount, '100');
  // `url` drives the form action and must not also be posted as a field.
  assert.ok(!('url' in e.fields), 'url must not be duplicated into the fields');
}

// Non-string field values still have to survive as form values.
{
  const e = parsePaymentEntry(JSON.stringify({ url: 'https://pay.example.in/p', amount: 250, retry: false }));
  assert.strictEqual(e.fields.amount, '250');
  assert.strictEqual(e.fields.retry, 'false');
}

// BillDesk needs a hosted SDK, not a form post. Fail with something the user
// can act on rather than posting a form that renders blank.
assert.throws(
  () => parsePaymentEntry(JSON.stringify({ authorization: 'tok', orderID: 'O-1' })),
  /BillDesk/,
);

// Junk must never reach the payment window.
for (const bad of ['', '   ', 'null', 'Consumer not found', 'ftp://pay.example.in', JSON.stringify({ url: 'javascript:alert(1)' })]) {
  assert.throws(() => parsePaymentEntry(bad), /payment page|unreadable/, `expected a throw for ${JSON.stringify(bad)}`);
}

console.log('paymentEntry: all assertions passed');
