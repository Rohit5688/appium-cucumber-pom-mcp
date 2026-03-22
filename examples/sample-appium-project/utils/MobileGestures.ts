import { browser } from '@wdio/globals';

/**
 * Cross-platform W3C Gesture abstractions for Appium.
 * Use these in Page Objects for swipe, scroll, and long-press actions.
 */
export class MobileGestures {
  /**
   * Swipe up (scroll content down).
   */
  static async swipeUp(percentage: number = 0.8) {
    const { width, height } = await browser.getWindowSize();
    const startX = width / 2;
    const startY = height * percentage;
    const endY = height * (1 - percentage);

    await browser.performActions([{
      type: 'pointer',
      id: 'finger1',
      parameters: { pointerType: 'touch' },
      actions: [
        { type: 'pointerMove', duration: 0, x: startX, y: startY },
        { type: 'pointerDown', button: 0 },
        { type: 'pause', duration: 200 },
        { type: 'pointerMove', duration: 500, x: startX, y: endY },
        { type: 'pointerUp', button: 0 }
      ]
    }]);
    await browser.releaseActions();
  }

  /**
   * Swipe down (scroll content up).
   */
  static async swipeDown(percentage: number = 0.8) {
    const { width, height } = await browser.getWindowSize();
    const startX = width / 2;
    const startY = height * (1 - percentage);
    const endY = height * percentage;

    await browser.performActions([{
      type: 'pointer',
      id: 'finger1',
      parameters: { pointerType: 'touch' },
      actions: [
        { type: 'pointerMove', duration: 0, x: startX, y: startY },
        { type: 'pointerDown', button: 0 },
        { type: 'pause', duration: 200 },
        { type: 'pointerMove', duration: 500, x: startX, y: endY },
        { type: 'pointerUp', button: 0 }
      ]
    }]);
    await browser.releaseActions();
  }

  /**
   * Long press on an element for a given duration.
   */
  static async longPress(element: WebdriverIO.Element, durationMs: number = 1500) {
    const location = await element.getLocation();
    const size = await element.getSize();
    const x = Math.round(location.x + size.width / 2);
    const y = Math.round(location.y + size.height / 2);

    await browser.performActions([{
      type: 'pointer',
      id: 'finger1',
      parameters: { pointerType: 'touch' },
      actions: [
        { type: 'pointerMove', duration: 0, x, y },
        { type: 'pointerDown', button: 0 },
        { type: 'pause', duration: durationMs },
        { type: 'pointerUp', button: 0 }
      ]
    }]);
    await browser.releaseActions();
  }

  /**
   * Scroll until an element with the given text is visible (Android UiScrollable).
   */
  static async scrollToText(text: string) {
    await browser.execute('mobile: scroll', { strategy: 'accessibility id', selector: text });
  }

  /**
   * Handle a native alert by accepting or dismissing it.
   */
  static async handleAlert(accept: boolean = true) {
    if (accept) {
      await browser.acceptAlert();
    } else {
      await browser.dismissAlert();
    }
  }
}
