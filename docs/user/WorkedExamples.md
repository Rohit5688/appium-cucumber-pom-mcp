---
title: 🚀 Workflow: End-to-End Test Built by AI
description: See how an AppForge user prompts an AI Agent to connect to a device, inspect mobile elements, and self-heal broken selectors entirely via MCP.
---

import { Steps } from '@astrojs/starlight/components';

This guide walks through exactly how to collaborate with AppForge to build a resilient, native mobile test suite from absolute scratch, using nothing but natural language prompts.

We will simulate building a test for an Android app's "Login & Dashboard" flow.

---

## Step 1: Connecting the Device

Before writing any localized code, the AI must establish a baseline connection with your mobile app binary (APK) running on an emulator or plugged-in device.

**You say:**
> "Please start an Appium session connecting to my Android emulator profile 'Pixel_8' as defined in the config."

**AppForge Agent executes:**
1. Calls `start_appium_session(profileName: "Pixel_8")`.
2. AppForge launches the app, initializes the driver, and hooks into the live Appium session. The sessionId is persisted.

---

## Step 2: Native UI Extraction

Mobile DOMs (XML hierarchies) are entirely different from web DOMs. Never let the AI guess locators.

**You say:**
> "I am on the Login Screen. Please inspect the UI Hierarchy and extract the most resilient accessibility-id or resource-id locators for the Username field, Password field, and Submit button."

**AppForge Agent executes:**
1. Calls `inspect_ui_hierarchy()`.
2. AppForge fetches the raw XML from the Appium server, sanitizes it, and maps it back to the context.

*Agent response:* 
"I found the elements. Username has accessibility-id `input-email`, Password has accessibility-id `input-password`, and the button has resource-id `com.example.app:id/btn_login`."

---

## Step 3: Page Object Generation

Now that the AI holds the valid locators, ask it to construct the strict Page Object Model. 

**You say:**
> "Using those exact locators, build the LoginPage.ts Page Object. Add a method that inputs credentials, taps submit, and then waits for the Dashboard container to be visible."

**AppForge Agent executes:**
1. Calls `generate_cucumber_pom` for the structural prompt logic. 
2. Generates the TypeScript file `LoginPage.ts`.
3. Calls `validate_and_write(files: [{"path": "pages/LoginPage.ts", "content": "..."}])` to validate syntax and write it to disk.

---

## Step 4: Gherkin Feature Generation

Write the BDD step definitions and feature file. 

**You say:**
> "Generate a Cucumber feature file for 'User Authentication' checking a valid login scenario. Then generate the corresponding step definitions using the LoginPage methods. Do not write untested locators inside the step definitions."

**AppForge Agent executes:**
1. Writes `features/login.feature`.
2. Writes `steps/login.steps.ts` importing `LoginPage.ts`.
3. Calls `validate_and_write()` to safely save the files.

---

## Step 5: Clean Execution

A test isn't finished until it has been verified structurally against the local Appium state.

**You say:**
> "Execute the @login suite."

**AppForge Agent executes:**
1. Calls `run_cucumber_test(tags: "@login")`.
2. Background polls using `check_test_status` until the tests are routed through WebdriverIO and Appium.

*Agent response:*
"Execution completed. 1 scenario passed successfully."

---

## What if a test fails? (Self-Healing Flow)

Mobile padding arrays frequently break `xpaths`. If a selector fails, do not fix it yourself. Tell the system to fix it on the live device.

**You say:**
> "The login test failed because 'Submit' element was not found. The developers just updated the UI framework. Heal it."

**AppForge Agent executes:**
1. Ingests the output failure stack and calls `self_heal_test(testOutput)`.
2. Parses the error and live XML to find viable candidate selectors via fuzzy matching.
3. Tests the best candidate independently by executing `verify_selector(candidate)`.
4. If exists on device, it calls `heal_and_verify_atomically()` to securely swap the logic.
5. Updates `LoginPage.ts` via `validate_and_write`.
6. Executes `train_on_example` pointing to the new `issuePattern` and `solution` enforcing that "Accessibility IDs must replace old resource-ids for buttons moving forward".

Using this workflow enforces strict mobile abstraction separation, resulting in enterprise-grade test automation via chat.
