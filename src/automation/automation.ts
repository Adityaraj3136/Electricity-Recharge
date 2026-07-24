export const automationScript = `
(function(window) {
  const TIMEOUT_MS = 12000;
  
  function wait(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  function waitForElement(selector, fallbacks = [], textMatch = '', timeoutMs = TIMEOUT_MS) {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error("Timeout waiting for: " + selector)), timeoutMs);
      
      function check() {
        let el = document.querySelector(selector);
        if (!el) {
          for (let fb of fallbacks) {
            el = document.querySelector(fb);
            if (el) break;
          }
        }
        
        if (el && textMatch) {
          if (!el.textContent.includes(textMatch) && !el.innerText.includes(textMatch)) {
            el = null;
          }
        }
        
        if (!el && textMatch) {
          const tag = selector.split('[')[0] || '*';
          const allEls = document.querySelectorAll(tag);
          for (let e of Array.from(allEls)) {
            if ((e.textContent || '').includes(textMatch)) {
              el = e;
              break;
            }
          }
        }

        if (el) {
          clearTimeout(timeout);
          resolve(el);
        } else {
          requestAnimationFrame(check);
        }
      }
      
      check();
    });
  }

  // Fill an Angular reactive form input properly
  function fillInput(input, value) {
    // Focus first
    input.focus();
    input.dispatchEvent(new Event('focus', { bubbles: true }));
    // Set native value via Object.getOwnPropertyDescriptor trick for Angular
    const nativeInputValueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
    nativeInputValueSetter.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
    input.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true }));
    input.blur();
    input.dispatchEvent(new Event('blur', { bubbles: true }));
  }

  async function fillCANumber(caNumber) {
    try {
      const input = await waitForElement('input[formcontrolname="accno"]', ['input[id^=mat-input-0]']);
      fillInput(input, caNumber);
      return true;
    } catch (e) {
      throw new Error("CA Number field not found");
    }
  }

  async function clickSearch() {
    try {
      await wait(500);
      const btn = await waitForElement('button[type="submit"]', [], 'Search');
      btn.click();
      return true;
    } catch (e) {
      throw new Error("Search button not found");
    }
  }

  async function waitForConsumer() {
    try {
      // Wait for mobile field to appear - signals consumer details loaded
      // Uses correct formcontrolname="mobile" (not mobileNo)
      await waitForElement('input[formcontrolname="mobile"]', [
        'input[placeholder="Mobile Number"]',
        'input[maxlength="10"]'
      ], '', 15000);
      await wait(500); // let page settle
      return true;
    } catch (e) {
      throw new Error("Consumer details did not load. Please check the CA Number.");
    }
  }

  async function fillMobile(mobile) {
    try {
      // Correct selector: formcontrolname="mobile" (confirmed from HTML)
      const input = await waitForElement('input[formcontrolname="mobile"]', [
        'input[placeholder="Mobile Number"]',
        'input[maxlength="10"]'
      ]);
      fillInput(input, mobile);
      return true;
    } catch (e) {
      throw new Error("Mobile Number field not found");
    }
  }

  async function selectAmount(amount) {
    // Try preset amount buttons first (e.g. ₹500, ₹1000)
    try {
      const btn = await waitForElement('button', [], '₹' + amount, 3000);
      if (btn) { btn.click(); return true; }
    } catch (e) { /* no preset button, try input */ }

    // Try custom amount input
    try {
      const input = await waitForElement(
        'input[formcontrolname="payAmount"]',
        ['input[placeholder*="Amount"]', 'input[placeholder*="amount"]'],
        '', 3000
      );
      fillInput(input, amount);
      return true;
    } catch (e2) {
      throw new Error("Could not set amount: " + e2.message);
    }
  }

  async function waitForUserAmount(timeoutSeconds) {
    // If no amount configured, wait for user to manually fill it
    // We wait up to timeoutSeconds for the Pay Now button to become enabled
    return new Promise((resolve) => {
      const deadline = Date.now() + (timeoutSeconds * 1000);
      function check() {
        const payBtn = Array.from(document.querySelectorAll('button')).find(b =>
          b.textContent && b.textContent.trim().includes('Pay Now') && !b.disabled
        );
        if (payBtn || Date.now() >= deadline) {
          resolve();
        } else {
          setTimeout(check, 500);
        }
      }
      check();
    });
  }

  async function selectGateway(gateway) {
    if (!gateway) return true;
    try {
      // Try mat-radio-button labels
      const labels = document.querySelectorAll('mat-radio-button label, .mat-radio-label');
      for (let label of Array.from(labels)) {
        if ((label.textContent || '').includes(gateway)) {
          label.click();
          return true;
        }
      }
      // Fallback: generic label search
      const label = await waitForElement('label', [], gateway, 3000);
      if (label) {
        label.click();
        const input = label.querySelector('input[type="radio"]');
        if (input) { input.checked = true; input.click(); }
      }
      return true;
    } catch (e) {
      console.warn("Gateway not found, continuing with default");
      return true;
    }
  }

  async function clickPayNow() {
    try {
      const btn = await waitForElement('button', [], 'Pay Now');
      btn.click();
      return true;
    } catch (e) {
      throw new Error("Pay Now button not found");
    }
  }

  async function confirmRecharge() {
    try {
      await wait(800); // give dialog time to animate
      const btn = await waitForElement('button', ['.mat-dialog-actions button', '.mat-dialog-container button'], 'YES');
      btn.click();
      return true;
    } catch (e) {
      // Confirmation may not always appear
      console.warn("Confirmation popup not found, continuing");
      return true;
    }
  }

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
      
      if (config.amount) {
        window.postMessage({ type: 'SBPDCL_PROGRESS', step: 'Selecting amount' }, '*');
        await selectAmount(config.amount);
      } else {
        // No amount configured — wait up to 10s for user to select manually
        window.postMessage({ type: 'SBPDCL_PROGRESS', step: 'Selecting amount' }, '*');
        await waitForUserAmount(10);
      }
      
      if (config.gateway) {
        window.postMessage({ type: 'SBPDCL_PROGRESS', step: 'Selecting gateway' }, '*');
        await selectGateway(config.gateway);
      }
      
      window.postMessage({ type: 'SBPDCL_PROGRESS', step: 'Opening payment' }, '*');
      await clickPayNow();
      
      await confirmRecharge();
      
      window.postMessage({ type: 'SBPDCL_PROGRESS', step: 'Done' }, '*');
    } catch (error) {
      window.postMessage({ type: 'SBPDCL_ERROR', error: error.message }, '*');
    }
  };
})(window);
`;
