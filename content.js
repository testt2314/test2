class CurrencyConverter {
  constructor() {
    this.popup = null;
    this.selectedText = '';
    this.mouseX = 0;
    this.mouseY = 0;
    this.isConverting = false;
    this.rates = {};
    this.targetCurrency = 'MYR';
    this.autoDetectSource = true;
    this.apiUrl = 'https://wise.com/rates/live';
    this.isInitialLoad = true;
    
    // Currency detection patterns
    this.currencyPatterns = {
      // Symbol-based patterns
      '$': { code: 'USD', regex: /\$\s*[\d,]+\.?\d*/g },
      '€': { code: 'EUR', regex: /€\s*[\d,]+\.?\d*/g },
      '£': { code: 'GBP', regex: /£\s*[\d,]+\.?\d*/g },
      '¥': { code: 'JPY', regex: /¥\s*[\d,]+\.?\d*/g },
      'S$': { code: 'SGD', regex: /S\$\s*[\d,]+\.?\d*/g },
      'A$': { code: 'AUD', regex: /A\$\s*[\d,]+\.?\d*/g },
      '₹': { code: 'INR', regex: /₹\s*[\d,]+\.?\d*/g },
      '₩': { code: 'KRW', regex: /₩\s*[\d,]+\.?\d*/g },
      'HK$': { code: 'HKD', regex: /HK\$\s*[\d,]+\.?\d*/g },
      'RM': { code: 'MYR', regex: /RM\s*[\d,]+\.?\d*/g },
      '¢': { code: 'USD', regex: /[\d,]+\.?\d*\s*¢/g, divider: 100 },
      
      // Code-based patterns
      'USD': { code: 'USD', regex: /[\d,]+\.?\d*\s*(USD|usd|dollars?)/gi },
      'EUR': { code: 'EUR', regex: /[\d,]+\.?\d*\s*(EUR|eur|euros?)/gi },
      'GBP': { code: 'GBP', regex: /[\d,]+\.?\d*\s*(GBP|gbp|pounds?)/gi },
      'JPY': { code: 'JPY', regex: /[\d,]+\.?\d*\s*(JPY|jpy|yen)/gi },
      'SGD': { code: 'SGD', regex: /[\d,]+\.?\d*\s*(SGD|sgd)/gi },
      'AUD': { code: 'AUD', regex: /[\d,]+\.?\d*\s*(AUD|aud)/gi },
      'CNY': { code: 'CNY', regex: /[\d,]+\.?\d*\s*(CNY|cny|yuan|rmb)/gi },
      'THB': { code: 'THB', regex: /[\d,]+\.?\d*\s*(THB|thb|baht)/gi },
      'IDR': { code: 'IDR', regex: /[\d,]+\.?\d*\s*(IDR|idr|rupiah)/gi },
      'KRW': { code: 'KRW', regex: /[\d,]+\.?\d*\s*(KRW|krw|won)/gi },
      'HKD': { code: 'HKD', regex: /[\d,]+\.?\d*\s*(HKD|hkd)/gi },
      'INR': { code: 'INR', regex: /[\d,]+\.?\d*\s*(INR|inr|rupees?)/gi },
      'MYR': { code: 'MYR', regex: /[\d,]+\.?\d*\s*(MYR|myr|ringgit)/gi }
    };

    this.supportedCurrencies = [
      'USD', 'EUR', 'GBP', 'JPY', 'SGD', 'AUD', 'CNY', 'THB', 
      'IDR', 'KRW', 'HKD', 'INR', 'MYR'
    ];
    
    this.init();
  }

  init() {
    this.loadSettings();
    this.attachEventListeners();
    console.log('Currency Converter initialized with context menu support');
  }

  loadSettings() {
    if (typeof browser !== 'undefined') {
      browser.storage.sync.get(['targetCurrency', 'autoDetectSource', 'apiUrl', 'lastSettingsUpdate']).then((result) => {
        this.targetCurrency = result.targetCurrency || 'MYR';
        this.autoDetectSource = result.autoDetectSource !== undefined ? result.autoDetectSource : true;
        this.apiUrl = result.apiUrl || 'https://wise.com/rates/live';
        console.log('Loaded settings - Target:', this.targetCurrency, 'Auto-detect:', this.autoDetectSource, 'API:', this.apiUrl);
      }).catch(() => {
        console.log('Failed to load settings, using defaults');
      });

      browser.runtime.onMessage.addListener((request, sender, sendResponse) => {
        if (request.action === 'settingsUpdated') {
          this.targetCurrency = request.targetCurrency;
          this.autoDetectSource = request.autoDetectSource;
          this.apiUrl = request.apiUrl;
          this.refreshAllRates().then(() => {
            sendResponse({success: true});
          });
          return true;
        } else if (request.action === 'refreshAllRates') {
          this.refreshAllRates().then(() => {
            sendResponse({success: true});
          }).catch(() => {
            sendResponse({success: false});
          });
          return true;
        } else if (request.action === 'convertSelectedText') {
          this.handleContextMenuConversion(request.selectedText);
          sendResponse({success: true});
          return true;
        }
      });
    }
  }

  attachEventListeners() {
    document.addEventListener('mousedown', this.handleMouseDown.bind(this));
    document.addEventListener('keydown', this.handleKeyDown.bind(this));
    console.log('Event listeners attached for context menu mode');
  }

  async refreshAllRates() {
    console.log('Refreshing all cached rates...');
    const currencies = Object.keys(this.rates);
    let refreshedCount = 0;
    
    for (let cacheKey of currencies) {
      const [source, target] = cacheKey.split('_');
      try {
        await this.fetchExchangeRate(source, target, true);
        refreshedCount++;
        await new Promise(resolve => setTimeout(resolve, 200));
      } catch (error) {
        console.log(`Failed to refresh ${cacheKey}:`, error);
      }
    }
    
    console.log(`Refreshed ${refreshedCount}/${currencies.length} exchange rates`);
  }

  handleContextMenuConversion(selectedText) {
    if (!selectedText || selectedText.trim() === '') {
      console.log('No text selected for conversion');
      return;
    }

    this.selectedText = selectedText.trim();
    this.mouseX = window.innerWidth / 2;
    this.mouseY = window.innerHeight / 2;
    
    console.log('Context menu conversion requested for:', this.selectedText);
    this.showConversionPopup();
  }

  handleMouseDown(e) {
    if (this.popup && !this.popup.contains(e.target)) {
      this.hidePopup();
    }
  }

  handleKeyDown(e) {
    if (e.key === 'Escape') {
      this.hidePopup();
    }
  }

  detectCurrencyFromText(text) {
    console.log('Detecting currency from:', text);
    
    if (this.autoDetectSource) {
      for (let pattern in this.currencyPatterns) {
        const currencyInfo = this.currencyPatterns[pattern];
        const regex = new RegExp(currencyInfo.regex.source, currencyInfo.regex.flags);
        
        if (regex.test(text)) {
          const amount = this.extractAmountFromPattern(text, regex, currencyInfo.divider);
          if (amount > 0) {
            console.log(`Auto-detected: ${amount} ${currencyInfo.code}`);
            return {
              amount: amount,
              currency: currencyInfo.code,
              originalText: text,
              detected: true
            };
          }
        }
      }
      
      const numberMatch = text.match(/([\d,]+\.?\d*)/);
      if (numberMatch) {
        const amount = parseFloat(numberMatch[1].replace(/,/g, ''));
        if (amount > 0) {
          console.log(`Number detected: ${amount}, will show currency selector`);
          return {
            amount: amount,
            currency: null,
            originalText: text,
            detected: false
          };
        }
      }
    } else {
      const numberMatch = text.match(/([\d,]+\.?\d*)/);
      if (numberMatch) {
        const amount = parseFloat(numberMatch[1].replace(/,/g, ''));
        if (amount > 0) {
          console.log(`Manual mode - Number: ${amount}`);
          return {
            amount: amount,
            currency: null,
            originalText: text,
            detected: false
          };
        }
      }
    }
    
    console.log('No valid currency or number detected');
    return null;
  }

  extractAmountFromPattern(text, regex, divider = 1) {
    const match = text.match(regex);
    if (match) {
      const numberMatch = match[0].match(/([\d,]+\.?\d*)/);
      if (numberMatch) {
        const amount = parseFloat(numberMatch[1].replace(/,/g, ''));
        return amount / divider;
      }
    }
    return 0;
  }

  async fetchExchangeRate(fromCurrency, toCurrency, forceRefresh = false) {
    if (fromCurrency === toCurrency) {
      return 1;
    }

    const cacheKey = `${fromCurrency}_${toCurrency}`;
    
    if (!forceRefresh && this.rates[cacheKey]) {
      const ageHours = (Date.now() - this.rates[cacheKey].timestamp) / (1000 * 60 * 60);
      if (ageHours < 24) {
        console.log(`Using cached rate for ${fromCurrency} to ${toCurrency} (${ageHours.toFixed(1)}h old)`);
        return this.rates[cacheKey].rate;
      }
    }

    try {
      console.log(`Fetching fresh rate for ${fromCurrency} to ${toCurrency}...`);
      
      const response = await fetch(`${this.apiUrl}?source=${fromCurrency}&target=${toCurrency}`, {
        method: 'GET',
        headers: {
          'Accept': 'application/json'
        }
      });
      
      let rate = 1;
      
      if (response.ok) {
        const data = await response.json();
        console.log('API response:', data);
        
        if (data && Array.isArray(data) && data.length > 0) {
          rate = data[0].value || data[0].rate || data[0].mid || 1;
        } else if (data && typeof data === 'object') {
          rate = data.value || data.rate || data.mid || data.price || 1;
        }
      }

      if (rate === 1) {
        rate = this.getFallbackRate(fromCurrency, toCurrency);
        console.log(`Using fallback rate for ${fromCurrency} to ${toCurrency}: ${rate}`);
      }

      this.rates[cacheKey] = {
        rate: rate,
        timestamp: Date.now(),
        source: response.ok ? 'api' : 'fallback'
      };

      console.log(`Rate updated: 1 ${fromCurrency} = ${rate} ${toCurrency}`);
      return rate;

    } catch (error) {
      console.error('Error fetching exchange rate:', error);
      
      if (this.rates[cacheKey]) {
        console.log(`Using cached rate for ${fromCurrency} to ${toCurrency} due to API error`);
        return this.rates[cacheKey].rate;
      }
      
      const fallbackRate = this.getFallbackRate(fromCurrency, toCurrency);
      
      this.rates[cacheKey] = {
        rate: fallbackRate,
        timestamp: Date.now() - 1800000,
        source: 'fallback'
      };
      
      return fallbackRate;
    }
  }

  getFallbackRate(fromCurrency, toCurrency) {
    const toMYRRates = {
      'USD': 4.48, 'EUR': 4.89, 'GBP': 5.68, 'JPY': 0.0308,
      'SGD': 3.31, 'AUD': 2.98, 'CNY': 0.618, 'THB': 0.129,
      'IDR': 0.000291, 'KRW': 0.00337, 'HKD': 0.574, 'INR': 0.0537
    };

    if (toCurrency === 'MYR') {
      return toMYRRates[fromCurrency] || 1;
    }
    
    if (fromCurrency === 'MYR') {
      return 1 / (toMYRRates[toCurrency] || 1);
    }
    
    const sourceToMYR = toMYRRates[fromCurrency] || 1;
    const targetToMYR = toMYRRates[toCurrency] || 1;
    return sourceToMYR / targetToMYR;
  }

  async showConversionPopup() {
    if (this.isConverting) return;
    this.isConverting = true;

    const currencyData = this.detectCurrencyFromText(this.selectedText);
    if (!currencyData) {
      console.log('No valid number detected, not showing popup');
      this.isConverting = false;
      return;
    }

    if (!currencyData.currency) {
      this.createCurrencySelectorPopup(currencyData.amount);
      this.isConverting = false;
      return;
    }

    if (currencyData.currency === this.targetCurrency) {
      this.createSameCurrencyPopup(currencyData.amount, currencyData.currency);
      this.isConverting = false;
      return;
    }

    try {
      console.log('Converting:', currencyData.amount, currencyData.currency, 'to', this.targetCurrency);
      const rate = await this.fetchExchangeRate(currencyData.currency, this.targetCurrency);
      const convertedAmount = (currencyData.amount * rate).toFixed(2);
      
      this.createPopup(currencyData.amount, convertedAmount, currencyData.currency);
    } catch (error) {
      console.error('Conversion error:', error);
    }
    
    this.isConverting = false;
  }

  createCurrencySelectorPopup(amount) {
    this.hidePopup();

    this.popup = document.createElement('div');
    this.popup.className = 'currency-converter-popup';
    
    const converterContent = document.createElement('div');
    converterContent.className = 'converter-content';
    
    const converterHeader = document.createElement('div');
    converterHeader.className = 'converter-header';
    
    const converterTitle = document.createElement('span');
    converterTitle.className = 'converter-title';
    converterTitle.textContent = 'Select Source Currency';
    
    const converterClose = document.createElement('button');
    converterClose.className = 'converter-close';
    converterClose.textContent = '×';
    
    converterHeader.appendChild(converterTitle);
    converterHeader.appendChild(converterClose);
    
    const converterBody = document.createElement('div');
    converterBody.className = 'converter-body';
    
    const amountDisplay = document.createElement('div');
    amountDisplay.className = 'amount-display';
    amountDisplay.textContent = `Amount: ${amount.toLocaleString()}`;
    
    const currencySelectorGroup = document.createElement('div');
    currencySelectorGroup.className = 'currency-selector-group';
    
    const label = document.createElement('label');
    label.setAttribute('for', 'sourceCurrencySelect');
    label.textContent = 'From:';
    
    const selectElement = document.createElement('select');
    selectElement.id = 'sourceCurrencySelect';
    selectElement.className = 'source-currency-select';
    
    const defaultOption = document.createElement('option');
    defaultOption.value = '';
    defaultOption.textContent = 'Select currency...';
    selectElement.appendChild(defaultOption);
    
    this.supportedCurrencies
      .filter(currency => currency !== this.targetCurrency)
      .forEach(currency => {
        const option = document.createElement('option');
        option.value = currency;
        option.textContent = currency;
        selectElement.appendChild(option);
      });
    
    const convertButton = document.createElement('button');
    convertButton.id = 'convertButton';
    convertButton.className = 'convert-button';
    convertButton.textContent = `Convert to ${this.targetCurrency}`;
    convertButton.disabled = true;
    
    currencySelectorGroup.appendChild(label);
    currencySelectorGroup.appendChild(selectElement);
    currencySelectorGroup.appendChild(convertButton);
    
    converterBody.appendChild(amountDisplay);
    converterBody.appendChild(currencySelectorGroup);
    
    converterContent.appendChild(converterHeader);
    converterContent.appendChild(converterBody);
    
    this.popup.appendChild(converterContent);

    this.addCurrencySelectorEventListeners(amount);
    this.positionAndShowPopup();
  }

  addCurrencySelectorEventListeners(amount) {
    const closeBtn = this.popup.querySelector('.converter-close');
    const selectElement = this.popup.querySelector('#sourceCurrencySelect');
    const convertButton = this.popup.querySelector('#convertButton');
    
    if (!closeBtn || !selectElement || !convertButton) {
      console.error('Currency selector elements not found');
      return;
    }
    
    closeBtn.addEventListener('click', () => this.hidePopup());
    
    selectElement.addEventListener('change', (e) => {
      convertButton.disabled = !e.target.value;
    });
    
    convertButton.addEventListener('click', async () => {
      const selectedCurrency = selectElement.value;
      if (!selectedCurrency) {
        console.error('No source currency selected');
        return;
      }
      
      convertButton.disabled = true;
      convertButton.textContent = 'Converting...';
      
      try {
        const rate = await this.fetchExchangeRate(selectedCurrency, this.targetCurrency);
        const convertedAmount = (amount * rate).toFixed(2);
        
        this.createPopup(amount, convertedAmount, selectedCurrency);
      } catch (error) {
        console.error('Conversion error:', error);
        convertButton.disabled = false;
        convertButton.textContent = `Convert to ${this.targetCurrency}`;
      }
    });
  }

  createSameCurrencyPopup(amount, currency) {
    this.hidePopup();

    this.popup = document.createElement('div');
    this.popup.className = 'currency-converter-popup';
    
    const converterContent = document.createElement('div');
    converterContent.className = 'converter-content';
    
    const converterHeader = document.createElement('div');
    converterHeader.className = 'converter-header';
    
    const converterTitle = document.createElement('span');
    converterTitle.className = 'converter-title';
    converterTitle.textContent = 'Currency Converter';
    
    const converterClose = document.createElement('button');
    converterClose.className = 'converter-close';
    converterClose.textContent = '×';
    
    converterHeader.appendChild(converterTitle);
    converterHeader.appendChild(converterClose);
    
    const converterBody = document.createElement('div');
    converterBody.className = 'converter-body';
    
    const conversionResult = document.createElement('div');
    conversionResult.className = 'conversion-result';
    
    const convertedAmount = document.createElement('div');
    convertedAmount.className = 'converted-amount';
    convertedAmount.style.color = '#007bff';
    convertedAmount.style.fontSize = '16px';
    convertedAmount.textContent = `Already in ${currency}: ${this.formatCurrency(amount, currency)}`;
    
    conversionResult.appendChild(convertedAmount);
    converterBody.appendChild(conversionResult);
    converterContent.appendChild(converterHeader);
    converterContent.appendChild(converterBody);
    this.popup.appendChild(converterContent);

    this.addPopupEventListeners();
    this.positionAndShowPopup();
  }

  createPopup(originalAmount, convertedAmount, fromCurrency) {
    this.hidePopup();

    const cacheKey = `${fromCurrency}_${this.targetCurrency}`;

    this.popup = document.createElement('div');
    this.popup.className = 'currency-converter-popup';
    
    const converterContent = document.createElement('div');
    converterContent.className = 'converter-content';
    
    const converterHeader = document.createElement('div');
    converterHeader.className = 'converter-header';
    
    const converterTitle = document.createElement('span');
    converterTitle.className = 'converter-title';
    converterTitle.textContent = 'Currency Converter';
    
    const converterClose = document.createElement('button');
    converterClose.className = 'converter-close';
    converterClose.textContent = '×';
    
    converterHeader.appendChild(converterTitle);
    converterHeader.appendChild(converterClose);
    
    const converterBody = document.createElement('div');
    converterBody.className = 'converter-body';
    
    const conversionResult = document.createElement('div');
    conversionResult.className = 'conversion-result';
    
    const originalAmountDiv = document.createElement('div');
    originalAmountDiv.className = 'original-amount';
    originalAmountDiv.textContent = this.formatCurrency(originalAmount, fromCurrency);
    
    const arrow = document.createElement('div');
    arrow.className = 'arrow';
    arrow.textContent = '↓';
    
    const convertedAmountDiv = document.createElement('div');
    convertedAmountDiv.className = 'converted-amount';
    convertedAmountDiv.textContent = this.formatCurrency(parseFloat(convertedAmount), this.targetCurrency);
    
    conversionResult.appendChild(originalAmountDiv);
    conversionResult.appendChild(arrow);
    conversionResult.appendChild(convertedAmountDiv);
    
    const rateInfo = document.createElement('div');
    rateInfo.className = 'rate-info';
    
    const rateText = document.createTextNode(`Rate: 1 ${fromCurrency} = ${this.rates[cacheKey]?.rate.toFixed(4)} ${this.targetCurrency} `);
    rateInfo.appendChild(rateText);
    
    const rateAge = document.createElement('span');
    rateAge.className = 'rate-age';
    rateAge.textContent = `(${this.getRateAge(cacheKey)})`;
    rateInfo.appendChild(rateAge);
    
    const rateSource = document.createElement('span');
    rateSource.className = 'rate-source';
    rateSource.textContent = `[${this.rates[cacheKey]?.source || 'unknown'}]`;
    rateInfo.appendChild(rateSource);
    
    const refreshButton = document.createElement('button');
    refreshButton.className = 'refresh-rate';
    refreshButton.setAttribute('data-source', fromCurrency);
    refreshButton.setAttribute('data-target', this.targetCurrency);
    refreshButton.textContent = '🔄';
    rateInfo.appendChild(refreshButton);
    
    converterBody.appendChild(conversionResult);
    converterBody.appendChild(rateInfo);
    converterContent.appendChild(converterHeader);
    converterContent.appendChild(converterBody);
    this.popup.appendChild(converterContent);

    this.addPopupEventListeners();
    this.positionAndShowPopup();
  }

  formatCurrency(amount, currency) {
    const symbols = {
      'USD': '$', 'EUR': '€', 'GBP': '£', 'JPY': '¥', 
      'MYR': 'RM', 'SGD': 'S$', 'AUD': 'A$', 'HKD': 'HK$', 
      'INR': '₹', 'KRW': '₩'
    };
    
    const symbol = symbols[currency] || '';
    return `${symbol}${amount.toLocaleString()} ${currency}`;
  }

  addPopupEventListeners() {
    const closeBtn = this.popup.querySelector('.converter-close');
    const refreshBtn = this.popup.querySelector('.refresh-rate');
    
    if (closeBtn) {
      closeBtn.addEventListener('click', () => this.hidePopup());
    }
    
    if (refreshBtn) {
      refreshBtn.addEventListener('click', (e) => {
        const fromCurrency = e.target.getAttribute('data-source');
        const toCurrency = e.target.getAttribute('data-target');
        
        if (fromCurrency && toCurrency) {
          this.refreshRate(fromCurrency, toCurrency);
        } else {
          console.error('Missing currency data on refresh button');
        }
      });
    }
  }

  positionAndShowPopup() {
    this.popup.style.position = 'fixed';
    this.popup.style.left = `${Math.min(this.mouseX, window.innerWidth - 300)}px`;
    this.popup.style.top = `${Math.min(this.mouseY + 10, window.innerHeight - 200)}px`;
    this.popup.style.zIndex = '10000';

    document.body.appendChild(this.popup);
    console.log('Popup created and displayed');

    setTimeout(() => {
      this.hidePopup();
    }, 15000);
  }

  getRateAge(cacheKey) {
    if (!this.rates[cacheKey]) return 'unknown';
    
    const ageMs = Date.now() - this.rates[cacheKey].timestamp;
    const ageMinutes = Math.floor(ageMs / 60000);
    const ageHours = Math.floor(ageMinutes / 60);
    const ageDays = Math.floor(ageHours / 24);
    
    if (ageMinutes < 1) {
      const ageSeconds = Math.floor(ageMs / 1000);
      return `${ageSeconds}s ago`;
    } else if (ageMinutes < 60) {
      return `${ageMinutes}m ago`;
    } else if (ageHours < 24) {
      return `${ageHours}h ago`;
    } else {
      return `${ageDays}d ago`;
    }
  }

  async refreshRate(fromCurrency, toCurrency) {
    const refreshButton = this.popup.querySelector('.refresh-rate');
    
    if (!refreshButton) {
      console.error('Refresh button not found');
      return;
    }
    
    refreshButton.innerHTML = '⟳';
    refreshButton.disabled = true;
    
    try {
      const newRate = await this.fetchExchangeRate(fromCurrency, toCurrency, true);
      
      const currencyData = this.detectCurrencyFromText(this.selectedText);
      if (!currencyData) {
        console.error('Could not re-detect currency from selected text');
        refreshButton.innerHTML = '🔄';
        refreshButton.disabled = false;
        return;
      }
      
      const convertedAmount = (currencyData.amount * newRate).toFixed(2);
      
      const convertedElement = this.popup.querySelector('.converted-amount');
      const rateElement = this.popup.querySelector('.rate-info');
      
      if (!convertedElement || !rateElement) {
        console.error('Popup elements not found');
        refreshButton.innerHTML = '🔄';
        refreshButton.disabled = false;
        return;
      }
      
      convertedElement.textContent = this.formatCurrency(parseFloat(convertedAmount), toCurrency);
      
      rateElement.innerHTML = '';
      
      const cacheKey = `${fromCurrency}_${toCurrency}`;
      const rateText = document.createTextNode(`Rate: 1 ${fromCurrency} = ${newRate.toFixed(4)} ${toCurrency} `);
      rateElement.appendChild(rateText);
      
      const rateAge = document.createElement('span');
      rateAge.className = 'rate-age';
      rateAge.textContent = `(${this.getRateAge(cacheKey)})`;
      rateElement.appendChild(rateAge);
      
      const rateSource = document.createElement('span');
      rateSource.className = 'rate-source';
      rateSource.textContent = `[${this.rates[cacheKey]?.source || 'unknown'}]`;
      rateElement.appendChild(rateSource);
      
      const newRefreshBtn = document.createElement('button');
      newRefreshBtn.className = 'refresh-rate';
      newRefreshBtn.setAttribute('data-source', fromCurrency);
      newRefreshBtn.setAttribute('data-target', toCurrency);
      newRefreshBtn.textContent = '🔄';
      rateElement.appendChild(newRefreshBtn);
      
      newRefreshBtn.addEventListener('click', (e) => {
        const source = e.target.getAttribute('data-source');
        const target = e.target.getAttribute('data-target');
        this.refreshRate(source, target);
      });
      
    } catch (error) {
      console.error('Failed to refresh rate:', error);
      refreshButton.innerHTML = '🔄';
      refreshButton.disabled = false;
    }
  }

  hidePopup() {
    if (this.popup) {
      this.popup.remove();
      this.popup = null;
    }
  }
}

// Initialize the converter when the page loads
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    console.log('Initializing Currency Converter with context menu support...');
    new CurrencyConverter();
  });
} else {
  console.log('Initializing Currency Converter with context menu support...');
  new CurrencyConverter();
}