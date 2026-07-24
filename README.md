# SBPDCL Family Recharge

A secure, mobile-first Android App (and Progressive Web App) designed to help you quickly manage and recharge your family's prepaid electricity meters from the official SBPDCL website with powerful automation features.

## 🚀 Key Features

### 🤖 Intelligent Payment Automation
- Automates the tedious SBPDCL form-filling process.
- Injects a native automation script into an embedded secure browser (`InAppBrowser`).
- Automatically types your CA Number, fetches the consumer, enters the mobile number, sets the amount, and clicks "Pay Now".
- **Smart Gateway Selection**: Automatically navigates the Juspay gateway to select the UPI option and generates the QR code for you to scan and pay instantly.

### 🔍 Silent Background Balance Checker
- Tap **Check Balance** to securely fetch live data without leaving the app.
- A hidden browser session securely connects to SBPDCL, extracts your exact current balance, connection status, and last recharge details.
- Presents the scraped data in a beautiful, color-coded native UI modal.

### 🔒 Enterprise-Grade Security
The Android APK has been heavily hardened to prevent tampering:
- **Biometric App Lock**: Require fingerprint or face unlock to open the app (Settings option).
- **Anti-Tampering Guard**: Prevents app recompilation or package ID changes.
- **No URL Bar**: The browser operates completely chromeless, preventing URL manipulation.
- **HTTPS Only**: Plain text HTTP traffic is blocked at the OS level via `network_security_config.xml`.
- **System CAs Only**: Ignores user-installed certificates, protecting against Man-in-the-Middle (MITM) attacks.
- **ADB Backup Disabled**: Prevents extraction of local data via USB debugging (`allowBackup=false`).

### 📱 Premium Native Experience
- Built with React + Vite + Tailwind CSS v4, wrapped in **Capacitor**.
- **Material Design UI**: Beautiful glassmorphism effects, dynamic colors, and smooth micro-animations.
- **True Dark Mode 🌙**: A sleek deep-blue dark mode that saves battery and is easy on the eyes.
- **Monthly Reminders**: Get a local push notification on a custom day of the month to remind you to recharge.
- **Offline Detection**: Prevents attempting to load the portal when you have no internet connection.
- **Local Storage**: All your saved consumer CA numbers stay strictly on your device.
- **Backup & Restore**: Easily export and import your saved consumer list via JSON.

## 🛠️ Tech Stack
- **Frontend**: React, TypeScript, Vite, Tailwind CSS (Lucide React Icons)
- **Mobile Container**: Capacitor, Android SDK
- **Native Plugins**: `cordova-plugin-inappbrowser`
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

## 🛡️ Privacy Statement
This app acts as a local bridge to the official SBPDCL website. It does **not** collect, transmit, or store any payment details, passwords, or cards. All interactions with the payment gateway occur securely within an isolated embedded browser directly connected to the official vendor.
