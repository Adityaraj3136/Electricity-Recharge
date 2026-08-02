var fs=require('fs');  
var src=fs.readFileSync('src/automation/automation.ts','utf8');  
var re=/export const automationScript = ([\s\S]*);\s*$/;  
console.log(re.toString());  
