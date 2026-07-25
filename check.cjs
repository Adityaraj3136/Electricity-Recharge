const fs = require('fs');
const lines = fs.readFileSync('src/automation/automation.ts', 'utf-8');
const scriptMatch = lines.match(/export const automationScript = `([\s\S]*?)`;/);
if (scriptMatch) {
  try {
    const code = scriptMatch[1];
    new Function('window', code)({});
    console.log('Syntax OK');
  } catch (e) {
    console.error('Syntax Error:', e);
  }
} else {
  console.log('Script not found');
}
