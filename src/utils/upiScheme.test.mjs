/**
 * Guards the rule that decides which URLs are handed to an external payment app.
 *
 * Getting this wrong is silent and expensive: a payment scheme that is not
 * forwarded gets loaded by the WebView instead, which kills the payment page
 * with ERR_UNKNOWN_URL_SCHEME. Mirrors the check in Home.tsx openUpiIntent.
 *
 * Run: node src/utils/upiScheme.test.mjs
 */
import assert from 'node:assert';

const WEB_SCHEMES = ['http', 'https', 'about', 'data', 'blob', 'javascript', 'file', 'content', 'chrome'];
const NON_PAYMENT_SCHEMES = ['mailto', 'tel', 'sms', 'geo'];

function isAppHandoff(url) {
  const cleanUrl = String(url || '').trim();
  if (!cleanUrl) return false;
  const colonAt = cleanUrl.indexOf(':');
  if (colonAt <= 0) return false;
  const scheme = cleanUrl.slice(0, colonAt).toLowerCase();
  if (WEB_SCHEMES.includes(scheme) || NON_PAYMENT_SCHEMES.includes(scheme)) return false;
  return true;
}

// Every scheme declared in android/app/src/main/res/xml/config.xml must be forwarded.
const CONFIG_XML_SCHEMES = [
  'upi', 'tez', 'paytmmp', 'phonepe', 'gpay', 'bhim', 'amazonpay', 'credpay',
  'mobikwik', 'induspay', 'iMobile', 'axispay', 'slicepay', 'fampay', 'navi',
  'myairtel', 'bajajfinservmarkets', 'lotza', 'olamoney', 'snapchat',
];
for (const scheme of CONFIG_XML_SCHEMES) {
  assert.strictEqual(isAppHandoff(`${scheme}://pay?pa=test@upi&am=100`), true, `${scheme} must be forwarded to the app`);
}

// Android intent:// URLs are what the gateway most often emits.
assert.strictEqual(isAppHandoff('intent://pay#Intent;scheme=upi;package=com.phonepe.app;end'), true);

// Case should not matter — schemes arrive however the gateway wrote them.
assert.strictEqual(isAppHandoff('UPI://pay?pa=x'), true);
assert.strictEqual(isAppHandoff('HTTPS://example.com'), false);

// The WebView owns these; forwarding them would break normal navigation.
for (const url of [
  'https://smartgateway.hdfc.bank.in/payment-page/order/x',
  'http://example.com',
  'about:blank',
  'data:text/html,<h1>x</h1>',
  'blob:https://example.com/abc',
  'javascript:void(0)',
  'https://app.close.browser/',      // the in-app close sentinel
]) {
  assert.strictEqual(isAppHandoff(url), false, `${url} must stay in the WebView`);
}

// Not payment handoffs — must not set upiWasTriggered and trigger a balance refresh.
for (const url of ['mailto:a@b.com', 'tel:+919999999999', 'sms:123', 'geo:0,0']) {
  assert.strictEqual(isAppHandoff(url), false, `${url} must not count as a payment handoff`);
}

// Malformed input must not throw or forward.
for (const url of ['', '   ', 'not-a-url', null, undefined]) {
  assert.strictEqual(isAppHandoff(url), false, `${JSON.stringify(url)} must be ignored`);
}

console.log(`upi scheme routing self-check: OK (${CONFIG_XML_SCHEMES.length} app schemes forwarded)`);
