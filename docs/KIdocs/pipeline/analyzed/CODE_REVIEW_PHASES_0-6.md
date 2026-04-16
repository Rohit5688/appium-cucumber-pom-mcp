# Code Review Task — Phases 0→2 and Phase 6 Changes

Scope
- Review all code changes introduced in Phase 6 (preview/dry-run additions) plus the prior work from Phase 0 → Phase 2.
- Validate correctness, security, test coverage, style, and backward compatibility.
- Leave review comments; if not satisfactory, apply fixes and re-run checks.

Objectives
- Verify TypeScript compiles cleanly (no regressions).
- Ensure no new security or injection vectors were introduced.
- Confirm preview/preview semantics are non-destructive and consistent across tools.
- Validate tests (unit/integration) pass after changes.
- Check documentation and tool descriptions were updated where appropriate.

Automated checks (run locally)
```bash
# from repo root
git fetch --all
# Show changed files between two refs (adjust refs as needed)
git diff --name-only origin/main...HEAD

# TypeScript compile check
npx tsc --noEmit

# Run test suite (project-specific)
npm test || npx mocha || (run your repo's test command)

# (Optional) Linting if available
npm run lint || echo "No lint script configured"
```

Manual review steps
1. Get list of changed files and group by phase (0→2, Phase 6).
2. For each modified file:
   - Read the change and ensure function signatures are backward-compatible.
   - Verify preview/preview-response objects contain `preview: true` and a helpful `hint`.
   - Check that all tool input schemas include the optional `preview` flag where applicable.
   - Ensure sensitive values (secrets) are never echoed in preview responses.
   - Confirm staging/cleanup logic uses try/finally and no temporary artifacts remain.
   - Verify security helpers (validateProjectRoot, validateFilePath) are still used.
3. Run the feature-specific manual checks where appropriate (e.g., validate_and_write flows).
4. Run the test suite and ensure no failures.

Comment template (use in PR or issue tracker)
- File: src/path/to/file.ts
- Line: 123
- Issue: Short title (e.g., "Potential null deref in preview handler")
- Details: Explain problem concisely and give a suggested change or code snippet.
- Severity: [blocker|major|minor|nit]
- Suggested fix: One-line or patch suggestion.

Remediation workflow
- Create a review branch: git checkout -b review/phase6-code-review
- Apply changes in small commits; run npx tsc --noEmit and tests after each commit.
- Push and open a PR with the review checklist and link to this file.
- Resolve review comments; after fixes, rerun automated checks.
- Merge only when CI (tsc + tests) passes and all critical/major comments are resolved.

Acceptance criteria
- npx tsc --noEmit exits 0
- All tests pass (unit + relevant integration)
- No unresolved security/critical review comments
- Documentation updated (tool descriptions + PHASE_6_COMPLETION_SUMMARY.md)

Post-review: If any review comment is NOT satisfactory, apply the fix and repeat automated checks. Use the following comment format in PR for each addressed item:

- [x] File: src/... — Fixed null-check and added unit test (refs #123)