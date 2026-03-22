import { browser, $ } from '@wdio/globals';

/**
 * BasePage — Abstract base for all Page Objects.
 * All page classes should extend this to inherit common mobile actions.
 */
export abstract class BasePage {
  /**
   * Wait for an element to be displayed, then return it.
   */
  protected async waitForElement(selector: string, timeout: number = 10000) {
    const element = await $(selector);
    await element.waitForDisplayed({ timeout });
    return element;
  }

  /**
   * Click an element after waiting for it to appear.
   */
  protected async click(selector: string) {
    const element = await this.waitForElement(selector);
    await element.click();
  }

  /**
   * Type text into an input field after clearing it.
   */
  protected async type(selector: string, value: string) {
    const element = await this.waitForElement(selector);
    await element.clearValue();
    await element.setValue(value);
  }

  /**
   * Get the text content of an element.
   */
  protected async getText(selector: string): Promise<string> {
    const element = await this.waitForElement(selector);
    return await element.getText();
  }

  /**
   * Check if an element is currently displayed.
   */
  protected async isDisplayed(selector: string): Promise<boolean> {
    try {
      const element = await $(selector);
      return await element.isDisplayed();
    } catch {
      return false;
    }
  }

  /**
   * Wait for the element to disappear.
   */
  protected async waitForElementGone(selector: string, timeout: number = 10000) {
    const element = await $(selector);
    await element.waitForDisplayed({ timeout, reverse: true });
  }

  // ─── WebView Context Switching ─────────────────────────

  /**
   * Switch to WebView context (for hybrid apps).
   * Returns the WebView context name.
   */
  protected async switchToWebView(): Promise<string> {
    const contexts = await browser.getContexts() as string[];
    const webView = contexts.find(c => c.includes('WEBVIEW'));
    if (!webView) throw new Error('No WebView context found. Available: ' + contexts.join(', '));
    await browser.switchContext(webView);
    return webView;
  }

  /**
   * Switch back to NATIVE_APP context.
   */
  protected async switchToNativeContext(): Promise<void> {
    await browser.switchContext('NATIVE_APP');
  }

  /**
   * Get all available contexts (NATIVE_APP, WEBVIEW_xxx).
   */
  /**
   * Get all available contexts (NATIVE_APP, WEBVIEW_xxx).
   */
  protected async getContexts(): Promise<string[]> {
    return await browser.getContexts() as string[];
  }

  // ─── App Lifecycle Helpers ────────────────────────────

  /**
   * Open a deep link / URL scheme to navigate directly to a screen.
   * Android: Uses 'mobile: deepLink'
   * iOS: Uses 'mobile: deepLink' or 'driver.url()'
   */
  protected async openDeepLink(url: string) {
    await browser.url(url);
  }

  /**
   * Handle native permission dialogs (Allow/Deny).
   * Common for Location, Camera, Notifications, Contacts, etc.
   */
  protected async handlePermissionDialog(accept: boolean = true) {
    try {
      const caps = browser.capabilities as any;
      const isIOS = caps.platformName?.toLowerCase() === 'ios';

      if (isIOS) {
        // iOS permission alert
        const btnLabel = accept ? 'Allow' : 'Don\'t Allow';
        const btn = await $(`~${btnLabel}`);
        if (await btn.isExisting()) await btn.click();
      } else {
        // Android permission dialog
        const btnId = accept
          ? 'com.android.permissioncontroller:id/permission_allow_button'
          : 'com.android.permissioncontroller:id/permission_deny_button';
        const btn = await $(`id=${btnId}`);
        if (await btn.isExisting()) await btn.click();
      }
    } catch {
      // No permission dialog present — ignore
    }
  }

  /**
   * Simulate biometric authentication (Touch ID / Face ID / Fingerprint).
   * Requires Appium to be started with --relaxed-security.
   */
  protected async simulateBiometric(success: boolean = true) {
    const caps = browser.capabilities as any;
    const isIOS = caps.platformName?.toLowerCase() === 'ios';

    if (isIOS) {
      await browser.execute('mobile: sendBiometricMatch', { type: 'touchId', match: success });
    } else {
      // Android fingerprint simulation
      await browser.execute('mobile: fingerPrint', { fingerprintId: success ? 1 : 0 });
    }
  }

  /**
   * Put the app to background for a duration (seconds), then bring it back.
   */
  protected async backgroundApp(seconds: number = 3) {
    await browser.execute('mobile: backgroundApp', { seconds });
  }

  /**
   * Terminate and re-launch the app (cold start).
   */
  protected async restartApp(bundleId: string) {
    await browser.execute('mobile: terminateApp', { bundleId });
    await browser.execute('mobile: activateApp', { bundleId });
  }
}
