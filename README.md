# Smart Bihar Electricity Recharge (SBPDCL)

A secure, mobile-first Android App (and Progressive Web App) designed to help you quickly manage and recharge your family's prepaid electricity meters from the official SBPDCL website with powerful automation features.

## 🚀 Key Features

### 🤖 Intelligent Payment Automation
- Automates the tedious SBPDCL form-filling process.
- Injects a native automation script into an embedded secure browser (`InAppBrowser`).
- **Race-Condition Free**: Uses robust DOM polling (`waitForElement`) to ensure fields are injected at exactly the right time, preventing script failures on slow connections.
- Automatically types your CA Number, fetches the consumer, enters the mobile number, sets the amount, and clicks "Pay Now".
- **Smart Gateway Selection**: Automatically navigates the Juspay gateway to select the UPI option and generates the QR code for you to scan and pay instantly.

### 🔍 Silent Background Balance Checker
- Tap **Check Balance** to securely fetch live data without leaving the app.
- A hidden (`hidden=yes`) browser session securely connects to SBPDCL, extracts your exact current balance, connection status, and last recharge details via custom DOM parsing.
- Presents the scraped data in a beautiful, color-coded native UI modal.

### 🔔 Smart Low Balance Alert
- Every time you check a meter's balance, the app analyzes the fetched amount.
- If the balance is strictly below **₹100**, the app triggers a high-priority, native Local Notification identifying the specific meter name and reminding you to recharge.
- This toggleable feature replaces rigid calendar reminders with event-driven, contextual alerts.

### 📱 Premium Native Experience
- **Framer Motion Animations**: Buttery-smooth page transitions, springy modals, and tactile button presses.
- **Pull-To-Refresh**: Native mobile gesture implemented via a custom hook (`usePullToRefresh`) on the Home screen to easily fetch latest updates.
- **Dual Language Support**: Seamlessly toggle between English and Hindi (`i18n`), dynamically updating all UI text, onboarding slides, and Quick Actions.
- **Onboarding Slideshow**: Beautiful swipeable carousel to educate first-time users on how to use the app.
- **Input Sanitization**: Automatically strips emojis and invisible characters from copied CA numbers and inputs to prevent backend errors.
- **Per-Field Validation**: Intuitive, inline red-border form validation instead of generic toast errors.
- **True Dark Mode 🌙**: A sleek deep-blue dark mode that saves battery and is easy on the eyes.

### 🔒 Enterprise-Grade Security
The Android APK has been heavily hardened to prevent tampering:
- **Biometric App Lock**: Require fingerprint, face unlock, or device PIN/pattern to open the app.
- **Anti-Tampering Guard**: Prevents app recompilation or package ID changes.
- **No URL Bar**: The browser operates completely chromeless, preventing URL manipulation.
- **HTTPS Only**: Plain text HTTP traffic is blocked at the OS level via `network_security_config.xml`.
- **System CAs Only**: Ignores user-installed certificates, protecting against Man-in-the-Middle (MITM) attacks.
- **ADB Backup Disabled**: Prevents extraction of local data via USB debugging (`allowBackup=false`).

## 🛠️ Tech Stack
- **Frontend**: React 18, TypeScript, Vite, Tailwind CSS v4, Framer Motion
- **Mobile Container**: Capacitor, Android SDK
- **Native Plugins**: 
  - `cordova-plugin-inappbrowser` (for automation & scraping)
  - `@capacitor/local-notifications` (for low balance alerts)
  - `@capacitor/preferences` (for secure local storage)
- **CI/CD**: GitHub Actions (Cloud APK Compilation)

## 📦 Building & Deployment

### Local Development (Web)
```bash
npm install
npm run dev
npm run build
```

### Android APK Build (Automated CI/CD)
This project is configured with GitHub Actions to automatically compile a secure Android APK on every push to the `main` branch. 
1. Go to the **Actions** tab in GitHub.
2. Select the latest successful build.
3. Download the `sbpdcl-family-recharge-app` artifact and install the APK on your device.

*Note: You do not need to install Android Studio or Java locally to build the app, as GitHub Actions handles the heavy lifting in the cloud using JDK 21.*

## 📂 Project Structure Guide

- `/src/pages/Home.tsx`: The heart of the app. Handles UI rendering, automation orchestration, and balance parsing logic.
- `/src/components/`: Reusable UI components like `SettingsModal`, `BalanceModal`, and `Onboarding`.
- `/src/hooks/`: Custom React hooks, including `useConsumers` (storage), `usePullToRefresh` (gestures), and `useSettings`.
- `/src/i18n/`: Contains dual language translation dictionaries (`translations.ts`) and the language context provider.
- `/src/utils/sanitize.ts`: Utility for stripping emojis and unwanted whitespace from user inputs.
- `/public/`: Contains static assets like the `hero.jpg` banner and app manifest icons.
- `/android/`: Capacitor-generated native Android project containing the hardened configuration and `network_security_config.xml`.

## 🛡️ Privacy Statement
This app acts as a local bridge to the official SBPDCL website. It does **not** collect, transmit, or store any payment details, passwords, or cards. All interactions with the payment gateway occur securely within an isolated embedded browser directly connected to the official vendor. All your saved CA numbers are strictly stored on-device.

## ?? Troubleshooting & Error Codes

To help easily identify and debug issues in the app, we use a standardized set of error codes. If you encounter an issue, look for these codes in the UI:

### Network & Environment
- **`ERR_NET_01`**: No internet connection (Offline).
- **`ERR_ENV_01`**: Required browser plugin (`InAppBrowser`) is unavailable or missing.

### Security & Authentication
- **`ERR_SEC_01`**: Biometric authentication hardware is not available on the device.
- **`ERR_SEC_02`**: Biometric authentication failed (e.g., unrecognized fingerprint, user cancelled).
- **`ERR_SEC_03`**: Notification permissions denied.

### Storage & Data Management
- **`ERR_DAT_01`**: Invalid backup JSON format (corrupted or incorrect structure).
- **`ERR_DAT_02`**: Error reading the backup file (e.g., IO error).

### UI & Application State
- **`ERR_APP_01`**: Unexpected UI Crash (Caught by the global React `ErrorBoundary`).

