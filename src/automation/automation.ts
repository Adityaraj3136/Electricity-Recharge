export const automationScript = `
(function(window) {
  const TIMEOUT_MS = 10000;
  
  function wait(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  function waitForElement(selector, fallbacks = [], textMatch = '') {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error("Timeout waiting for element")), TIMEOUT_MS);
      
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
          // Fallback to searching all elements for text
          const allEls = document.querySelectorAll(selector.split('[')[0] || '*');
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

  async function fillCANumber(caNumber) {
    try {
      const input = await waitForElement('input[formcontrolname="accno"]', ['input[id^=mat-input]']);
      input.value = caNumber;
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
      return true;
    } catch (e) {
      throw new Error("CA Number field not found");
    }
  }

  async function clickSearch() {
    try {
      const btn = await waitForElement('button[type="submit"]', [], 'Search');
      btn.click();
      return true;
    } catch (e) {
      throw new Error("Search button not found");
    }
  }

  async function waitForConsumer() {
    try {
      // Assuming consumer details appear in a specific section, waiting for mobile number field is a good proxy
      await waitForElement('input[formcontrolname="mobileNo"]', ['input[type="tel"]', 'input[placeholder*="Mobile"]']);
      return true;
    } catch (e) {
      throw new Error("Consumer details did not load");
    }
  }

  async function fillMobile(mobile) {
    try {
      const input = await waitForElement('input[formcontrolname="mobileNo"]', ['input[type="tel"]']);
      input.value = mobile;
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
      return true;
    } catch (e) {
      throw new Error("Mobile Number field not found");
    }
  }

  async function selectAmount(amount) {
    try {
      const btn = await waitForElement('button', [], '₹' + amount);
      if (btn) {
        btn.click();
        return true;
      }
    } catch (e) {
      // Fallback to custom amount
      try {
        const input = await waitForElement('input[formcontrolname="payAmount"]', ['input[placeholder*="Amount"]']);
        input.value = amount;
        input.dispatchEvent(new Event('input', { bubbles: true }));
        return true;
      } catch (e2) {
        throw new Error("Could not set amount");
      }
    }
  }

  async function selectGateway(gateway) {
    if (!gateway) return true;
    try {
      const label = await waitForElement('label', [], gateway);
      if (label) {
        label.click();
        const input = label.querySelector('input');
        if (input) input.click();
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
      const btn = await waitForElement('button', ['.mat-dialog-actions button'], 'YES');
      btn.click();
      return true;
    } catch (e) {
      throw new Error("Confirmation popup not found");
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
      }
      
      if (config.gateway) {
        window.postMessage({ type: 'SBPDCL_PROGRESS', step: 'Selecting gateway' }, '*');
        await selectGateway(config.gateway);
      }
      
      window.postMessage({ type: 'SBPDCL_PROGRESS', step: 'Opening payment' }, '*');
      await clickPayNow();
      
      // confirm popup
      await wait(500); // give dialog time to animate
      await confirmRecharge();
      
      window.postMessage({ type: 'SBPDCL_PROGRESS', step: 'Done' }, '*');
    } catch (error) {
      window.postMessage({ type: 'SBPDCL_ERROR', error: error.message }, '*');
    }
  };
})(window);
`;
