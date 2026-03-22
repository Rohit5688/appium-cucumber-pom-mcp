import { Before, After, BeforeAll, AfterAll, Status } from '@cucumber/cucumber';
import { browser } from '@wdio/globals';

/**
 * Cucumber Hooks — Lifecycle management for Appium sessions.
 */

BeforeAll(async function () {
  // Global setup — Appium session will be started by WebdriverIO config
  console.log('[Hooks] Test suite starting...');
});

Before(async function (scenario) {
  console.log(`[Hooks] Starting scenario: ${scenario.pickle.name}`);
});

After(async function (scenario) {
  // Capture screenshot on failure
  if (scenario.result?.status === Status.FAILED) {
    try {
      const screenshot = await browser.takeScreenshot();
      this.attach(screenshot, 'image/png');
      console.log('[Hooks] Screenshot captured for failed scenario');

      // Also log the page source for debugging
      const pageSource = await browser.getPageSource();
      this.attach(pageSource, 'text/xml');
      console.log('[Hooks] Page source captured for failed scenario');
    } catch (err) {
      console.error('[Hooks] Failed to capture screenshot:', err);
    }
  }
});

AfterAll(async function () {
  console.log('[Hooks] Test suite complete.');
});
