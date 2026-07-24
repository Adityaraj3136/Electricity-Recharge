/**
 * App Integrity Guard
 * 
 * This module provides lightweight tamper-detection for the Bijli Recharge app.
 * It verifies the app is running from a trusted origin and hasn't been repackaged
 * with a different package ID. Misuse of this app for fraud or impersonation is
 * illegal under the IT Act, 2000 (India) and related laws.
 * 
 * For a production app, replace these with signed certificate pinning via your
 * backend or a service like Firebase App Check.
 */

// Trusted origins — add your GitHub Pages URL and Capacitor's internal origin
const TRUSTED_ORIGINS = [
  'https://adityaraj3136.github.io',
  'capacitor://localhost',
  'http://localhost',
  'ionic://localhost',
  // Capacitor on Android uses this
  'https://localhost',
];

// Trusted Android package IDs (only relevant on native, but stored for record)
// Users who reverse-engineer and repackage MUST change this — that itself
// acts as a deterrent because the app displays a visible warning.
const TRUSTED_PACKAGE_ID = 'com.adityaraj.sbpdcl';

/**
 * Returns true if the current runtime origin is trusted.
 * On native (Capacitor) the window.location.origin is 'capacitor://localhost'.
 */
function isTrustedOrigin(): boolean {
  const origin = window.location.origin;
  return TRUSTED_ORIGINS.some(trusted => origin.startsWith(trusted));
}

/**
 * Returns true if the native package ID matches the expected one.
 * Falls back to true on web (no package ID concept).
 */
async function isTrustedPackage(): Promise<boolean> {
  try {
    const cap = (window as any).Capacitor;
    if (!cap?.isNativePlatform?.()) return true; // web — skip check

    const info = await import('@capacitor/app').then(m => m.App.getInfo());
    return info.id === TRUSTED_PACKAGE_ID;
  } catch {
    return true; // If plugin not available, allow
  }
}

/**
 * Shows a persistent, non-dismissable warning overlay when the app is
 * detected as running from an untrusted source.
 */
function showTamperWarning() {
  document.body.innerHTML = `
    <div style="
      min-height:100vh; display:flex; flex-direction:column;
      align-items:center; justify-content:center;
      background:#0f172a; color:#f1f5f9; font-family:system-ui,sans-serif;
      text-align:center; padding:32px;
    ">
      <div style="font-size:48px; margin-bottom:16px;">⚠️</div>
      <h1 style="font-size:22px; font-weight:700; color:#ef4444; margin-bottom:12px;">
        Untrusted App Version
      </h1>
      <p style="font-size:14px; color:#94a3b8; max-width:320px; line-height:1.6;">
        This copy of Bijli Recharge has been modified or repackaged from an
        unofficial source. Please download the official version from the
        original developer. Tampering with this app may be illegal under
        the Information Technology Act, 2000.
      </p>
      <p style="font-size:11px; color:#475569; margin-top:24px;">
        Origin: ${window.location.origin}
      </p>
    </div>
  `;
}

/**
 * Run all integrity checks. Call this before mounting the React app.
 * Returns false if the app should be blocked.
 */
export async function runIntegrityChecks(): Promise<boolean> {
  // 1. Check origin
  if (!isTrustedOrigin()) {
    showTamperWarning();
    return false;
  }

  // 2. Check package ID on native
  const pkgOk = await isTrustedPackage();
  if (!pkgOk) {
    showTamperWarning();
    return false;
  }

  return true;
}
