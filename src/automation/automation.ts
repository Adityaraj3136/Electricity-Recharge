export const automationScript = `
(function(window) {
  const TIMEOUT_MS = 12000;
  const GATEWAY_TIMEOUT_MS = 60000; // 60s for payment gateway to load after user confirms

  function wait(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  function waitForElement(selector, fallbacks = [], textMatch = '', timeoutMs = TIMEOUT_MS) {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error("Timeout: " + (textMatch || selector))), timeoutMs);
      function check() {
        let el = document.querySelector(selector);
        if (!el) {
          for (let fb of fallbacks) {
            el = document.querySelector(fb);
            if (el) break;
          }
        }
        if (el && textMatch) {
          const text = (el.textContent || el.innerText || '');
          if (!text.includes(textMatch)) el = null;
        }
        if (!el && textMatch) {
          const tag = selector.split('[')[0] || '*';
          const allEls = document.querySelectorAll(tag);
          for (let e of Array.from(allEls)) {
            if ((e.textContent || '').includes(textMatch)) { el = e; break; }
          }
        }
        if (el) { clearTimeout(timeout); resolve(el); }
        else requestAnimationFrame(check);
      }
      check();
    });
  }

  // Angular-compatible input fill
  function fillInput(input, value) {
    input.focus();
    input.dispatchEvent(new Event('focus', { bubbles: true }));
    const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
    nativeSetter.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
    input.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true }));
    input.blur();
    input.dispatchEvent(new Event('blur', { bubbles: true }));
  }

  async function fillCANumber(caNumber) {
    const input = await waitForElement('input[formcontrolname="accno"]', ['input[id^=mat-input-0]']);
    fillInput(input, caNumber);
  }

  async function clickSearch() {
    await wait(500);
    const btn = await waitForElement('button[type="submit"]', [], 'Search');
    btn.click();
  }

  async function waitForConsumer() {
    await waitForElement('input[formcontrolname="mobile"]', [
      'input[placeholder="Mobile Number"]',
      'input[maxlength="10"]'
    ], '', 15000);
    await wait(600);
  }

  async function fillMobile(mobile) {
    const input = await waitForElement('input[formcontrolname="mobile"]', [
      'input[placeholder="Mobile Number"]',
      'input[maxlength="10"]'
    ]);
    fillInput(input, mobile);
  }

  async function selectAmount(amount) {
    // Try preset amount buttons (e.g. ₹500, ₹1000)
    try {
      const btn = await waitForElement('button', [], '₹' + amount, 3000);
      btn.click(); return;
    } catch(e) {}
    // Try custom amount input
    try {
      const input = await waitForElement(
        'input[formcontrolname="payAmount"]',
        ['input[placeholder*="Amount"]'], '', 3000
      );
      fillInput(input, amount);
    } catch(e) {
      throw new Error("Could not set amount");
    }
  }

  // If no amount set, wait up to 10s for user to pick one (Pay Now becomes enabled)
  async function waitForUserAmount() {
    return new Promise(resolve => {
      const deadline = Date.now() + 10000;
      function check() {
        const payBtn = Array.from(document.querySelectorAll('button')).find(b =>
          b.textContent && b.textContent.trim().includes('Pay Now') && !b.disabled
        );
        if (payBtn || Date.now() >= deadline) resolve();
        else setTimeout(check, 500);
      }
      check();
    });
  }

  async function clickPayNow() {
    const btn = await waitForElement('button', [], 'Pay Now');
    btn.click();
  }

  // ── WAIT FOR USER to click Yes/No on confirmation modal ──────────────────
  // Returns true if user clicked Yes, false if No (or timed out).
  async function waitForUserConfirmation() {
    // 1. Wait for confirmation modal to appear
    try {
      await waitForElement('button.btn-danger', [], 'Yes', 10000);
      window.postMessage({ type: 'SBPDCL_PROGRESS', step: 'Opening payment' }, '*');
    } catch(e) {
      return true; // Modal didn't appear — proceed anyway
    }

    // 2. Wait for modal to close (user clicked Yes or No)
    await new Promise(resolve => {
      const deadline = Date.now() + 60000;
      function check() {
        const modal = document.querySelector('button.btn-danger');
        if (!modal || Date.now() >= deadline) resolve(undefined);
        else setTimeout(check, 300);
      }
      check();
    });

    // 3. Detect Yes vs No:
    //    Pay Now still visible → user clicked No (still on SBPDCL page)
    //    Pay Now gone         → user clicked Yes (navigating to payment gateway)
    await wait(400);
    const payNowStillVisible = Array.from(document.querySelectorAll('button'))
      .some(b => b.textContent && b.textContent.trim().includes('Pay Now'));

    return !payNowStillVisible; // true = Yes, false = No
  }

  // ── PAYMENT GATEWAY (Juspay) ──────────────────────────────────────────────
  // Wait for the Juspay gateway iframe/page to load (UPI tab visible)
  async function waitForPaymentGateway() {
    // The gateway renders in an iframe. We poll for the UPI tab element.
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error("Payment gateway did not load")), GATEWAY_TIMEOUT_MS);
      function findUpiTab(doc) {
        // Try testid attribute
        let el = doc.querySelector('[testid="nvb_upi"]');
        if (el) return el;
        // Fallback: search article tags for "UPI" text
        const articles = doc.querySelectorAll('article');
        for (let a of Array.from(articles)) {
          if ((a.textContent || '').trim() === 'UPI') return a.closest('[testid]') || a;
        }
        return null;
      }

      function check() {
        // Check main document
        let el = findUpiTab(document);
        if (el) { clearTimeout(timeout); resolve(el); return; }
        // Check all iframes
        const iframes = document.querySelectorAll('iframe');
        for (let frame of Array.from(iframes)) {
          try {
            const doc = frame.contentDocument || frame.contentWindow.document;
            if (doc) {
              el = findUpiTab(doc);
              if (el) { clearTimeout(timeout); resolve(el); return; }
            }
          } catch(e) { /* cross-origin iframe, skip */ }
        }
        setTimeout(check, 500);
      }
      check();
    });
  }

  async function clickUPI(upiEl) {
    // Click the UPI tab itself or its closest clickable parent
    const tab = upiEl.closest('[tabindex]') || upiEl.closest('[role="tab"]') || upiEl;
    tab.click();
    await wait(1200); // wait for UPI panel to render
  }

  async function clickGenerateQR(doc = document) {
    // Try testid first
    let btn = doc.querySelector('[testid="msg_text"]');
    if (!btn) {
      // Fallback: find element with "Generate QR Code" text
      const all = doc.querySelectorAll('div, article, button, span');
      for (let el of Array.from(all)) {
        if ((el.textContent || '').trim() === 'Generate QR Code') { btn = el; break; }
      }
    }
    if (btn) {
      // Click the closest clickable parent
      const clickable = btn.closest('.linearLayout') || btn.closest('button') || btn;
      clickable.click();
      return true;
    }
    // Also search iframes
    const iframes = doc.querySelectorAll('iframe');
    for (let frame of Array.from(iframes)) {
      try {
        const fdoc = frame.contentDocument || frame.contentWindow.document;
        if (fdoc && await clickGenerateQR(fdoc)) return true;
      } catch(e) {}
    }
    throw new Error("Generate QR Code button not found");
  }

  // ── MAIN ──────────────────────────────────────────────────────────────────
  window.startSbpdclAutomation = async function(config) {
    try {
      window.postMessage({ type: 'SBPDCL_PROGRESS', step: 'Filling CA Number' }, '*');
      await fillCANumber(config.caNumber);

      window.postMessage({ type: 'SBPDCL_PROGRESS', step: 'Searching' }, '*');
      await clickSearch();

      window.postMessage({ type: 'SBPDCL_PROGRESS', step: 'Loading consumer' }, '*');
      await waitForConsumer();

      if (config.mobileNumber) {
        window.postMessage({ type: 'SBPDCL_PROGRESS', step: 'Filling mobile' }, '*');
        await fillMobile(config.mobileNumber);
      }

      window.postMessage({ type: 'SBPDCL_PROGRESS', step: 'Selecting amount' }, '*');
      if (config.amount) {
        await selectAmount(config.amount);
      } else {
        await waitForUserAmount(); // wait up to 10s for user
      }

      if (config.gateway) {
        window.postMessage({ type: 'SBPDCL_PROGRESS', step: 'Selecting Gateway' }, '*');
        let imgAltMatch = '';
        if (config.gateway === 'Bank of Baroda') imgAltMatch = 'Bank Of Baroda';
        else if (config.gateway === 'Federal Bank') imgAltMatch = 'Federal Bank';
        else if (config.gateway === 'HDFC') imgAltMatch = 'Hdfc';
        
        if (imgAltMatch) {
          const allImgs = Array.from(document.querySelectorAll('mat-radio-button img'));
          const targetImg = allImgs.find(img => (img.alt || '').toLowerCase().includes(imgAltMatch.toLowerCase()));
          if (targetImg) {
            const radioBtn = targetImg.closest('mat-radio-button');
            if (radioBtn) {
              radioBtn.click();
              await wait(500);
            }
          }
        }
      }

      window.postMessage({ type: 'SBPDCL_PROGRESS', step: 'Opening payment' }, '*');
      await clickPayNow();

      // Wait for user to tap Yes/No on confirmation popup
      const confirmed = await waitForUserConfirmation();
      if (!confirmed) {
        // User clicked No — stop automation, let them stay on the page
        window.postMessage({ type: 'SBPDCL_ERROR', error: 'Payment cancelled by user.' }, '*');
        return;
      }

      // Wait for Juspay payment gateway to load
      window.postMessage({ type: 'SBPDCL_PROGRESS', step: 'Selecting gateway' }, '*');
      const upiEl = await waitForPaymentGateway();

      // Check if "Pay by any UPI app" is already visible on screen
      // If yes — gateway is ready for user to pay, stop script here
      function hasPayByUpiApp(doc) {
        const allText = doc.querySelectorAll('div, article, button, span, p');
        for (let el of Array.from(allText)) {
          const t = (el.textContent || '').trim().toLowerCase();
          if (t.includes('pay by any upi app') || t === 'pay by upi app') return true;
        }
        // Also check iframes
        const iframes = doc.querySelectorAll('iframe');
        for (let frame of Array.from(iframes)) {
          try {
            const fdoc = frame.contentDocument || frame.contentWindow.document;
            if (fdoc && hasPayByUpiApp(fdoc)) return true;
          } catch(e) {}
        }
        return false;
      }

      if (hasPayByUpiApp(document)) {
        // UPI payment options already showing — hand off to user
        window.postMessage({ type: 'SBPDCL_PROGRESS', step: 'Done' }, '*');
        return;
      }

      // Otherwise click UPI tab and Generate QR
      await clickUPI(upiEl);

      // After clicking UPI, check again for "Pay by any UPI app"
      await wait(1000);
      if (hasPayByUpiApp(document)) {
        window.postMessage({ type: 'SBPDCL_PROGRESS', step: 'Done' }, '*');
        return;
      }

      // Click Generate QR Code
      await wait(500);
      await clickGenerateQR();

      window.postMessage({ type: 'SBPDCL_PROGRESS', step: 'Done' }, '*');
    } catch (error) {
      window.postMessage({ type: 'SBPDCL_ERROR', error: error.message }, '*');
    }
  };

  // ── BALANCE FETCH MAIN ────────────────────────────────────────────────────
  window.fetchSbpdclBalance = async function(caNumber) {
    try {
      await fillCANumber(caNumber);
      await clickSearch();
      
      // Wait for table to appear
      await waitForElement('table.table', ['tbody']);
      await wait(1000); // let Angular finish rendering

      const getTdValue = (labelMatches) => {
        const tds = Array.from(document.querySelectorAll('td.text strong, td.text'));
        for (let td of tds) {
          const text = (td.textContent || '').trim().toLowerCase();
          if (labelMatches.some(m => text.includes(m.toLowerCase()))) {
            let next = td.closest('td').nextElementSibling;
            return next ? (next.textContent || '').trim().replace(/picture_as_pdf/g, '').trim() : '';
          }
        }
        return '';
      };

      const details = {
        caNumber: getTdValue(['CA Number', 'Consumer Number']),
        name: getTdValue(['Name', 'Consumer Name']),
        division: getTdValue(['Division']),
        subDivision: getTdValue(['Sub Division']),
        lastRechargeDate: getTdValue(['Last Recharge Date']),
        lastRechargeAmount: getTdValue(['Last Recharge Amount']),
        consumerType: getTdValue(['Consumer Type']),
        currentStatus: getTdValue(['Current Status']),
        availableBalance: getTdValue(['Available Balance', 'Balance(Rs)']),
        amispVendor: getTdValue(['AMISP Vendor'])
      };

      window.__balanceResult = details;

      if (window.webkit && window.webkit.messageHandlers && window.webkit.messageHandlers.cordova_iab) {
        window.webkit.messageHandlers.cordova_iab.postMessage(JSON.stringify({
          type: 'BALANCE_DETAILS',
          details
        }));
      }
      return details;

    } catch (error) {
      window.__balanceError = error.message;
      if (window.webkit && window.webkit.messageHandlers && window.webkit.messageHandlers.cordova_iab) {
        window.webkit.messageHandlers.cordova_iab.postMessage(JSON.stringify({
          type: 'BALANCE_ERROR',
          error: error.message
        }));
      }
      throw error;
    }
  };
})(window);
`;
