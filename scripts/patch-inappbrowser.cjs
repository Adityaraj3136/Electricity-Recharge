const fs = require('fs');
const path = require('path');

const pluginJavaFile = path.join(__dirname, '..', 'node_modules', 'cordova-plugin-inappbrowser', 'src', 'android', 'InAppBrowser.java');

if (!fs.existsSync(pluginJavaFile)) {
  console.log('InAppBrowser.java not found, skipping patch.');
  process.exit(0);
}

let code = fs.readFileSync(pluginJavaFile, 'utf-8');

// Patch 1: shouldOverrideUrlLoading
const search1 = `} else if (url.startsWith("geo:") || url.startsWith(WebView.SCHEME_MAILTO) || url.startsWith("market:") || url.startsWith("intent:")) {
                try {
                    Intent intent = new Intent(Intent.ACTION_VIEW);
                    intent.setData(Uri.parse(url));`;
const replace1 = `} else if (url.startsWith("geo:") || url.startsWith(WebView.SCHEME_MAILTO) || url.startsWith("market:") || url.startsWith("intent:")) {
                try {
                    Intent intent;
                    if (url.startsWith("intent:")) {
                        try { intent = Intent.parseUri(url, Intent.URI_INTENT_SCHEME); }
                        catch (Exception e) { intent = new Intent(Intent.ACTION_VIEW); intent.setData(Uri.parse(url)); }
                    } else {
                        intent = new Intent(Intent.ACTION_VIEW);
                        intent.setData(Uri.parse(url));
                    }
                    intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);`;

if (code.includes(search1)) {
  code = code.replace(search1, replace1);
  console.log('Patched shouldOverrideUrlLoading');
}

// Patch 2: openExternal
const search2 = `            Intent intent = null;
            intent = new Intent(Intent.ACTION_VIEW);
            // Omitting the MIME type for file: URLs causes "No Activity found to handle Intent".
            // Adding the MIME type to http: URLs causes them to not be handled by the downloader.
            Uri uri = Uri.parse(url);`;
const replace2 = `            Intent intent = null;
            if (url.startsWith("intent:")) {
                try { intent = Intent.parseUri(url, Intent.URI_INTENT_SCHEME); }
                catch (Exception e) { intent = new Intent(Intent.ACTION_VIEW); }
            } else {
                intent = new Intent(Intent.ACTION_VIEW);
            }
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            Uri uri = Uri.parse(url);`;

if (code.includes(search2)) {
  code = code.replace(search2, replace2);
  console.log('Patched openExternal');
}

// Patch 3: AllowedSchemes block
const search3 = `                            try {
                                Intent intent = new Intent(Intent.ACTION_VIEW);
                                intent.setData(Uri.parse(url));
                                cordova.getActivity().startActivity(intent);`;
const replace3 = `                            try {
                                Intent intent = new Intent(Intent.ACTION_VIEW);
                                intent.setData(Uri.parse(url));
                                intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                                cordova.getActivity().startActivity(intent);`;

if (code.includes(search3)) {
  code = code.replace(search3, replace3);
  console.log('Patched AllowedSchemes block');
}

fs.writeFileSync(pluginJavaFile, code, 'utf-8');
console.log('Successfully patched InAppBrowser.java');

