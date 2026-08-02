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

// ── Patches 4 & 5: survive a missing UPI app ────────────────────────────────
// Both intent branches above catch ActivityNotFoundException but leave
// `override` false, so shouldOverrideUrlLoading returns false and the WebView
// tries to load "upi://..." itself — replacing the live payment page with an
// ERR_UNKNOWN_URL_SCHEME error and losing the payment session.
// Always claim the URL, use the intent's browser_fallback_url when it has one,
// and tell the user which app is missing instead of failing silently.
// These run against the output of patches 1-3, so they are idempotent.

const TOAST = (msg) => `cordova.getActivity().runOnUiThread(new Runnable() {
                                    public void run() {
                                        android.widget.Toast.makeText(cordova.getActivity(), ${msg}, android.widget.Toast.LENGTH_LONG).show();
                                    }
                                });`;

const search4 = `                } catch (android.content.ActivityNotFoundException e) {
                    LOG.e(LOG_TAG, "Error with " + url + ": " + e.toString());
                }`;
const replace4 = `                } catch (android.content.ActivityNotFoundException e) {
                    // Claim the URL regardless: letting the WebView handle a custom
                    // scheme it cannot load would wipe out the payment page.
                    override = true;
                    String fallbackUrl = null;
                    if (url.startsWith("intent:")) {
                        try {
                            fallbackUrl = Intent.parseUri(url, Intent.URI_INTENT_SCHEME)
                                    .getStringExtra("browser_fallback_url");
                        } catch (Exception ignored) { }
                    }
                    if (fallbackUrl != null && !fallbackUrl.isEmpty()) {
                        // This overload has no WebView parameter; use the outer
                        // class's instance, and load on the UI thread.
                        final String fallbackTarget = fallbackUrl;
                        cordova.getActivity().runOnUiThread(new Runnable() {
                            public void run() {
                                if (inAppWebView != null) inAppWebView.loadUrl(fallbackTarget);
                            }
                        });
                    } else {
                        ${TOAST('"That app isn\'t installed. Pick another payment method."')}
                    }
                    LOG.e(LOG_TAG, "Error with " + url + ": " + e.toString());
                }`;

if (code.includes(replace4)) {
  console.log('Missing-app fallback (intent branch) already patched');
} else if (code.includes(search4)) {
  code = code.replace(search4, replace4);
  console.log('Patched missing-app fallback in intent branch');
} else {
  console.log('WARNING: could not patch missing-app fallback in intent branch');
}

const search5 = `                            } catch (android.content.ActivityNotFoundException e) {
                                LOG.e(LOG_TAG, "UPI app not found for scheme: " + url + " : " + e.toString());
                            }`;
const replace5 = `                            } catch (android.content.ActivityNotFoundException e) {
                                // See above: never hand an unlaunchable scheme back
                                // to the WebView.
                                override = true;
                                ${TOAST('"That payment app isn\'t installed."')}
                                LOG.e(LOG_TAG, "UPI app not found for scheme: " + url + " : " + e.toString());
                            }`;

if (code.includes(replace5)) {
  console.log('Missing-app fallback (allowedSchemes) already patched');
} else if (code.includes(search5)) {
  code = code.replace(search5, replace5);
  console.log('Patched missing-app fallback in allowedSchemes block');
} else {
  console.log('WARNING: could not patch missing-app fallback in allowedSchemes block');
}

// Repair an earlier revision of patch 4 that called view.loadUrl(): this
// overload of shouldOverrideUrlLoading has no WebView parameter, so that did
// not compile.
const brokenFallback = `                        view.loadUrl(fallbackUrl);`;
const fixedFallback = `                        final String fallbackTarget = fallbackUrl;
                        cordova.getActivity().runOnUiThread(new Runnable() {
                            public void run() {
                                if (inAppWebView != null) inAppWebView.loadUrl(fallbackTarget);
                            }
                        });`;
if (code.includes(brokenFallback)) {
  code = code.replace(brokenFallback, fixedFallback);
  console.log('Repaired fallback-URL call to use inAppWebView on the UI thread');
}

fs.writeFileSync(pluginJavaFile, code, 'utf-8');
console.log('Successfully patched InAppBrowser.java');
