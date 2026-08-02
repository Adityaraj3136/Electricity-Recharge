/**
 * Decides what the native payment window should do for each URL it navigates to.
 *
 * Kept as a pure function so it can be tested directly: this runs inside a
 * Cordova InAppBrowser during a real payment, where a wrong branch either strands
 * the user on a dead page or closes the window before the bank has finished.
 */

/** URLs the app navigates to purely to signal intent from injected page scripts. */
export const CLOSE_SENTINEL = 'https://app.close.browser/';
export const STAY_SENTINEL = 'https://app.stay.browser/';

/** Schemes the WebView itself owns — never an external app handoff. */
const WEB_SCHEMES = ['http', 'https', 'about', 'data', 'blob', 'javascript', 'file', 'content', 'chrome'];
/** Handled by Android but unrelated to payment. */
const NON_PAYMENT_SCHEMES = ['mailto', 'tel', 'sms', 'geo'];

export type PaymentWindowAction =
  /** User tapped the floating close button. */
  | 'close'
  /** User asked to keep reading the acknowledgement; cancel any countdown. */
  | 'stay'
  /** A UPI/wallet app scheme — hand off to the installed app. */
  | 'app-handoff'
  /** SBPDCL's return endpoint: an empty JSON body that renders blank. Close it. */
  | 'close-blank'
  /** A real SBPDCL acknowledgement page — show the return countdown. */
  | 'start-countdown'
  /** Gateway's own pages, and anything else: leave alone. */
  | 'ignore';

export interface PaymentWindowState {
  /** A return countdown is already running. */
  countdownRunning: boolean;
  /** User already asked to stay on the acknowledgement page. */
  stayRequested: boolean;
}

export function routePaymentWindowUrl(rawUrl: string, state: PaymentWindowState): PaymentWindowAction {
  const url = String(rawUrl || '').trim();
  if (!url) return 'ignore';

  if (url === CLOSE_SENTINEL) return 'close';
  if (url === STAY_SENTINEL) return 'stay';

  // Any non-web scheme is an app handoff. Allow-listing individual UPI apps would
  // silently break each time the gateway adds one.
  const colonAt = url.indexOf(':');
  if (colonAt > 0) {
    const scheme = url.slice(0, colonAt).toLowerCase();
    if (!WEB_SCHEMES.includes(scheme) && !NON_PAYMENT_SCHEMES.includes(scheme)) {
      return 'app-handoff';
    }
  }

  // The gateway returns here when the transaction ends — for cancellations and
  // failures as well as successful payments. It answers with an empty JSON body,
  // so there is nothing to display; close rather than show a blank page.
  if (url.includes('PGResponseService')) return 'close-blank';

  if ((url.includes('sbpdcl') || url.includes('cportal')) && !state.countdownRunning && !state.stayRequested) {
    return 'start-countdown';
  }

  return 'ignore';
}
