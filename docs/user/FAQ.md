---
title: ❓ Frequently Asked Questions
description: Top answers to recurring issues and common questions about AppForge.
---

import { Tabs, TabItem } from '@astrojs/starlight/components';

This compilation of frequently asked questions is based on common patterns and user reports. For troubleshooting specific error messages or session connection errors, see the [Troubleshooting Guide](/AppForge/repo/user/troubleshooting/).

---

## Architecture & Concepts

### How does AppForge differ from raw Appium?
AppForge is an **MCP (Model Context Protocol) Server**, not a test framework. It acts as an intelligence orchestration layer that sits *on top* of Appium, WebdriverIO, and Cucumber BDD. It allows AI agents to inspect your live mobile app UI, understand the visual hierarchy, and write native Page Object code autonomously.

### Why does AppForge use Cucumber BDD?
We enforce Cucumber BDD to minimize AI "hallucinations" and maximize token efficiency. If an LLM generates raw Appium scripts (e.g., thousands of lines of `driver.findElement`), it scales poorly and breaks easily. By mapping natural language intent (`When I tap the Login button`) to semantic Page Objects, generated test files are small, readable, and highly reusable. 

### Does AppForge manage my Appium server?
**Yes and No.** By default, when you use the `check_environment` or `start_appium_session` tool, AppForge will attempt to ping an existing server at the URL defined in your capability config. If it cannot find one, it expects you (or your CI runner) to have started `appium` in the background.

---

## Locators & Selectors

### Why aren't my selectors being found by the AI?
Mobile locators are fundamentally different from web DOM locators. The most stable mobile locator strategy is `accessibility-id`. 

If your app uses raw `xpath` to match deep layout hierarchies (`//android.widget.FrameLayout[2]/android.widget.TextView`), tests will break when UI padding changes. 
**Solution:** Instrument your Android app with `contentDescription` and iOS app with `accessibilityIdentifier` tags. 

### What should I do if the AI keeps generating XPath?
Tell the AI to run the `audit_mobile_locators` tool. It will scan your project, calculate a "brittleness score", and report exactly which elements are relying on XPath. You can then instruct the AI to rewrite them using `accessibility id` or `-ios class chain`.

### How do I fix a broken selector after a UI change?
You don't need to manually rewrite it. Open your AI client and prompt:
> "Run the @smoke suite and self-heal any failing selectors."

AppForge will execute the `run_cucumber_test` tool, catch the "no such element" crash, use `self_heal_test` to pull the latest Device XML tree, find the replacement selector, verify it on the live device, and update your Page Object natively.

---

## CI/CD and Emulators

### Can I run AppForge in GitHub Actions?
**Yes.** AppForge headless commands work perfectly in CI. However, because you need a mobile context, you must either:
1. Boot a headless Android Emulator within the GitHub Actions runner (requires `macos-latest` for hardware acceleration).
2. Connect to a Cloud Device Farm (like BrowserStack or Sauce Labs).
See the [Continuous Integration](/AppForge/repo/maintenance/continuousintegration/) guide for copy-paste workflows.

### iOS simulations are failing or timing out
iOS testing requires physical macOS hardware and Xcode. If your local Xcode version is misaligned with the iOS Simulator SDK version, Appium will fail to start the `XCUITest` driver. Ensure you have run:
```bash
appium driver install xcuitest
```
and run the `appium-doctor` tool. Follow instructions to correct Xcode command line tools.

---

## AI Agent Integration

### I asked the AI to map navigating my app, but it created weird test files
If you want to understand the current screens and multi-screen flow, use the `export_navigation_map` tool. This will output a Mermaid graph of known app states. If you want it to explore *live*, use `start_appium_session` combined with `inspect_ui_hierarchy` recursively. Do not ask it to "write tests to map the app".

### The AI gets confused about which `.apk` or `.app` to use
The AI only acts on the paths in `mcp-config.json`. If you built a new release binary and the AI is acting on an old one, update your config:
> "Use the manage_config tool to inject the new app path: /Users/me/app/build/outputs/apk/debug/app-debug.apk for Android"

### Does the AI learn from my architectural preferences?
**Yes.** If you correct the AI's generated code (for example, telling it you prefer using custom assertion helpers rather than raw `expect` statements), tell it:
> "Use train_on_example to save this preference globally."
AppForge will write it to `.AppForge/mcp-learning.json` and auto-inject it into the prompt context for all future code generation.
