# 🚚 Migration Guide: Native to Appium

Porting legacy mobile tests (Espresso, XCUITest, Detox) to AppForge is automated via the `migrate_test` tool, which acts as a heuristic compiler to translate logical flow paradigms into the Appium MCP triad (Feature + POM + Steps).

---

## 🚀 Migration Workflow

You should not manually convert files line-by-line. Instead, provide the legacy source code to the AI and run the migration tool.

### Recommended Prompt
> *"I want to migrate this Espresso Java test for our login screen: [paste code]. Use the `migrate_test` tool. Rewrite this as a TypeScript Appium Page Object extending `BasePage` and a Gherkin feature file."*

---

## 🧠 Mapping Logic

The migration engine enforces strict architectural transformations:

### 1. Espresso (Android)
- **Locators**: `withId(R.id.user)` → `$('id=com.app:id/user')`
- **Actions**: `perform(typeText("..."))` → `await element.setValue("...")`
- **Assertions**: `check(matches(isDisplayed()))` → `await expect(element).toBeDisplayed()`

### 2. XCUITest (iOS)
- **Locators**: `app.buttons["Login"]` → `$('~Login')`
- **Actions**: `.tap()` → `await element.click()`
- **Assertions**: `XCTAssertTrue(.exists)` → `await expect(element).toExist()`

### 3. Detox (JS)
- **Locators**: `by.id('testID')` → `$('~testID')`
- **Actions**: `.typeText("...")` → `await element.setValue("...")`
- **Assertions**: `.toBeVisible()` → `await expect(element).toBeDisplayed()`

---

## 🛠️ The Output Standard

Every migration results in three components:

### 1. Page Object (`.ts`)
```typescript
import { BasePage } from './BasePage';

export class LoginPage extends BasePage {
    get username() { return $('~user_input'); }
    get submitBtn() { return $('~login_btn'); }

    async login(user: string) {
        await this.username.setValue(user);
        await this.submitBtn.click();
    }
}
```

### 2. Feature File (`.feature`)
```gherkin
Scenario: Successful Login
    Given I launch the application
    When I login with valid credentials
    Then I should see the dashboard
```

### 3. Step Definitions (`.steps.ts`)
Implements the Gherkin steps using the Page Object methods.

---

## 💡 Pro Tips

- **Live Context**: Start an Appium session on the target screen *before* migrating. This allows the AI to verify that the legacy resource IDs match the live UI hierarchy.
- **Refactor During Move**: Use the migration to replace flaky native logic with AppForge's `MobileGestures` utility for complex interactions like swiping or scrolling.
- **Atomic Write**: Use `create_test_atomically` to save the migrated suite after the AI generates it.
