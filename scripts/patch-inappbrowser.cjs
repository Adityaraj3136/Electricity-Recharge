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
            Uri uri = Uri.parse(url);
            if ("file".equals(uri.getScheme())) {
                intent.setDataAndType(uri, webView.getResourceApi().getMimeType(uri));
            } else {
                intent.setData(uri);
            }`;
const replace2 = `            Intent intent = null;
            Uri uri = Uri.parse(url);
            if (url.startsWith("intent:")) {
                try {
                    intent = Intent.parseUri(url, Intent.URI_INTENT_SCHEME);
                } catch (Exception e) {
                    intent = new Intent(Intent.ACTION_VIEW);
                    intent.setData(uri);
                }
            } else {
                intent = new Intent(Intent.ACTION_VIEW);
                if ("file".equals(uri.getScheme())) {
                    intent.setDataAndType(uri, webView.getResourceApi().getMimeType(uri));
                } else {
                    intent.setData(uri);
                }
            }
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);`;

if (code.includes(search2)) {
  code = code.replace(search2, replace2);
  console.log('Patched openExternal');
} else {
  console.log('Could not find search2 in openExternal (might be already patched improperly)');
}

// Patch 3: AllowedSchemes block - launch UPI app via Intent instead of firing JS event
const search3 = `                    for (String scheme : allowedSchemes) {
                        if (url.startsWith(scheme)) {
                            try {
                                JSONObject obj = new JSONObject();
                                obj.put("type", "customscheme");
                                obj.put("url", url);
                                sendUpdate(obj, true);
                                override = true;
                            } catch (JSONException ex) {
                                LOG.e(LOG_TAG, "Custom Scheme URI passed in has caused a JSON error.");
                            }
                        }
                    }`;
const replace3 = `                    for (String scheme : allowedSchemes) {
                        if (url.startsWith(scheme)) {
                            try {
                                Intent intent = new Intent(Intent.ACTION_VIEW);
                                intent.setData(Uri.parse(url));
                                intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                                cordova.getActivity().startActivity(intent);
                                override = true;
                            } catch (android.content.ActivityNotFoundException e) {
                                LOG.e(LOG_TAG, "UPI app not found for scheme: " + url + " : " + e.toString());
                            }
                        }
                    }`;

if (code.includes(search3)) {
  code = code.replace(search3, replace3);
  console.log('Patched AllowedSchemes block to launch Intent');
} else {
  console.log('AllowedSchemes block already patched or not found');
}

fs.writeFileSync(pluginJavaFile, code, 'utf-8');
console.log('Successfully patched InAppBrowser.java');
