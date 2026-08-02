# Bijli Recharge — Smart Bihar Electricity Recharge (SBPDCL)

Manage and recharge prepaid electricity meters for **SBPDCL** (South Bihar Power
Distribution Company). One codebase ships an Android app and a web/PWA.

**This file is the complete handover document.** It is written so that a person or an
AI agent with no prior context can build, test, release and extend this project from
scratch. Everything non-obvious — the reverse-engineered utility API, the payment
quirks, the signing setup — is documented here.

---

## Table of contents

1. [What it does](#1-what-it-does)
2. [Tech stack](#2-tech-stack)
3. [Architecture & data flow](#3-architecture--data-flow)
4. [The SBPDCL API (reverse-engineered)](#4-the-sbpdcl-api-reverse-engineered)
5. [Workflow: balance check](#5-workflow-balance-check)
6. [Workflow: recharge & payment](#6-workflow-recharge--payment)
7. [Workflow: local development](#7-workflow-local-development)
8. [Workflow: building the Android APK](#8-workflow-building-the-android-apk)
9. [Workflow: signing & release](#9-workflow-signing--release)
10. [Workflow: CI/CD](#10-workflow-cicd)
11. [Workflow: testing](#11-workflow-testing)
12. [Credentials & secrets](#12-credentials--secrets)
13. [Project structure](#13-project-structure)
14. [Security posture](#14-security-posture)
15. [Error codes](#15-error-codes)
16. [Known gotchas](#16-known-gotchas)
17. [Tech debt & next steps](#17-tech-debt--next-steps)

---

## 1. What it does

- Save multiple meters (CA numbers) for a family.
- **Check balance** — live, from SBPDCL, in ~1–2 seconds.
- **Auto-sync** — balances refresh 2s after launch and every 30 minutes.
- **Recharge** — the app registers the payment order and hands you straight to the
  bank's payment page. *You* complete the payment; the app never handles card, UPI PIN
  or bank credentials.
- **Low-balance alert** — a local notification when a meter drops below ₹100.
- English/Hindi, dark mode, biometric app lock, pull-to-refresh.

| Target | Output | Where it goes |
|---|---|---|
| Android | `app-release.apk` | GitHub Actions artifact |
| Web / PWA | static `dist/` | GitHub Pages |

There is **no backend of our own**. The app talks directly to SBPDCL's servers.

---

## 2. Tech stack

| Layer | Choice | Version |
|---|---|---|
| UI | React + TypeScript | 19 · 6.0 |
| Build | Vite | 8.1 |
| Styling | Tailwind CSS | 4.3 |
| Icons | lucide-react | 1.26 |
| Mobile shell | Capacitor | 8.4 |
| Crypto (API envelope) | `crypto-js`, `jsencrypt` | 4.2 · 3.5 |
| Lint | oxlint | 1.71 |
| CI | GitHub Actions | — |

**Native plugins**

| Plugin | Used for |
|---|---|
| `cordova-plugin-inappbrowser` | Payment window on Android (**patched** — see §8) |
| `@capacitor/local-notifications` | Low-balance alerts |
| `@capacitor/network` | Offline detection |
| `@capgo/capacitor-native-biometric` | App lock |
| `@capacitor/app` | Lifecycle events |
| `@capawesome/capacitor-background-task` | Keep sync alive when backgrounded |

**Build toolchain**

| Component | Version |
|---|---|
| JDK | **21 required** (Capacitor 8 targets Java 21; JDK 17 fails with `invalid source release: 21`) |
| Gradle / AGP | 8.14.3 · 8.13.0 |
| compileSdk / targetSdk / minSdk | 36 · 36 · 24 |
| Node | 20+ (CI uses 22 for the APK, 20 for Pages) |

Storage is plain `localStorage` (`src/storage/index.ts`) — key `sbpdcl_consumers`.

---

## 3. Architecture & data flow

```
┌─────────────────────────────────────────────┐
│ React UI  (src/pages/Home.tsx)              │
└───────────────┬─────────────────────────────┘
                │
      ┌─────────▼──────────┐
      │ src/utils/         │   AES + RSA envelope, all API calls
      │   sbpdclApi.ts     │   (lazy-loaded chunk, ~44 KB gzip)
      └─────────┬──────────┘
                │  HTTPS, Content-Type: text/plain
      ┌─────────▼──────────────────────────────┐
      │ wss.sbpdcl.co.in  (utility servers)    │
      └────────────────────────────────────────┘
```

**Balance is platform-independent.** The API is reachable from a normal browser *and*
from the Capacitor WebView (origin `https://localhost`), so there is no platform branch.

**Only the payment window differs**, because a bank's payment page cannot be embedded:

| Platform | Payment page opens in |
|---|---|
| Android | `InAppBrowser`, directly on the gateway URL |
| Web | popup window (≥900px wide) |

> **Historical note.** Balance and recharge used to be DOM automation — a hidden
> `InAppBrowser` that injected a script, filled the portal's form and scraped the
> result. That is gone. `src/automation/automation.ts` survives only to power the
> optional PC bookmarklet. If you read older docs or comments describing form-filling,
> they are stale.

---

## 4. The SBPDCL API (reverse-engineered)

None of this is documented by the utility. It was recovered from their Angular bundle
and verified against live endpoints. **It can change without notice — if balance or
recharge breaks, start here.**

Only the **public guest flow** is used: every endpoint below needs nothing but a CA
number. There is no login, account or API key.

### 4.1 Base URL and endpoints

```
https://wss.sbpdcl.co.in/fgweb/web/
```

| Purpose | Path (append to base) |
|---|---|
| Bootstrap config → returns RSA public key | `json/plugin/com.fluentgrid.cp.api.CPCommonConfigService/service` |
| Data / integrations | `json/plugin/com.fluentgrid.cp.api.SpmIntegrationsData/service` |
| Create payment order | `json/plugin/com.fluentgrid.cp.api.PGRequestService/service` |
| Gateway return target (set server-side) | `json/plugin/com.fluentgrid.cp.api.PGResponseService/service` |

### 4.2 The request envelope

Every request body is encrypted, mirroring the portal's own `encryptAES`:

**Layer 1 — bootstrap call only.** AES with a static passphrase, CryptoJS/OpenSSL
`Salted__` format. Body is the **raw base64 string**, not JSON-quoted.
Passphrase: `fgwebcp@2020` — this is SBPDCL's own constant from their public JS bundle,
not our secret. It returns `{ enc: "<RSA public key>" , ... }`.

**Layer 2 — everything else.** Generate a random AES-256-CBC key; encrypt the payload
with it; RSA-encrypt the key (as a hex string) with the public key from layer 1. Send:

```json
{ "encryptedKey": "<base64>", "payload": "<base64>", "iv": "<hex>" }
```

> ### Content-Type must be `text/plain`
> `text/plain` is CORS-safelisted, so the browser sends **no preflight**. The server
> reflects `Access-Control-Allow-Origin` but omits `content-type` from
> `Access-Control-Allow-Headers`, so an `application/json` request fails preflight in a
> real browser with:
> `Request header field content-type is not allowed by Access-Control-Allow-Headers`.
> **curl does not preflight**, so this passes in a terminal and fails in the app — easy
> to lose hours to.

### 4.3 Actions

```jsonc
// Balance + full consumer record — one call
{ "action": "fgexternal/rest/fetchBillDetails/", "method": "POST",
  "req": { "scno": "<CA>" }, "auth": "TOKEN", "baseUrlName": "", "reqType": "CISENC" }

// Last recharge date / amount
{ "action": "fgexternal/rest/payment/transactionData", "method": "POST",
  "req": { "scno": "<CA>" }, "auth": "TOKEN", "baseUrlName": "" }

// Payment gateway list — bootstrap-encrypted, sent to the CONFIG endpoint
{ "action": "getPaymentGatewayList", "type": "R" }
```

**Create a recharge order** → `PGRequestService`. No `action` key; the payload is bare:

```jsonc
{ "email": "NA", "accno": "<CA>", "mobile": "<10-digit>", "amount": 100,
  "scno": "<CA>", "consid": "<billNo from fetchBillDetails>", "name": "<consumer name>",
  "billid": "<CA>", "ucode": "NA", "officeid": "NA", "officeName": "NA",
  "from": "DASHBOARD", "paymentType": "R", "consType": "POST", "gateway": "<gateway ID>" }
```

Response `data` is a plain URL string — the payment page to open.

### 4.4 Response shapes and traps

- Wrapped as `[{ data, status }]`. Account data nests **again** under `ConsumerData[0]`.
- Balance field is `AVAIL_BALANCE` or `prepaidBalance` — **not** `availableBalance`.
- CA number is `scno`. Vendor is `vendor` / `amispName`.
- An unknown CA returns **HTTP 200** with a status message, not an error status.
- Gateway IDs are server-assigned UUIDs and are **not stable** — always fetch the list.
  Current gateway values: `bbaroda`, `easebuzz`, `hdfcV2`.

---

## 5. Workflow: balance check

Same code path on web and native — `Home.fetchBalanceDetails()`.

1. Check connectivity (`@capacitor/network`); bail with a toast if offline.
2. Open the modal and immediately show the **cached** balance, so it is never empty.
3. Lazy-import `sbpdclApi` and call `fetchBalanceFromApi(caNumber)`, which runs
   `fetchBillDetails` and `transactionData` in parallel.
4. Replace the cached value in place; write to `localStorage`; update the meter card.
5. Fire a low-balance notification if the balance is under ₹100 and alerts are enabled.

**On failure the modal stays open.** With a cached balance it keeps showing it plus a
"last saved" notice; with none it shows "Balance unavailable". Closing the modal on
error would throw away the last known balance and leave only a toast to explain the
disappearance.

**Auto-sync** (`Home.tsx`) runs 2s after meters load, then every 30 minutes. The initial
run is keyed on `consumers` rather than `[]` — meters arrive from storage a render after
mount, so an empty-deps effect captures an empty list and silently never syncs.

---

## 6. Workflow: recharge & payment

> The app **never** submits payment details. It creates an order and opens the bank's
> page. The user pays there.

1. User picks an amount (minimum ₹100) and taps **Proceed to Pay**.
2. `createRechargeOrder()` fetches `fetchBillDetails` (for `billNo`) and the gateway
   list in parallel, then POSTs the order to `PGRequestService`.
3. The returned URL is opened:
   - **Web** — a popup opened *synchronously* on the click (or the popup blocker kills
     it) and navigated once the URL arrives.
   - **Native** — `InAppBrowser` directly on the gateway URL.
4. User pays. On Android, tapping a UPI app hands off to it via
   `src/utils/paymentWindowRouting.ts` → `InAppBrowser.open(url, '_system')`.
5. The gateway redirects to `PGResponseService`, which returns an **empty body** →
   a blank white page (see §16).
6. The window closes — automatically on native, or via the in-app
   **"I've finished — check my balance"** button on web.
7. The app re-reads the balance and compares it to the value captured *before* payment:

| Outcome | Message |
|---|---|
| Balance changed | "Recharge confirmed — balance is now ₹X" |
| Unchanged | "Balance unchanged (₹X). If you paid, it can take a few minutes. If you cancelled, nothing was charged." |
| API unreachable | "Could not confirm the payment." |

**A changed balance is the only proof of payment.** Returning to an SBPDCL URL is *not*
— cancellations and failures redirect there too. Never label the return as success.

---

## 7. Workflow: local development

```bash
npm install          # postinstall patches cordova-plugin-inappbrowser (see §8)
npm run dev          # Vite dev server, http://localhost:5173
npm run build        # tsc -b && vite build  ->  dist/
npm run lint         # oxlint
```

To exercise a real meter in the browser, seed one via DevTools:

```js
localStorage.setItem('onboarding_done_v1','true');
localStorage.setItem('sbpdcl_consumers', JSON.stringify([{
  id:'m1', name:'Test Meter', caNumber:'<CA>', mobileNumber:'<10-digit>',
  preferredAmount:'500', preferredGateway:'HDFC' }]));
```

---

## 8. Workflow: building the Android APK

### Prerequisites

- **JDK 21** — mandatory.
- Android SDK with `platforms;android-36`, `build-tools;36.0.0`, `platform-tools`.
- `android/local.properties` containing `sdk.dir=C:/path/to/Android/Sdk`.
  Use **forward slashes**: backslashes break the Java properties parser and produce
  `The filename, directory name, or volume label syntax is incorrect`.

### Build

```bash
npm run build               # web assets first — cap sync copies dist/
npx cap sync android        # copies dist/ + plugins into android/
cd android
./gradlew assembleDebug     # -> app/build/outputs/apk/debug/app-debug.apk
./gradlew assembleRelease   # -> app-release.apk (signed) or app-release-unsigned.apk
```

Windows PowerShell equivalent:

```powershell
$env:JAVA_HOME="C:\path\to\jdk-21"; $env:ANDROID_HOME="C:\path\to\Android\Sdk"
$env:PATH="$env:JAVA_HOME\bin;$env:PATH"
.\gradlew.bat assembleRelease --no-daemon
```

### The InAppBrowser patch — do not skip

`scripts/patch-inappbrowser.cjs` runs on `postinstall` and rewrites the Cordova plugin's
Java source. **Without it UPI handoff is broken.** It makes four changes:

1. `intent:` URLs parsed with `Intent.parseUri(url, Intent.URI_INTENT_SCHEME)` instead
   of a plain `ACTION_VIEW`, which cannot handle them.
2. Same fix in `openExternal`, plus `FLAG_ACTIVITY_NEW_TASK`.
3. Allowed custom schemes launched natively instead of firing a JS event.
4. **A missing UPI app no longer destroys the payment session.** `ActivityNotFoundException`
   used to be caught and logged while leaving `override = false`, so the WebView then
   tried to load `upi://…` itself and replaced the live payment page with
   `net::ERR_UNKNOWN_URL_SCHEME`. It now claims the URL, follows the intent's
   `browser_fallback_url` if present, and otherwise toasts that the app isn't installed.

The script is idempotent. After a manual run, re-sync:

```bash
node scripts/patch-inappbrowser.cjs && npx cap sync android
```

UPI schemes are declared in **two** places that must stay in sync:

- `android/app/src/main/AndroidManifest.xml` → `<queries>` (Android 11+ package visibility)
- `android/app/src/main/res/xml/config.xml` → `AllowedSchemes` (20 schemes)

Missing `<queries>` entries are the usual cause of "the UPI app doesn't open" on modern
Android — the launch fails silently.

---

## 9. Workflow: signing & release

> **The release key cannot be rotated.** Lose it and you can never update an existing
> Play listing. Leak it and anyone can publish builds that appear to be yours.
> **Back the `.jks` up somewhere off your build machine.**

### One-time setup

```bash
cd android
keytool -genkeypair -v -keystore bijli-release.jks -alias bijli \
        -keyalg RSA -keysize 4096 -validity 10000
cp keystore.properties.example keystore.properties     # then fill in your passwords
```

`android/keystore.properties` (git-ignored):

```properties
storeFile=bijli-release.jks     # resolved relative to android/
storePassword=...
keyAlias=bijli
keyPassword=...
```

CI uses env vars instead: `ANDROID_KEYSTORE_PATH`, `ANDROID_KEYSTORE_PASSWORD`,
`ANDROID_KEYSTORE_ALIAS`, `ANDROID_KEYSTORE_KEY_PASSWORD`.

### Behaviour

- **No keystore → the release APK is left UNSIGNED** (`app-release-unsigned.apk`).
  It deliberately does *not* fall back to the debug key: a debug-signed "release" is
  rejected by Play and re-signable by anyone, and that used to be the silent default.
- Every release build announces the key it used:

```
[signing] release APK signed with bijli (from keystore.properties)
```

### Verify any APK

```bash
$ANDROID_HOME/build-tools/36.0.0/apksigner verify --print-certs <apk>
```

`CN=Android Debug` means it is **not** release-signed. A debug-signed build also cannot
upgrade over a differently-signed install — uninstall first.

---

## 10. Workflow: CI/CD

### `.github/workflows/android.yml` — APK, on push to `main`

JDK 21 + Node 22 → `npm ci` → `npm run build` → `npx cap sync android` → decode the
keystore from secrets → `assembleRelease` → **verify the APK is not debug-signed**
(fails the job if it is) → upload artifact → delete the decoded key in an `always()` step.

Required repository secrets:

| Secret | How to produce it |
|---|---|
| `ANDROID_KEYSTORE_BASE64` | `base64 -w0 bijli-release.jks` (macOS: `base64 -i …`) |
| `ANDROID_KEYSTORE_PASSWORD` | keystore password |
| `ANDROID_KEYSTORE_ALIAS` | e.g. `bijli` |
| `ANDROID_KEYSTORE_KEY_PASSWORD` | key password |

Without `ANDROID_KEYSTORE_BASE64` the job fails on purpose rather than shipping unsigned.

**To get an APK:** Actions tab → latest successful run → download the
`sbpdcl-family-recharge-app` artifact.

### `.github/workflows/deploy.yml` — GitHub Pages, on push to `main`

Node 20 → build with `VITE_BASE_URL=/Electricity-Recharge/` → copy `index.html` to
`404.html` for SPA routing → publish `dist/` to the `gh-pages` branch.

---

## 11. Workflow: testing

There is no test runner wired up. Checks are standalone Node scripts:

```bash
node src/utils/sbpdclApi.test.mjs      # envelope crypto round-trips as the server decrypts it
node src/utils/upiScheme.test.mjs      # all 20 config.xml schemes hand off; web URLs do not

npx esbuild src/utils/paymentWindowRouting.ts --bundle --format=esm --outfile=/tmp/pwr.mjs \
  && node src/utils/paymentWindowRouting.test.mjs /tmp/pwr.mjs
```

The routing test imports the **real** module, so it cannot drift from shipped code.

### Testing the APK without a physical device

An emulator plus the WebView's DevTools socket gives full control of the running app:

```bash
adb shell cat /proc/net/unix | grep webview_devtools      # find the socket
adb forward tcp:9222 localabstract:webview_devtools_remote_<pid>
curl http://localhost:9222/json/list
```

Playwright's `connectOverCDP` **fails** against the Chrome 113 WebView — drive it with
raw CDP over a WebSocket instead (Node 22+ has a global `WebSocket`).

**To test payments without creating real orders**, stub inside the WebView:

- `window.fetch` → intercept URLs containing `PGRequestService`, return
  `{ data: "<fake gateway url>" }`.
- `window.cordova.InAppBrowser` → record `open()` calls and capture the event handlers,
  then fire `loadstart` with the URLs you want to simulate.

Every recharge attempt against the live API registers a **real unpaid order** on the
consumer's account. Always stub.

---

## 12. Credentials & secrets

**Nothing secret is committed.** Full inventory:

| Item | Where it lives | Notes |
|---|---|---|
| Release keystore `.jks` | `android/` (git-ignored) + your own off-machine backup | **Irreplaceable** |
| Keystore + key passwords | `android/keystore.properties` (git-ignored) | Never commit |
| CI copies of both | GitHub repository secrets | See §10 |
| `fgwebcp@2020` | `src/utils/sbpdclApi.ts` | SBPDCL's own public constant, not ours |
| SBPDCL RSA public key | Fetched at runtime | Not hardcoded, so rotation self-heals |

There is **no SBPDCL account, API key or login** — the guest flow needs only a CA number.

`.gitignore` covers `*.jks`, `*.keystore`, `android/keystore.properties` (with the
`.example` negated), `android/local.properties`, `*.apk`, `build-output/`, and all
Android build directories.

**User data:** CA numbers and mobile numbers are stored **unencrypted** in
`localStorage`. The `biometricLock` setting gates the UI, not the data.

---

## 13. Project structure

```
src/
  pages/Home.tsx              Screens, sync loop, balance + payment flows (~1500 lines)
  utils/
    sbpdclApi.ts              API client: envelope crypto, balance, recharge order
    paymentWindowRouting.ts   Decides what the native payment window does per URL
    sanitize.ts               Input sanitisation (XSS / injection / control chars)
    *.test.mjs                Standalone self-checks
  components/                 BalanceModal, SettingsModal, Onboarding, ErrorBoundary, …
  hooks/                      useConsumers (storage), useSettings, useLang, usePullToRefresh
  storage/index.ts            localStorage wrapper — key `sbpdcl_consumers`
  i18n/translations.ts        English + Hindi dictionaries
  automation/automation.ts    Legacy DOM script — PC bookmarklet only
  integrity.ts                Client-side tamper check (see §14)

android/
  app/build.gradle            Signing config (§9)
  app/src/main/AndroidManifest.xml   <queries> for UPI apps
  app/src/main/res/xml/config.xml    AllowedSchemes for UPI apps
  app/src/main/res/xml/network_security_config.xml
  keystore.properties.example

scripts/patch-inappbrowser.cjs   Mandatory Cordova plugin patch (§8)
public/sbpdcl-automation.js      Bookmarklet bundle, generated by gen-bundle.cjs
.github/workflows/               android.yml (APK), deploy.yml (Pages)
```

---

## 14. Security posture

**What genuinely holds**

- No payment credentials ever touch the app — payment happens on the bank's own page.
- HTTPS-only, system CAs only (`network_security_config.xml`); user-installed CAs are
  ignored, which blocks casual MITM proxying.
- `allowBackup="false"` — no ADB extraction of local data.
- Biometric app lock via `@capgo/capacitor-native-biometric`.
- All user input passes through `src/utils/sanitize.ts`.

**What does not**

- `src/integrity.ts` tamper-detection is **client-side only and trivially bypassed** by
  anyone repackaging the APK. Its own comment says so. Treat it as a deterrent, not a
  control.
- Local data is unencrypted (§12).
- The app depends on an undocumented third-party API whose behaviour can change at any
  time.

---

## 15. Error codes

Shown in the UI to make support easier. Defined in `src/components/SettingsModal.tsx`
and `src/components/ErrorBoundary.tsx`.

| Code | Meaning |
|---|---|
| `ERR_NET_01` | No internet connection |
| `ERR_ENV_01` | `InAppBrowser` plugin unavailable |
| `ERR_SEC_01` | Biometric hardware not available |
| `ERR_SEC_02` | Biometric authentication failed or cancelled |
| `ERR_SEC_03` | Notification permission denied |
| `ERR_DAT_01` | Invalid backup JSON |
| `ERR_DAT_02` | Backup file read error |
| `ERR_APP_01` | Unexpected UI crash, caught by the React `ErrorBoundary` |

---

## 16. Known gotchas

**Payment**

- **Gateways cannot be embedded.** HDFC sends `X-Frame-Options: SAMEORIGIN`, Easebuzz
  sends `DENY`. An in-page iframe/modal is impossible; a separate window is the only
  option. This is anti-clickjacking and not something to work around.
- **`PGResponseService` returns HTTP 200 with a zero-byte body**, so the payment window
  ends on a blank white page — after cancellations *and* successful payments. Native
  detects the URL and closes it; web cannot (cross-origin) and offers a button instead.
- **Returning to an SBPDCL URL does not mean success.** Only a changed balance does.
- **Desktop gateway pages hide UPI below ~500px width.** The web payment window opens
  ≥900px wide for exactly this reason. Mobile user-agents show UPI at any width.
- A genuinely credited payment can lag by several minutes.

**API**

- `Content-Type: text/plain` is mandatory in the browser (§4.2).
- Unknown CA → HTTP 200, not an error.
- Gateway IDs are unstable; always fetch the list.

**Build**

- JDK 17 fails with `invalid source release: 21`.
- `local.properties` needs forward slashes.
- Gradle transform cache can corrupt on Windows
  (`Could not move temporary workspace`) — delete `~/.gradle/caches/<version>/transforms`.

---

## 17. Tech debt & next steps

Ranked by value:

1. **`Home.tsx` is ~1500 lines** — nearly 2× the 800-line guideline. Extract `MeterCard`,
   the payment modal, and the sync hooks.
2. **No test runner.** Add `"test": "node --test"` and run it in CI so the three
   self-checks cannot rot.
3. **Dead code** — `src/components/EmbeddedBrowser.tsx` (zero references);
   `gen_bundle.js`, `test.cjs`, `check.cjs`, `test_script.ts` at the repo root are
   superseded scratch scripts; `app-release-unsigned.apk` is a stale committed binary.
4. **Encrypt local data**, or stop advertising the biometric lock as data protection.
5. **Be gentler on the portal** — 30-minute polling × N meters runs serially even when
   the tab is hidden. Skip on `document.hidden`; back off after failures.

### Not verified on real hardware

Verified only in an emulator or with stubs, never on a physical phone with a genuine
payment:

- Cordova's native `startActivity` UPI launch, including the missing-app fallback
- The "Recharge confirmed" branch after a real credited payment
- How SBPDCL's acknowledgement behaves after a genuine transaction

One real ₹100 recharge on a device closes all three.
