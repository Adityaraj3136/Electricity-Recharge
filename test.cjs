const { readFileSync } = require('fs');

async function run() {
  const code = readFileSync('src/automation/automation.ts', 'utf-8');
  const match = code.match(/export const automationScript = `([\s\S]*?)`;/);
  if (!match) {
    console.error('Could not extract script');
    return;
  }
  const scriptText = match[1];
  try {
    new Function('window', scriptText);
    console.log('ALL GOOD! SYTAX IS VALID.');
  } catch(e) {
    console.error('SYNTAX ERROR:', e);
  }
}
run();
