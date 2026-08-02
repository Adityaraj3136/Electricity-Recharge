/**
 * Input sanitization utilities to prevent XSS, SQL injection, and script injection.
 * Applied to all user-supplied inputs before they are stored or used in automation.
 */

/** Strips HTML tags, script blocks, and SQL injection patterns */
export function sanitizeText(input: string): string {
  if (!input) return '';
  return input
    // Remove HTML/script tags
    .replace(/<[^>]*>/g, '')
    // Remove SQL injection patterns
    .replace(/(['";])/g, '')
    .replace(/\b(SELECT|INSERT|UPDATE|DELETE|DROP|CREATE|ALTER|EXEC|EXECUTE|UNION|SCRIPT|JAVASCRIPT|VBSCRIPT|ONLOAD|ONERROR)\b/gi, '')
    // Remove path traversal
    .replace(/\.\.\//g, '')
    .replace(/\.\.\\/g, '')
    // Remove null bytes
    .replace(/\0/g, '')
    // Trim whitespace
    .trim()
    // Limit length
    .slice(0, 100);
}

/** Strips everything except digits — for CA Number, Mobile Number, Amount */
export function sanitizeNumber(input: string): string {
  if (!input) return '';
  return input.replace(/[^0-9]/g, '').slice(0, 20);
}

/** Sanitizes a value for safe string interpolation inside a JS template literal */
export function sanitizeForScript(input: string): string {
  if (!input) return '';
  return input
    .replace(/\\/g, '\\\\')
    .replace(/`/g, '\\`')
    .replace(/\$/g, '\\$')
    .replace(/'/g, "\\'")
    .replace(/"/g, '\\"')
    .replace(/<script/gi, '')
    .replace(/javascript:/gi, '')
    // Line terminators end a JS string literal even when the quotes are
    // escaped, so an unescaped newline breaks out of the surrounding string.
    // U+2028/U+2029 count as terminators to a JS parser too, and survive most
    // "strip the control characters" filters because they are not control
    // characters.
    .replace(/[\r\n\u2028\u2029]/g, ' ')
    .trim()
    .slice(0, 100);
}


/**
 * Coerce one entry of a restored backup into a Consumer we are willing to store.
 *
 * A backup file is user-supplied input from outside the app, and the importer
 * previously wrote whatever the file contained straight into storage. Fields are
 * whitelisted and re-sanitised here so a hand-edited file cannot smuggle extra
 * keys, oversized strings, or values that later reach the bookmarklet generator.
 *
 * Returns null for anything unusable, so the caller can count what it dropped
 * rather than silently storing junk.
 */
export function sanitizeImportedConsumer(raw: unknown): {
  id: string; name: string; caNumber: string;
  mobileNumber?: string; preferredAmount?: string; preferredGateway?: string;
  lastFetchedBalance?: string; lastFetchedDate?: string; lastFetchedAt?: number;
  currentStatus?: string;
} | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const r = raw as Record<string, unknown>;

  const text = (v: unknown) => (typeof v === 'string' || typeof v === 'number' ? sanitizeText(String(v)) : '');
  const digits = (v: unknown) => (typeof v === 'string' || typeof v === 'number' ? sanitizeNumber(String(v)) : '');

  const caNumber = digits(r.caNumber);
  const name = text(r.name);
  // A meter without a CA number cannot be used for anything.
  if (!caNumber) return null;

  const GATEWAYS = ['Bank of Baroda', 'Easebuzz', 'HDFC', 'Federal Bank'];
  const gateway = typeof r.preferredGateway === 'string' && GATEWAYS.includes(r.preferredGateway)
    ? r.preferredGateway
    : undefined;

  const fetchedAt = typeof r.lastFetchedAt === 'number' && Number.isFinite(r.lastFetchedAt)
    ? r.lastFetchedAt
    : undefined;

  return {
    // Never trust an id from a file: a duplicate would overwrite a saved meter.
    id: crypto.randomUUID(),
    name: name || `Meter ${caNumber.slice(-4)}`,
    caNumber,
    mobileNumber: digits(r.mobileNumber) || undefined,
    preferredAmount: digits(r.preferredAmount) || undefined,
    preferredGateway: gateway,
    lastFetchedBalance: text(r.lastFetchedBalance) || undefined,
    lastFetchedDate: text(r.lastFetchedDate) || undefined,
    lastFetchedAt: fetchedAt,
    currentStatus: text(r.currentStatus) || undefined,
  };
}
