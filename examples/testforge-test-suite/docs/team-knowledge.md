# TestForge MCP — Team Knowledge Base

**Version**: 1.0.0
**Total Rules**: 3

| # | Pattern | Solution | Tags | Learned |
|---|---------|----------|------|---------|
| 1 | Input field with no data-test or ID on legacy sites | Use structural sibling selector: page.locator('p:has-text("Label Text") + input') | legacy, no-testid, structural | 2025-01-01 |
| | _Why:_ | Legacy sites (LambdaTest, older enterprise apps) often lack test IDs. The label-to-input DOM structure is more stable than element IDs which can be auto-generated. | | |
| | _Do NOT:_ | Do not use #result-id or #confirm-msg — these are brittle auto-generated IDs | | |
| 2 | Elements disappear or detach during interaction on dynamic pages | Add 100ms layout delay before clicking: await this.page.waitForTimeout(100); await locator.click(); | dynamic, detached-dom, timing | 2025-01-01 |
| | _Why:_ | Pages with aggressive re-rendering (LambdaTest Simple Form Demo) can detach elements between resolution and click. A short delay allows the layout to settle. | | |
| | _Do NOT:_ | Do not use waitForLoadState("networkidle") — modern SPAs keep persistent connections | | |
| 3 | Handling shadow DOM elements on Google Login | Use page.locator('shadow=some-selector') or specific Piercing selectors to access elements inside shadow roots. | aom, shadow-dom | 2026-04-19 |
