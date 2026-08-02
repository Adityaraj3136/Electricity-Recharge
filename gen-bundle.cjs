// Generator: reads automation.ts and writes public/sbpdcl-automation.js
// Run with: node gen-bundle.cjs
const fs = require('fs');
const path = require('path');

const src = fs.readFileSync(path.join('src', 'automation', 'automation.ts'), 'utf8');

// Extract the IIFE content between the opening backtick+newline and closing newline+backtick
const startMark = '`\n';
const endMark = '\n`';
const startIdx = src.indexOf(startMark) + startMark.length;
const endIdx = src.lastIndexOf(endMark);
let iife = src.slice(startIdx, endIdx);

// Add a progress toast helper (injected before the MAIN section)
const toastHelper = [
  '',
  '  // ── Progress toast for PC bookmarklet users ────────────────────────────',
  '  function _showToast(msg, isErr) {',
  "    var t = document.getElementById('_bijli_bm_toast');",
  '    if (!t) {',
  '      t = document.createElement(\'div\');',
  "      t.id = '_bijli_bm_toast';",
  "      t.style.cssText = 'position:fixed;top:14px;left:50%;transform:translateX(-50%);background:#0f172a;border:2px solid #2563eb;color:#e2e8f0;padding:10px 22px;border-radius:99px;z-index:2147483647;font:600 13px/1.4 -apple-system,sans-serif;box-shadow:0 8px 32px rgba(0,0,0,.5);pointer-events:none;transition:opacity .3s;white-space:nowrap;max-width:90vw;text-align:center';",
  '      document.body.appendChild(t);',
  '    }',
  "    t.style.borderColor = isErr ? '#dc2626' : '#2563eb';",
  "    t.textContent = (isErr ? '\\u274c ' : '\\u26a1 ') + msg;",
  "    t.style.opacity = '1';",
  '    clearTimeout(t._timer);',
  '    t._timer = setTimeout(function(){ t.style.opacity=\'0\'; }, isErr ? 8000 : 5000);',
  '  }',
  '',
].join('\n');

// Inject toast helper before the MAIN section
const mainMarker = '  // \u2500\u2500 MAIN \u2500\u2500';
iife = iife.replace(mainMarker, toastHelper + '\n' + mainMarker);

// Replace SBPDCL_PROGRESS postMessage calls with _showToast calls
iife = iife.replace(
  /window\.postMessage\(\s*\{\s*type:\s*'SBPDCL_PROGRESS',\s*step:\s*'([^']+)'\s*\}\s*,\s*'\*'\s*\);/g,
  (_, step) => "_showToast('" + step + "\u2026');"
);

// For error postMessage, also show toast
iife = iife.replace(
  /window\.postMessage\(\s*\{\s*type:\s*'SBPDCL_ERROR',\s*error:\s*(error\.message)\s*\}\s*,\s*'\*'\s*\);/g,
  (_, errVar) => "_showToast(" + errVar + ", true);\n      window.postMessage({ type: 'SBPDCL_ERROR', error: " + errVar + " }, '*');"
);

const header = [
  '/**',
  ' * SBPDCL Automation Script — standalone bundle for PC bookmarklet use.',
  ' * Loaded by bookmarklets from GitHub Pages. Safe to load cross-origin.',
  ' * Auto-derived from src/automation/automation.ts — do not edit directly.',
  ' * Regenerate: node gen-bundle.cjs',
  ' */',
  '',
].join('\n');

const outPath = path.join('public', 'sbpdcl-automation.js');
fs.writeFileSync(outPath, header + iife);
console.log('[gen-bundle] Written:', outPath, '(' + (header + iife).length + ' bytes)');
