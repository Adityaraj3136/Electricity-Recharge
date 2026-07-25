const fs = require('fs');
const lines = fs.readFileSync('src/automation/automation.ts', 'utf-8');
const scriptMatch = lines.match(/export const automationScript = `([\s\S]*?)`;/);
if (scriptMatch) {
  try {
    new Function('window', scriptMatch[1]);
    console.log('Syntax OK in Node');
  } catch (e) {
    console.error('Syntax Error:', e);
  }
}
