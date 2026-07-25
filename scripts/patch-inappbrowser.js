const fs = require('fs');
const path = require('path');

const pluginJavaFile = path.join(__dirname, '..', 'node_modules', 'cordova-plugin-inappbrowser', 'src', 'android', 'InAppBrowser.java');

if (!fs.existsSync(pluginJavaFile)) {
  console.log('InAppBrowser.java not found, skipping patch.');
  process.exit(0);
}

let code = fs.readFileSync(pluginJavaFile, 'utf-8');

const targetStr = `Intent intent = new Intent(Intent.ACTION_VIEW);
                    intent.setData(Uri.parse(url));`;

const replacementStr = `Intent intent;
                    if (url.startsWith("intent:")) {
                        try {
                            intent = Intent.parseUri(url, Intent.URI_INTENT_SCHEME);
                        } catch (java.net.URISyntaxException e) {
                            intent = new Intent(Intent.ACTION_VIEW);
                            intent.setData(Uri.parse(url));
                        }
                    } else {
                        intent = new Intent(Intent.ACTION_VIEW);
                        intent.setData(Uri.parse(url));
                    }`;

if (code.includes('Intent.parseUri(url, Intent.URI_INTENT_SCHEME)')) {
  console.log('InAppBrowser already patched.');
} else {
  const searchStr = `} else if (url.startsWith("geo:") || url.startsWith(WebView.SCHEME_MAILTO) || url.startsWith("market:") || url.startsWith("intent:")) {
                try {
                    Intent intent = new Intent(Intent.ACTION_VIEW);
                    intent.setData(Uri.parse(url));`;
                    
  const replaceWithStr = `} else if (url.startsWith("geo:") || url.startsWith(WebView.SCHEME_MAILTO) || url.startsWith("market:") || url.startsWith("intent:")) {
                try {
${replacementStr}`;

  if (code.includes(searchStr)) {
    code = code.replace(searchStr, replaceWithStr);
    fs.writeFileSync(pluginJavaFile, code, 'utf-8');
    console.log('Successfully patched InAppBrowser.java');
  } else {
    console.log('Could not find target string to patch in InAppBrowser.java');
  }
}
