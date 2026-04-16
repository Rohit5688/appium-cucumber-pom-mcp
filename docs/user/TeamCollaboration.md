# 👥 Team Collaboration & Learning

AppForge doesn't just write code—it **Learns** from your mobile team's unique patterns. It captures "tribal knowledge" into a persistent project brain to ensure consistency and reliability as your suite scales.

---

## 🧠 1. The Continuous Learning Loop

### Manual Training: `train_on_example`
If the AI generates a locator or gesture that doesn't fit your app's unique behavior, you can explicitly teach it the "Gold Standard" fix.

- **Issue Pattern**: e.g., "Scrolling to 'Terms of Service'"
- **Solution**: e.g., "Use `MobileGestures.scrollUntilVisible('~tos_link')` instead of a raw swipe."

### Autonomous Training: `heal_and_verify_atomically`
When a self-heal fix is verified on a live device, AppForge **automatically** saves that fix into the project brain. The AI will never make the same mistake twice on that screen.

---

## 🏷️ 2. Rule Zero: `@mcp-learn`

Developers can inject "Tribal Knowledge" directly into the source code. During codebase analysis, AppForge extracts any comments starting with `@mcp-learn` and injects them as high-priority instructions into the AI's prompt.

```typescript
// @mcp-learn: On the 'Payment' screen, always call 'waitForLoader()' before clicking 'Pay'
async submitPayment() { 
  // ... 
}
```

---

## 📄 3. Knowledge Export

### `export_team_knowledge`
As your mobile automation suite grows, so does the `.AppForge/mcp-learning.json` file. You can convert this raw data into a human-readable Markdown table to review what the AI has learned.

---

## 🤝 4. Benefits for the Team

- **Zero-Friction Onboarding**: New engineers inherit the collective wisdom of the team immediately via the AI's prompts.
- **Style Consistency**: The AI reflects your team's specific naming conventions and Page Object structures.
- **Reduced Maintenance**: By learning which locators are unstable, the AI proactively avoids "flaky" paths in all future test generation.
