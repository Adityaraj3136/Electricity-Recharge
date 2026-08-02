/**
 * Direct SBPDCL JSON API client.
 *
 * The consumer portal's Angular app talks to a JSON service behind an encrypted
 * envelope. That service reflects the caller's Origin in `Access-Control-Allow-Origin`,
 * so the browser can call it directly — no iframe, no bookmarklet, no backend proxy.
 * (A cross-origin iframe can never be scripted, and the portal serves no CORS-open
 * HTML, so this API is the only way to fetch a balance in the background on the web.)
 *
 * Envelope, mirroring the portal's own `encryptAES`:
 *   - bootstrap config call: AES with the static passphrase (OpenSSL/CryptoJS format)
 *   - everything else: random AES-256-CBC key, itself RSA-encrypted with the public
 *     key the bootstrap call returns → { encryptedKey, payload, iv }
 *
 * Only unauthenticated "guest" endpoints are used — the same ones the portal's public
 * bill-search page calls with nothing but a CA number.
 */
import CryptoJS from 'crypto-js';
import { JSEncrypt } from 'jsencrypt';
import type { BalanceDetails } from '../types';
import { formatRupees, pick, selectBalance } from './sbpdclFields';

const API_BASE = 'https://wss.sbpdcl.co.in/fgweb/web/';
const CONFIG_URL = API_BASE + 'json/plugin/com.fluentgrid.cp.api.CPCommonConfigService/service';
const WSS_URL = API_BASE + 'json/plugin/com.fluentgrid.cp.api.SpmIntegrationsData/service';
const PG_REQUEST_URL = API_BASE + 'json/plugin/com.fluentgrid.cp.api.PGRequestService/service';

/** Static passphrase the portal uses before its RSA key is loaded. */
const BOOTSTRAP_PASSPHRASE = 'fgwebcp@2020';

const REQUEST_TIMEOUT_MS = 20000;

/**
 * The object that gets encrypted into a request. Most endpoints key off `action`,
 * but the payment-gateway service takes a bare payload, so this stays open.
 */
type RequestPayload = Record<string, unknown>;

/** AES-encrypt with the static passphrase (CryptoJS "Salted__" OpenSSL format). */
function encryptBootstrap(plaintext: string): string {
  return CryptoJS.AES.encrypt(plaintext, BOOTSTRAP_PASSPHRASE).toString();
}

/** Wrap an action in the hybrid RSA+AES envelope the service expects. */
function encryptHybrid(action: RequestPayload, rsaPublicKey: string) {
  const aesKey = CryptoJS.lib.WordArray.random(32);
  const iv = CryptoJS.lib.WordArray.random(16);
  const payload = CryptoJS.AES.encrypt(JSON.stringify(action), aesKey, {
    iv,
    mode: CryptoJS.mode.CBC,
    padding: CryptoJS.pad.Pkcs7,
  }).toString();

  const rsa = new JSEncrypt();
  rsa.setPublicKey(rsaPublicKey);
  const encryptedKey = rsa.encrypt(aesKey.toString(CryptoJS.enc.Hex));
  if (!encryptedKey) throw new Error('Could not secure the request to SBPDCL.');

  return { encryptedKey, payload, iv: iv.toString(CryptoJS.enc.Hex) };
}

async function postJson(url: string, body: string): Promise<any> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      method: 'POST',
      // text/plain is CORS-safelisted, so the browser sends no preflight. The
      // service rejects the preflight (it omits content-type from
      // Access-Control-Allow-Headers) but accepts the body either way.
      headers: { 'Content-Type': 'text/plain' },
      body,
      signal: controller.signal,
    });
    if (!res.ok) throw new Error(`SBPDCL responded with ${res.status}`);
    return await res.json();
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') {
      throw new Error('SBPDCL took too long to respond.');
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * The RSA public key is served by an unauthenticated bootstrap call and can be
 * rotated by the utility, so it is fetched rather than hardcoded — cached per
 * page load since it is stable for far longer than a session.
 */
let rsaKeyPromise: Promise<string> | null = null;

function getRsaPublicKey(): Promise<string> {
  if (!rsaKeyPromise) {
    rsaKeyPromise = (async () => {
      const config = await postJson(
        CONFIG_URL,
        encryptBootstrap(JSON.stringify({ action: 'getAllWebConfigurations' }))
      );
      const key = config?.enc;
      if (!key) throw new Error('SBPDCL did not return an encryption key.');
      return key as string;
    })().catch(err => {
      rsaKeyPromise = null; // let the next attempt retry rather than cache the failure
      throw err;
    });
  }
  return rsaKeyPromise;
}

async function callAction(action: RequestPayload, url: string = WSS_URL): Promise<any> {
  const rsaPublicKey = await getRsaPublicKey();
  return postJson(url, JSON.stringify(encryptHybrid(action, rsaPublicKey)));
}

/**
 * Responses come back as `[{ data, status }]`, and the account endpoint nests one
 * level further under `ConsumerData: [ ... ]`. Unwrap both, defensively.
 */
function unwrap(response: any): any {
  const first = Array.isArray(response) ? response[0] : response;
  const data = first?.data ?? first;
  if (Array.isArray(data?.ConsumerData)) return data.ConsumerData[0] ?? {};
  return data;
}

function normaliseCa(caNumber: string): string {
  const ca = String(caNumber).replace(/\D/g, '');
  if (!ca) throw new Error('Invalid CA number.');
  return ca;
}

/**
 * The portal's bill-search call: the consumer record — name, division, vendor —
 * and `billNo`, which is required to start a recharge.
 *
 * Its `prepaidBalance` is a billing figure, NOT the meter's balance: it reads 0
 * on prepaid connections. The live reading comes from `fetchPrepaidInfo`.
 */
async function fetchBillDetails(ca: string): Promise<any> {
  const response = await callAction({
    action: 'fgexternal/rest/fetchBillDetails/',
    method: 'POST',
    req: { scno: ca },
    auth: 'TOKEN',
    baseUrlName: '',
    reqType: 'CISENC',
  });
  const bill = unwrap(response);
  // Unknown CAs come back 200 with a status message rather than an HTTP error.
  if (!bill || pick(bill, 'message') === 'FAILURE' || (!pick(bill, 'scno') && !pick(bill, 'name'))) {
    throw new Error(pick(bill, 'status', 'message', 'error') || 'Consumer details not found.');
  }
  return bill;
}

/** Most recent successful payment, used for the "last recharge" row. Best-effort. */
async function fetchLastTransaction(ca: string): Promise<any | null> {
  try {
    const response = await callAction({
      action: 'fgexternal/rest/payment/transactionData',
      method: 'POST',
      req: { scno: ca },
      auth: 'TOKEN',
      baseUrlName: '',
    });
    const rows = unwrap(response)?.data;
    return Array.isArray(rows) && rows.length ? rows[0] : null;
  } catch {
    return null;
  }
}

/**
 * Live prepaid balance, read from the meter's AMISP rather than from the bill.
 *
 * `fetchBillDetails` also carries a `prepaidBalance`, but that is a *billing*
 * figure and reads 0 on prepaid connections — using it is what made the app
 * report a balance of ₹0.00 for every prepaid meter. The portal's own dashboard
 * calls this endpoint instead (`getBiharCisPrepaidAvailableBalance`) and reads
 * `current_balance`.
 *
 * Best-effort: the AMISP is a third party and answers "-" across every field
 * when it has no live reading, so a null return and a dash-filled one mean the
 * same thing to the caller. It is deliberately not fatal — the consumer record
 * is still worth having, and `selectBalance` decides what to do without a
 * reading.
 */
async function fetchPrepaidInfo(ca: string, vendor: string): Promise<any | null> {
  try {
    const response = await callAction({
      action: 'fgexternal/rest/AMISP/getConsumerPrepaidRechargeInfo',
      method: 'POST',
      // "vendoerName" is misspelt in the portal's API — it must match exactly.
      req: { consumerNo: ca, vendoerName: vendor || 'NA' },
      auth: 'TOKEN',
      baseUrlName: '',
    });
    return unwrap(response) ?? null;
  } catch {
    return null;
  }
}

/** "2026-07-28 16:55:08.0" → "28/07/2026" */
function formatTransactionDate(raw: string): string {
  const match = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return match ? `${match[3]}/${match[2]}/${match[1]}` : raw;
}

/**
 * Fetch a consumer's live prepaid balance and account details.
 * The recharge history is best-effort — a balance without it is still useful.
 */
export async function fetchBalanceFromApi(caNumber: string): Promise<BalanceDetails> {
  const ca = normaliseCa(caNumber);
  const bill = await fetchBillDetails(ca);
  // The AMISP lookup keys off the vendor named on the bill, so it can only run
  // once the bill is in hand.
  const [prepaid, lastTxn] = await Promise.all([
    fetchPrepaidInfo(ca, pick(bill, 'vendor', 'vendorName', 'amispName')),
    fetchLastTransaction(ca),
  ]);

  // Throwing rather than returning an empty balance is deliberate: the caller
  // writes `availableBalance` straight into the consumer's saved balance and
  // compares it to decide whether a recharge landed, so an empty value would
  // erase the last known figure and could report a payment as confirmed.
  const balanceRaw = selectBalance(prepaid, bill);
  if (!balanceRaw) {
    throw new Error('The meter has not reported a balance yet. Please try again shortly.');
  }

  // The AMISP reports the recharge the meter actually saw; the payment table
  // only knows what the portal collected, so prefer the former.
  const txnDate = pick(prepaid, 'lastRechargeDate') || (lastTxn ? pick(lastTxn, 'CollectionDate') : '');
  const txnAmount = pick(prepaid, 'lastRechargeAmount') || (lastTxn ? pick(lastTxn, 'Amount') : '');

  return {
    caNumber: pick(bill, 'scno') || ca,
    name: pick(bill, 'name', 'consumerName'),
    division: pick(bill, 'divisionName', 'division'),
    subDivision: pick(bill, 'subDivisionName', 'subDivision'),
    lastRechargeDate: txnDate ? formatTransactionDate(txnDate) : 'N/A',
    lastRechargeAmount: txnAmount ? formatRupees(txnAmount) : 'N/A',
    consumerType: pick(bill, 'consumerType'),
    currentStatus: pick(prepaid, 'connection_status') || pick(bill, 'connectionStatus') || 'N/A',
    availableBalance: formatRupees(balanceRaw),
    amispVendor: pick(prepaid, 'vendor') || pick(bill, 'vendor', 'amispName'),
  };
}

// ─── Recharge ───────────────────────────────────────────────────────────────

/** Portal gateway keys, mapped from the labels stored against a consumer. */
const GATEWAY_KEYS: Record<string, string> = {
  'HDFC': 'hdfc',
  'Bank of Baroda': 'baroda',
  'Federal Bank': 'easebuzz',
};

/**
 * Gateways are configured server-side and their ids are not stable, so the list
 * is fetched rather than hardcoded. Type "R" is the recharge list.
 */
async function fetchGatewayId(preferred?: string): Promise<string> {
  const response = await postJson(
    CONFIG_URL,
    encryptBootstrap(JSON.stringify({ action: 'getPaymentGatewayList', type: 'R' }))
  );
  const gateways: any[] = response?.data ?? [];
  if (!gateways.length) throw new Error('SBPDCL returned no payment gateways.');

  const wanted = GATEWAY_KEYS[preferred ?? ''] ?? GATEWAY_KEYS.HDFC;
  const match = gateways.find(g => String(g?.VALUE ?? '').toLowerCase().includes(wanted));
  return (match ?? gateways[0]).ID;
}

export interface RechargeOrder {
  /** Payment page to open for the user to complete payment themselves. */
  paymentUrl: string;
  amount: number;
  caNumber: string;
}

/**
 * Create a recharge order and return the payment-gateway URL.
 *
 * This only registers an unpaid order and hands back where to pay — it never
 * completes a payment. The caller must open `paymentUrl` for the user to finish
 * the transaction themselves.
 */
export async function createRechargeOrder(opts: {
  caNumber: string;
  amount: string | number;
  mobileNumber?: string;
  email?: string;
  gateway?: string;
}): Promise<RechargeOrder> {
  const ca = normaliseCa(opts.caNumber);
  const amount = Math.ceil(Number(opts.amount));
  if (!Number.isFinite(amount) || amount < 100) {
    throw new Error('Minimum recharge amount is ₹100.');
  }

  const [bill, gatewayId] = await Promise.all([fetchBillDetails(ca), fetchGatewayId(opts.gateway)]);

  const response = await callAction({
    email: opts.email || 'NA',
    accno: ca,
    mobile: opts.mobileNumber || 'NA',
    amount,
    scno: ca,
    consid: pick(bill, 'billNo'),
    name: pick(bill, 'name'),
    billid: ca,
    ucode: 'NA',
    officeid: 'NA',
    officeName: 'NA',
    from: 'DASHBOARD',
    paymentType: 'R',
    consType: 'POST',
    gateway: gatewayId,
  }, PG_REQUEST_URL);

  // The portal parses `data` as JSON for form-post gateways and otherwise treats
  // it as a URL to redirect to. Juspay/HDFC returns the plain URL.
  const data = response?.data;
  const paymentUrl = typeof data === 'string' ? data.trim() : '';
  if (!/^https?:\/\//i.test(paymentUrl)) {
    throw new Error('SBPDCL did not return a payment page. Please try the portal directly.');
  }

  return { paymentUrl, amount, caNumber: ca };
}
