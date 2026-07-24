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
    .trim()
    .slice(0, 100);
}
