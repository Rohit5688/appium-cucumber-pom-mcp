# Prompt Cheatbook

This cheatbook is designed for both human developers and AI agents (Cursor, Claude, AppForge). Use these "Golden Prompts" to ensure zero-hand-holding mobile automation.

> [!TIP]
> **Pro Tip**: When using these prompts, always include the phrase "Follow the AppForge Protocol" to trigger established, POM-first mobile patterns.

## 🚀 1. Project Onboarding & Repair
*Establish context and fix infrastructure issues in the first 5 minutes.*

<Steps>
1.  **Project Initialization**: 
    > "Initialize a new Appium-Cucumber-POM project using AppForge. Setup mcp-config.json with Android capabilities for a Pixel 8 emulator."
2.  **Architectural Warm-up**: 
    > "Establish session context. Run `analyze_codebase` to map current Page Objects and BDD primitives. Sync with `mcp-config.json`."
3.  **Appium Readiness Check**: 
    > "Check if the local environment is ready for Appium. If the Android SDK or UIAutomator2 driver is missing, provide install commands."
4.  **Config Hardening**: 
    > "Audit mcp-config.json. Ensure `paths` are mapped to the `src/` directory and set `waitStrategy` to `networkidle`."
5.  **Baseline Repair**: 
    > "Missing baseline files in the `src/utils` directory. Regenerate the missing Appium wrappers without overwriting my custom logic."
</Steps>

---

## ✍️ 2. Code Generation (Mobile Focus)
*From simple interactions to complex multi-screen mobile flows.*

### Standard UI Elements
6.  **Login Screen**: 
    > "Create a login test for the mobile app. Use `accessibility id` for the username and password fields. Generate a `LoginPage` object."
7.  **Navigation Tray**: 
    > "Generate a test for the bottom navigation tray. Verify all 4 tabs (Home, Search, Orders, Profile) are clickable and navigate correctly."
8.  **Form Submission**: 
    > "Create a test for the 'User Registration' screen. Include validation for native date pickers and dropdown selectors."

### Advanced Mobile Logic
9.  **Biometric Authentication**: 
    > "Generate a test scenario for Fingerprint login. Simulate the system biometric prompt and trigger a successful authentication via Appium."
10. **Deep Link Orchestration**: 
    > "Trigger a deep link to `app://product/12345`. Verify the product details screen is displayed and the 'Add to Cart' button is enabled."
11. **Native Alerts & Dialogs**: 
    > "Interact with the 'Location Permission' system dialog. Click 'Allow while using the app' and verify the map view initializes."
12. **Orientation & Responsiveness**: 
    > "Start the app in Portrait mode, verify the header, then rotate to Landscape. Ensure the layout adjusts without element overlap."
13. **Swipe & Scroll Logic**: 
    > "Perform a vertical swipe-down on the 'Product Feed' until the element with text 'Special Offer' is visible and clickable."
14. **Push Notification Verification**: 
    > "Send a push notification via the API, open the notification shade, and verify the message content matches the expected payload."
15. **Backgrounding & Resume**: 
    > "Background the app for 10 seconds during the checkout flow. Resume and verify the session state and timer are preserved."

---

## 🩹 3. Autonomous Healing & Hardening
*Fixing selector drift and flakiness on real devices and emulators.*

16. **Selector Discovery**: 
    > "The 'Pay Now' button selector is failing. Inspect the UI hierarchy, find the current `resource-id` or `content-desc`, and update the Page Object."
17. **Stability Enhancement**: 
    > "The 'Loading Spinner' wait is intermittent. Wrap it in a custom `waitForElement` utility with a 15-second timeout and 1-second polling."
18. **Visual Parity Training**: 
    > "Enable `visualParity`. Capture a screenshot of the broken 'Cart' state and use it to train the healer on the new dynamic element positions."
19. **A11y Label Hardening**: 
    > "Run an accessibility scan on the 'Settings' screen. Automatically update any elements missing `content-description` with semantic labels."
20. **Self-Healing Verification**: 
    > "I updated the native ID of the 'Search Bar'. Run the healer to verify the `SearchPage` is still functional and update the locator."

---

## 🧹 4. Maintenance & Refactoring
*Keeping the mobile automation codebase clean and architectural.*

21. **POM Inheritance Audit**: 
    > "Ensure all Page Objects in `src/pages` extend the `BasePage` class. Automatically add the missing inheritance and imports."
22. **Duplicate Logic Cleanup**: 
    > "Scan all step definitions. Identify duplicate 'Login' logic and consolidate it into a single reusable `CommonFlows` service."
23. **Unused Code Purge**: 
    > "Find all methods in `ProductPage.ts` that are not called by any `.feature` file. Delete the unused code to keep the POM lean."
24. **Locator Standardization**: 
    > "Convert all XPaths in the `src/locators` directory to Appium-recommended `accessibility id` or `id` locators."
25. **Utility Extraction**: 
    > "I have repeated 'formatDate' logic in multiple screens. Extract this into a shared `DeviceUtils.ts` file in the utils directory."

---

## 🧪 5. Data & Device Management
*Managing test data and device states with high fidelity.*

26. **Mobile Data Factory**: 
    > "Create a `MobileUserFactory` using Faker.js. Generate data for a 'ProUser' with a valid mobile number and random subscription ID."
27. **Mocking Native APIs**: 
    > "Mock the 'Battery Status' API. Force a 'Low Battery' state (15%) and verify the app displays the power-saving warning."
28. **State Injection**: 
    > "Inject a valid authentication token into the app's local storage to bypass the login screen for the 'Profile' smoke test."
29. **Device Log Extraction**: 
    > "The test failed. Use Appium to fetch the last 100 lines of Logcat (Android) or Syslog (iOS) and identify the root cause."
30. **Cleanup Hook**: 
    > "Create an `After` hook that clears the app cache and resets permissions after every scenario to ensure a clean test state."

---

## 🚀 6. CI/CD & Migration
*Moving to the cloud and migrating from legacy frameworks.*

31. **GitHub Action Generation**: 
    > "Generate a CI pipeline for GitHub Actions. Include steps for starting the Android Emulator, running Appium, and executing @smoke tests."
32. **Cloud Provider Setup**: 
    > "Update `mcp-config.json` to support SauceLabs. Add the `remoteUrl` and credentials from the environment variables."
33. **Espresso to Appium Migration**: 
    > "Convert this Espresso Java test (attached) into an AppForge Page Object and a Cucumber Feature file."
34. **Detox to Appium-Cucumber**: 
    > "Migrate the mobile login flow from Detox to Appium. Preserve the existing navigation steps and validation logic."
35. **Parallel Execution Tuning**: 
    > "Configure the project for parallel execution on 3 devices. Split the feature files based on the 'platform' tag."

---

**Mastering the prompt is mastering the tool. 🚀**