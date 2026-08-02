/**
 * Self-check for the input sanitizers.
 *
 * Both of these guard a real boundary: sanitizeForScript feeds a generated
 * bookmarklet (a javascript: URL the user runs on the SBPDCL portal), and
 * sanitizeImportedConsumer is the only thing between a restored backup file and
 * localStorage.
 *
 * Run: node src/utils/sanitize.test.mjs
 */
import assert from 'node:assert';
import { sanitizeForScript, sanitizeImportedConsumer, sanitizeText, sanitizeNumber } from './sanitize.ts';

const QUOTE = "'";
const BACKSLASH = '\\';

// ── sanitizeForScript ───────────────────────────────────────────────────────

// A line terminator ends a JS string literal even when the quotes around it are
// escaped, so none may survive. U+2028/U+2029 count as terminators to a JS
// parser and slip past filters that only strip ASCII control characters.
// Built from code points on purpose: written as literals, U+2028/U+2029 are
// invisible, and an editor or a copy-paste can quietly turn them into spaces —
// leaving a test that passes without testing anything. That happened here.
const TERMINATORS = [
  ["LF", String.fromCharCode(0x0a)],
  ["CR", String.fromCharCode(0x0d)],
  ["U+2028", String.fromCharCode(0x2028)],
  ["U+2029", String.fromCharCode(0x2029)],
];
for (const [name, ch] of TERMINATORS) {
  assert.strictEqual(ch.length, 1, `${name} fixture is not a single character`);
  assert.ok(!sanitizeForScript(`a${ch}b`).includes(ch), `${name} survived`);
}

// Every quote must come out escaped, so none can close the literal it sits in.
{
  const out = sanitizeForScript(`x${QUOTE});alert(1);//`);
  for (let i = 0; i < out.length; i++) {
    if (out[i] === QUOTE) {
      assert.strictEqual(out[i - 1], BACKSLASH, `unescaped quote at ${i} in ${JSON.stringify(out)}`);
    }
  }
}

// Backslash is escaped first, or the escaping of everything after it is undone.
assert.strictEqual(sanitizeForScript(BACKSLASH), BACKSLASH + BACKSLASH);

// ── sanitizeText / sanitizeNumber ───────────────────────────────────────────

assert.ok(!sanitizeText('<script>alert(1)</script>Home').includes('<'), 'markup stripped');
assert.strictEqual(sanitizeNumber('+91 98765-43210'), '919876543210');

// ── sanitizeImportedConsumer ────────────────────────────────────────────────

// A backup file is untrusted: hand-editable, and possibly from someone else.
assert.strictEqual(sanitizeImportedConsumer(null), null);
assert.strictEqual(sanitizeImportedConsumer('nope'), null);
assert.strictEqual(sanitizeImportedConsumer([]), null);
assert.strictEqual(sanitizeImportedConsumer({ name: 'no ca number' }), null, 'entry without a CA is unusable');

{
  const ok = sanitizeImportedConsumer({
    id: 'attacker-chosen-id',
    name: 'Home <script>x</script>',
    caNumber: '2333-000-7524',
    mobileNumber: '+91 98765 43210',
    preferredGateway: 'EvilPay',
    lastFetchedAt: 'not-a-number',
    extraField: 'should not survive',
  });
  assert.strictEqual(ok.caNumber, '23330007524', 'CA reduced to digits');
  assert.ok(!ok.name.includes('<script'), 'markup stripped from name');
  // Taking the id from the file would let a crafted backup overwrite a meter
  // the user already had saved.
  assert.notStrictEqual(ok.id, 'attacker-chosen-id', 'id must be regenerated');
  assert.strictEqual(ok.preferredGateway, undefined, 'unknown gateway rejected');
  assert.strictEqual(ok.lastFetchedAt, undefined, 'non-numeric timestamp rejected');
  assert.ok(!('extraField' in ok), 'unknown keys dropped');
}

// A well-formed entry survives intact.
{
  const ok = sanitizeImportedConsumer({
    name: 'Papa', caNumber: '23330007524', preferredGateway: 'HDFC', lastFetchedAt: 1754000000000,
  });
  assert.strictEqual(ok.name, 'Papa');
  assert.strictEqual(ok.preferredGateway, 'HDFC');
  assert.strictEqual(ok.lastFetchedAt, 1754000000000);
}

console.log('sanitize: all assertions passed');
