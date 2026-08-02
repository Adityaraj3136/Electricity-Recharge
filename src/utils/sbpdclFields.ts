/**
 * Pure field-reading helpers for the SBPDCL JSON responses.
 *
 * Kept free of imports so Node can run them directly under test — `sbpdclApi.ts`
 * pulls in jsencrypt, which will not resolve as ESM outside a bundler.
 */

/**
 * Case- and separator-insensitive field lookup, since key casing varies by endpoint.
 * The AMISP endpoints write "-" where they have no value, so that is treated as
 * absent — otherwise a literal dash reaches the UI as if it were a balance.
 */
export function pick(source: any, ...names: string[]): string {
  if (!source || typeof source !== 'object') return '';
  const normalise = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
  const entries = Object.entries(source);
  for (const name of names) {
    const target = normalise(name);
    const hit = entries.find(([key]) => normalise(key) === target);
    if (hit == null || hit[1] == null) continue;
    const value = String(hit[1]).trim();
    if (value !== '' && value !== '-') return value;
  }
  return '';
}

/**
 * Turn a failed consumer lookup into something a person can act on.
 *
 * The service reports failure in two registers at once: a sentence in `message`
 * ("CA number does not exists") and a status token in `status` ("F"). Reading
 * `status` first surfaced a bare "F" as the entire error text, which tells the
 * user nothing. Prefer the sentence, and discard the tokens outright — they are
 * protocol, not prose.
 */
const STATUS_TOKEN = /^(f|s|e|failure|success|error|fail)$/i;

export function lookupErrorMessage(bill: any): string {
  const reason = pick(bill, 'message', 'error', 'status');
  if (!reason || STATUS_TOKEN.test(reason)) return 'No consumer found for this CA number.';
  return reason;
}

/**
 * Render a raw amount as rupees.
 *
 * Prepaid meters go negative once they overdraw, and the sign belongs outside
 * the symbol: "-₹50.25", not "₹-50.25". Everything downstream already assumes
 * that form — the low-balance check strips to `[0-9.-]` and parses, and the
 * modal colours the row red on a "-" — so keeping the minus leading is what
 * makes an overdrawn meter read correctly rather than as a large credit.
 */
export function formatRupees(value: string): string {
  if (!value) return '';
  const amount = parseFloat(String(value).replace(/[^0-9.-]/g, ''));
  if (isNaN(amount)) return value;
  return `${amount < 0 ? '-' : ''}₹${Math.abs(amount).toFixed(2)}`;
}

/**
 * Choose which of the two responses actually carries the meter's balance.
 *
 * The live reading comes from the AMISP's `current_balance`. `fetchBillDetails`
 * also has a `prepaidBalance`, but that is a *billing* figure that reads 0 on
 * every prepaid connection — taking it at face value is what made the app report
 * ₹0.00 for meters that were not empty.
 *
 * So the bill figure is accepted only when non-zero. When neither source has a
 * number this returns '' and the caller reports the balance as unavailable,
 * rather than showing a confident ₹0.00 that would push someone into recharging
 * a meter that is already topped up.
 */
export function selectBalance(prepaid: any, bill: any): string {
  const live = pick(prepaid, 'current_balance');
  if (live) return live;

  const billBalance = pick(bill, 'prepaidBalance', 'availableBalance', 'AVAIL_BALANCE');
  return parseFloat(billBalance) ? billBalance : '';
}
