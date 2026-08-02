/**
 * Exercises the real routing module used by the native payment window
 * (bundled from src/utils/paymentWindowRouting.ts, so it cannot drift from
 * the shipped code the way a hand-copied mirror would).
 *
 * Run: npx esbuild src/utils/paymentWindowRouting.ts --bundle --format=esm \
 *        --outfile=<tmp>/pwr.mjs && node src/utils/paymentWindowRouting.test.mjs <tmp>/pwr.mjs
 */
import assert from 'node:assert';
import { pathToFileURL } from 'node:url';

// Windows absolute paths must be file:// URLs for the ESM loader.
const mod = await import(pathToFileURL(process.argv[2]).href);
const { routePaymentWindowUrl, CLOSE_SENTINEL, STAY_SENTINEL } = mod;

const idle = { countdownRunning: false, stayRequested: false };

// The blank-page case: SBPDCL's return endpoint answers with an empty JSON body.
// Reached after cancellations and failures as well as successful payments.
const RETURN_URL = 'https://wss.sbpdcl.co.in/fgweb/web/json/plugin/com.fluentgrid.cp.api.PGResponseService/service';
assert.strictEqual(routePaymentWindowUrl(RETURN_URL, idle), 'close-blank');
// Must win over the generic sbpdcl countdown rule, or the user watches a blank page tick down.
assert.notStrictEqual(routePaymentWindowUrl(RETURN_URL, idle), 'start-countdown');
// Still closes even if a countdown had already started on an earlier page.
assert.strictEqual(routePaymentWindowUrl(RETURN_URL, { countdownRunning: true, stayRequested: false }), 'close-blank');

// Real acknowledgement pages should show the return countdown.
assert.strictEqual(routePaymentWindowUrl('https://wss.sbpdcl.co.in/cportal/#/guest/secure/searchbill', idle), 'start-countdown');
// ...but only once, and never after the user asked to stay.
assert.strictEqual(routePaymentWindowUrl('https://wss.sbpdcl.co.in/cportal/x', { countdownRunning: true, stayRequested: false }), 'ignore');
assert.strictEqual(routePaymentWindowUrl('https://wss.sbpdcl.co.in/cportal/x', { countdownRunning: false, stayRequested: true }), 'ignore');

// Sentinels the injected page scripts navigate to.
assert.strictEqual(routePaymentWindowUrl(CLOSE_SENTINEL, idle), 'close');
assert.strictEqual(routePaymentWindowUrl(STAY_SENTINEL, idle), 'stay');

// Payment apps must be handed off, including ones added to the gateway later.
for (const scheme of ['upi', 'intent', 'phonepe', 'paytmmp', 'tez', 'gpay', 'bhim',
                      'amazonpay', 'credpay', 'mobikwik', 'slicepay', 'navi', 'olamoney']) {
  assert.strictEqual(routePaymentWindowUrl(`${scheme}://pay?pa=x@upi&am=100`, idle), 'app-handoff', `${scheme} must hand off`);
}

// The gateway's own pages must be left alone — closing them mid-payment would be fatal.
for (const url of [
  'https://smartgateway.hdfc.bank.in/payment-page/order/ordv2_abc',
  'https://smartgateway.hdfc.bank.in/payment-page/order/ordv2_abc?page=PaymentPage',
  'https://pay.easebuzz.in/checkout/xyz',
  'https://logs.juspay.in/godel/analytics',
]) {
  assert.strictEqual(routePaymentWindowUrl(url, idle), 'ignore', `${url} must be left alone`);
}

// Non-payment schemes must not be mistaken for app handoffs.
for (const url of ['mailto:a@b.com', 'tel:+919999999999', 'sms:123', 'geo:0,0', 'about:blank', 'data:text/html,x']) {
  assert.notStrictEqual(routePaymentWindowUrl(url, idle), 'app-handoff', `${url} must not hand off`);
}

// Malformed input must never throw or trigger an action.
for (const url of ['', '   ', 'not-a-url', null, undefined]) {
  assert.strictEqual(routePaymentWindowUrl(url, idle), 'ignore', `${JSON.stringify(url)} must be ignored`);
}

console.log('payment window routing self-check: OK');
