document.addEventListener('DOMContentLoaded', function() {
  const targetCurrencySelect = document.getElementById('targetCurrency');
  const autoDetectSourceCheckbox = document.getElementById('autoDetectSource');
  const apiUrlInput = document.getElementById('apiUrl');
  const saveButton = document.getElementById('saveButton');
  const refreshRatesButton = document.getElementById('refreshRatesButton');
  const statusMessage = document.getElementById('statusMessage');
  
  // Load saved settings
  browser.storage.sync.get(['targetCurrency', 'autoDetectSource', 'apiUrl'], function(result) {
    if (result.targetCurrency) {
      targetCurrencySelect.value = result.targetCurrency;
    } else {
      // Default to MYR
      targetCurrencySelect.value = 'MYR';
    }
    
    // Load auto-detect setting (default to true)
    autoDetectSourceCheckbox.checked = result.autoDetectSource !== undefined ? result.autoDetectSource : true;
    
    // Load API URL (default to Wise)
    apiUrlInput.value = result.apiUrl || 'https://wise.com/rates/live';
  });
  
  // Save settings
  saveButton.addEventListener('click', function() {
    const targetCurrency = targetCurrencySelect.value;
    const autoDetectSource = autoDetectSourceCheckbox.checked;
    const apiUrl = apiUrlInput.value.trim() || 'https://wise.com/rates/live';
    
    browser.storage.sync.set({
      targetCurrency: targetCurrency,
      autoDetectSource: autoDetectSource,
      apiUrl: apiUrl,
      lastSettingsUpdate: Date.now()
    }, function() {
      showStatusMessage('Settings saved successfully!', 'success');
      
      // Notify content scripts about the change
      browser.tabs.query({}, function(tabs) {
        tabs.forEach(tab => {
          browser.tabs.sendMessage(tab.id, {
            action: 'settingsUpdated',
            targetCurrency: targetCurrency,
            autoDetectSource: autoDetectSource,
            apiUrl: apiUrl
          }).catch(() => {
            // Ignore errors for tabs that don't have the content script
          });
        });
      });
    });
  });

  // Refresh all rates
  refreshRatesButton.addEventListener('click', function() {
    refreshRatesButton.disabled = true;
    refreshRatesButton.textContent = '🔄 Refreshing...';
    
    // Send refresh message to all tabs
    browser.tabs.query({}, function(tabs) {
      let completedTabs = 0;
      const totalTabs = tabs.length;
      
      if (totalTabs === 0) {
        resetRefreshButton();
        showStatusMessage('No active tabs found', 'success');
        return;
      }
      
      tabs.forEach(tab => {
        browser.tabs.sendMessage(tab.id, {
          action: 'refreshAllRates'
        }).then(() => {
          completedTabs++;
          if (completedTabs === totalTabs) {
            resetRefreshButton();
            showStatusMessage('All rates refreshed successfully!', 'success');
          }
        }).catch(() => {
          completedTabs++;
          if (completedTabs === totalTabs) {
            resetRefreshButton();
            showStatusMessage('Rates refreshed (some tabs may not have the extension active)', 'success');
          }
        });
      });
      
      // Fallback timeout
      setTimeout(() => {
        if (refreshRatesButton.disabled) {
          resetRefreshButton();
          showStatusMessage('Rate refresh completed', 'success');
        }
      }, 5000);
    });
  });
  
  function resetRefreshButton() {
    refreshRatesButton.disabled = false;
    refreshRatesButton.textContent = '🔄 Refresh All Rates Now';
  }
  
  function showStatusMessage(message, type) {
    statusMessage.textContent = message;
    statusMessage.className = `status-message status-${type}`;
    statusMessage.style.display = 'block';
    
    setTimeout(() => {
      statusMessage.style.display = 'none';
    }, 3000);
  }
});