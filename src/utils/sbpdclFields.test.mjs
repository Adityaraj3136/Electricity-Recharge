/**
 * Self-check for how a balance is read out of the SBPDCL responses.
 *
 * The regression this guards: the app used to read `prepaidBalance` off the bill,
 * which is 0 on every prepaid connection, so every meter showed ₹0.00.
 * Run: node src/utils/sbpdclFields.test.mjs
 */
import assert from 'node:assert';
import { pick, selectBalance } from './sbpdclFields.ts';

// Real shapes, captured from CA 23330007524.
const BILL = {
  scno: '23330007524', name: 'REDACTED', vendor: 'GENUS',
  consumerType: 'Prepaid', prepaidBalance: 0, outStandingAmt: 0,
  amountPayble: 100, billNo: '20260723330007524', message: 'SUCCESS',
};
const AMISP_NO_READING = {
  consumer_id: '-', asOnDate: '-', vendor: 'GENUS', connection_status: '-',
  current_balance: '-', lastRechargeDate: '2026-08-02 21:58:54.0', lastRechargeAmount: '100',
};
const AMISP_LIVE = { ...AMISP_NO_READING, current_balance: '247.65', connection_status: 'Live' };

// pick treats the AMISP's "-" placeholder as absent, not as a value.
assert.strictEqual(pick(AMISP_NO_READING, 'current_balance'), '');
assert.strictEqual(pick(AMISP_NO_READING, 'connection_status'), '');
assert.strictEqual(pick(AMISP_LIVE, 'current_balance'), '247.65');

// Key casing and separators vary between endpoints.
assert.strictEqual(pick({ AVAIL_BALANCE: '12.5' }, 'availBalance'), '12.5');
assert.strictEqual(pick({ current_balance: '0' }, 'current_balance'), '0', 'a real 0 reading survives');

// The live AMISP reading wins outright.
assert.strictEqual(selectBalance(AMISP_LIVE, BILL), '247.65');

// No live reading + the bill's prepaid 0 must NOT become a confident ₹0.00.
assert.strictEqual(selectBalance(AMISP_NO_READING, BILL), '');
assert.strictEqual(selectBalance(null, BILL), '');

// A non-zero bill figure is still a usable fallback (postpaid / older records).
assert.strictEqual(selectBalance(null, { availableBalance: '340.00' }), '340.00');
assert.strictEqual(selectBalance(AMISP_NO_READING, { prepaidBalance: 512 }), '512');

console.log('sbpdclFields: all assertions passed');
