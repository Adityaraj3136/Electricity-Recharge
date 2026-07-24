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
    try {
      input.focus();
      input.dispatchEvent(new Event('focus', { bubbles: true, composed: true }));
      
      const descriptor = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value');
      if (descriptor && descriptor.set) {
        descriptor.set.call(input, value);
      } else {
        input.value = value;
      }
      
      input.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
      input.dispatchEvent(new Event('change', { bubbles: true, composed: true }));
      input.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true, composed: true, key: 'Enter' }));
      input.blur();
      input.dispatchEvent(new Event('blur', { bubbles: true, composed: true }));
      input.dispatchEvent(new Event('focusout', { bubbles: true, composed: true }));
    } catch(e) {
      console.error("fillInput error", e);
      input.value = value;
      input.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
      input.dispatchEvent(new Event('change', { bubbles: true, composed: true }));
    }
  }

  async function fillCANumber(caNumber) {
    const input = await waitForElement('input[formcontrolname="accno"]', [
      'input[placeholder*="CA Number"]',
      'input[placeholder*="CA Num"]',
      'input[name="accno"]',
      'input[id^=mat-input-]',
      'input.mat-input-element'
    ], '', 15000);
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
      const btn = await waitForElement('button', [], '₹' + amount, 2000);
      btn.click(); 
      await wait(500);
      return;
    } catch(e) {}
    
    // Try custom amount input
    try {
      const input = await waitForElement(
        'input[formcontrolname="payAmount"]',
        ['input[formcontrolname="amount"]', 'input[placeholder*="Amount" i]', 'input[placeholder*="amount" i]'], '', 8000
      );
      fillInput(input, amount);
      await wait(500);
    } catch(e) {
      throw new Error("Could not find amount input field");
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

      // 1. Fill Mobile Number (Compulsory)
      window.postMessage({ type: 'SBPDCL_PROGRESS', step: 'Filling mobile' }, '*');
      await fillMobile(config.mobileNumber || '9999999999');

      // 2. Select Gateway (Compulsory to enable Pay Now)
      window.postMessage({ type: 'SBPDCL_PROGRESS', step: 'Selecting Gateway' }, '*');
      // Wait for radio buttons to appear first
      await wait(1000);
      let radioInput = null;
      if (config.gateway) {
        let imgAltMatch = '';
        if (config.gateway === 'Bank of Baroda') imgAltMatch = 'baroda';
        else if (config.gateway === 'Federal Bank') imgAltMatch = 'federal';
        else if (config.gateway === 'HDFC') imgAltMatch = 'hdfc';
        
        if (imgAltMatch) {
          const allImgs = Array.from(document.querySelectorAll('mat-radio-button img'));
          const targetImg = allImgs.find(img => (img.alt || img.src || '').toLowerCase().includes(imgAltMatch));
          if (targetImg) {
            const radioBtn = targetImg.closest('mat-radio-button');
            radioInput = radioBtn ? radioBtn.querySelector('input[type="radio"]') : null;
          }
        }
      }
      
      // Fallback: pick the first radio input
      if (!radioInput) {
        radioInput = document.querySelector('mat-radio-button input[type="radio"]');
      }

      if (radioInput) {
        // Directly click the hidden radio input — most reliable method for Angular Material
        radioInput.click();
        radioInput.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        radioInput.dispatchEvent(new Event('change', { bubbles: true }));
        await wait(800);
      }

      // 3. Select Amount
      window.postMessage({ type: 'SBPDCL_PROGRESS', step: 'Selecting amount' }, '*');
      if (config.amount) {
        await selectAmount(config.amount);
      } else {
        await waitForUserAmount(); // wait up to 10s for user
      }

      // 4. Open Payment
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

      // New approach: use MutationObserver + text scan instead of CSS selector
      // The SBPDCL page renders data dynamically; we wait for 'CA Number' text to appear
      await new Promise((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error('Timed out waiting for consumer data')), 35000);
        
        function checkForData() {
          // Scan ALL text nodes on the page for 'CA Number'
          const bodyText = document.body ? document.body.innerText || '' : '';
          if (bodyText.includes('CA Number') || bodyText.includes('Consumer Number') || bodyText.includes('Available Balance')) {
            clearTimeout(timeout);
            resolve();
            return true;
          }
          return false;
        }

        if (checkForData()) return;

        // Use MutationObserver to detect when Angular renders the table
        const observer = new MutationObserver(() => {
          if (checkForData()) observer.disconnect();
        });
        observer.observe(document.body, { childList: true, subtree: true, characterData: true });
      });

      await wait(1000); // let Angular finish all rendering

      // Scrape using text-based td scanning (works regardless of CSS class names)
      const getTdValue = (labelMatches) => {
        // Try all td elements, look for label in strong or td itself
        const allTds = Array.from(document.querySelectorAll('td'));
        for (let i = 0; i < allTds.length; i++) {
          const td = allTds[i];
          const text = (td.innerText || td.textContent || '').trim().toLowerCase();
          if (labelMatches.some(m => text.includes(m.toLowerCase()))) {
            // Value is in the next td sibling
            const nextTd = allTds[i + 1];
            if (nextTd) {
              return (nextTd.innerText || nextTd.textContent || '')
                .trim()
                .replace(/picture_as_pdf/gi, '')
                .trim();
            }
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
        availableBalance: getTdValue(['Available Balance', 'Balance(Rs)', 'Available Balance(Rs)']),
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
