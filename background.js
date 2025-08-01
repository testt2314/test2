// Background script for currency converter extension

class BackgroundService {
  constructor() {
    this.init();
  }

  init() {
    // Set default settings on installation
    browser.runtime.onInstalled.addListener(this.handleInstall.bind(this));
    
    // Handle Firefox startup
    browser.runtime.onStartup.addListener(this.handleStartup.bind(this));
    
    // Handle browser action clicks
    if (browser.browserAction && browser.browserAction.onClicked) {
      browser.browserAction.onClicked.addListener(this.handleBrowserAction.bind(this));
    }

    // Create context menu
    this.createContextMenu();

    // Handle context menu clicks
    browser.contextMenus.onClicked.addListener(this.handleContextMenuClick.bind(this));
  }

  createContextMenu() {
    browser.contextMenus.create({
      id: "convert-currency",
      title: "Convert Currency",
      contexts: ["selection"]
    });
  }

  handleContextMenuClick(info, tab) {
    if (info.menuItemId === "convert-currency") {
      // Send message to content script to convert the selected text
      browser.tabs.sendMessage(tab.id, {
        action: 'convertSelectedText',
        selectedText: info.selectionText
      }).catch(() => {
        console.log('Failed to send convert message to tab');
      });
    }
  }

  handleInstall(details) {
    if (details.reason === 'install') {
      // Set default target currency to MYR and enable auto source detection
      browser.storage.sync.set({
        targetCurrency: 'MYR',
        autoDetectSource: true,
        apiUrl: 'https://wise.com/rates/live',
        lastSettingsUpdate: Date.now()
      });
      
      console.log('Currency converter extension installed with default target: MYR');
    } else if (details.reason === 'update') {
      // On update, don't automatically refresh rates
      console.log('Extension updated - rates will refresh when needed');
    }
  }

  handleStartup() {
    console.log('Firefox started - Currency converter background service ready');
    // Remove automatic rate refresh on startup
    // Rates will only refresh when they are 1+ day old or manually refreshed
  }

  async triggerRateRefresh() {
    try {
      // Wait a bit for tabs to load
      setTimeout(async () => {
        const tabs = await browser.tabs.query({});
        
        tabs.forEach(tab => {
          browser.tabs.sendMessage(tab.id, {
            action: 'startupRateRefresh'
          }).catch(() => {
            // Ignore errors for tabs that don't have the content script
          });
        });
        
        console.log('Startup rate refresh triggered for all tabs');
      }, 2000); // 2 second delay
      
    } catch (error) {
      console.error('Failed to trigger startup rate refresh:', error);
    }
  }

  handleBrowserAction(tab) {
    // Open the options page when extension icon is clicked
    browser.runtime.openOptionsPage();
  }
}

// Initialize background service
new BackgroundService();