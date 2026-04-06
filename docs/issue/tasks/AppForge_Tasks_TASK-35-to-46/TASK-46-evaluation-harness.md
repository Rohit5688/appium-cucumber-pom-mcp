# TASK-46 — Evaluation Harness: Create AppForge `evaluation.xml` + Baseline Score

**Status**: TODO
**Effort**: Medium (~90 min)
**Depends on**: All prior tasks should be DONE — this is the release gate
**Build check**: `npm run build` in `c:\Users\Rohit\mcp\AppForge` + evaluation run

---

## Context (No Prior Chat Needed)

There is no automated way to verify that Claude can actually use AppForge tools to
complete real mobile automation tasks. This task creates 10 verified QA question-answer
pairs, runs the shared evaluation script, and records the baseline score. A score
≥ 70% means the server is ready for wider use.

---

## Step 1 — Read the evaluation guide and script

Before doing anything else, read both of these files in their entirety:

```
c:\Users\Rohit\mcp\TestForge\Skills\reference\evaluation.md
c:\Users\Rohit\mcp\TestForge\Skills\scripts\evaluation.py
```

Understand how questions are structured, what makes a good QA pair, and how
the evaluation script works before writing any questions.

---

## Step 2 — Create the output directory and XML file

```bash
mkdir c:\Users\Rohit\mcp\AppForge\docs\evaluation
```

Create file: `c:\Users\Rohit\mcp\AppForge\docs\evaluation\appforge_evaluation.xml`

---

## Step 3 — Write 10 verified QA pairs

**Rules for every question:**
- **Read-only only** — questions must be answerable by calling `workflow_guide`,
  `manage_config (read)`, `check_environment`, `summarize_suite`, or similar
  read-only tools. Never require destructive operations.
- **Stable** — the answer must not depend on live device state, real app builds,
  or time-sensitive data.
- **Multi-hop preferred** — the best questions require the LLM to call 2–3 tools
  and synthesize the answer.
- **Verify each answer yourself** before adding it to the XML. Call the tool and
  confirm the answer is correct.

**Starter questions (verify and expand to 10):**

```xml
<evaluation>

  <qa_pair>
    <question>Call workflow_guide with workflow="new_project". What is the FIRST tool it recommends calling in that workflow?</question>
    <answer>check_environment</answer>
  </qa_pair>

  <qa_pair>
    <question>Call workflow_guide with workflow="write_test". How many steps does that workflow contain?</question>
    <answer>6</answer>
  </qa_pair>

  <qa_pair>
    <question>Call workflow_guide with workflow="run_and_heal". Which tool does it recommend calling AFTER verify_selector confirms a selector works?</question>
    <answer>train_on_example</answer>
  </qa_pair>

  <qa_pair>
    <question>What is the default platform value used by setup_project when no platform argument is provided?</question>
    <answer>android</answer>
  </qa_pair>

  <qa_pair>
    <question>What does verify_selector return in the "note" field when it successfully auto-learns a healed selector (both selector and oldSelector are provided)?</question>
    <answer>Success automatically learned to rule base.</answer>
  </qa_pair>

  <qa_pair>
    <question>According to the execute_sandbox_code tool description, what is the correct way to return a value from a sandbox script?</question>
    <answer>use `return &lt;value&gt;` in your script</answer>
  </qa_pair>

  <qa_pair>
    <question>What file does train_on_example store learned rules in?</question>
    <answer>.AppForge/mcp-learning.json</answer>
  </qa_pair>

  <qa_pair>
    <question>Which tool should be called FIRST according to workflow_guide when you don't know which tool to use or how to start?</question>
    <answer>workflow_guide</answer>
  </qa_pair>

  <qa_pair>
    <question>What does the validate_and_write tool do when dryRun is set to true?</question>
    <answer>validates code without writing to disk</answer>
  </qa_pair>

  <qa_pair>
    <question>According to the inject_app_build tool description, what parameter should be set to true for CI paths where the app file does not exist locally?</question>
    <answer>forceWrite</answer>
  </qa_pair>

</evaluation>
```

**After writing the 10 pairs:** call each relevant tool yourself against your
actual running AppForge server to verify every answer is correct. Adjust any
answers that differ from actual tool output.

---

## Step 4 — Run the baseline evaluation

```bash
cd c:\Users\Rohit\mcp\AppForge

# Install dependencies (one-time)
pip install anthropic mcp

# Build first
npm run build

# Run evaluation
python c:\Users\Rohit\mcp\TestForge\Skills\scripts\evaluation.py ^
  -t stdio ^
  -c node ^
  -a dist/index.js ^
  docs\evaluation\appforge_evaluation.xml
```

---

## Step 5 — Record results

Create file: `c:\Users\Rohit\mcp\AppForge\docs\evaluation\eval_results.md`

```markdown
# AppForge Evaluation Results

## Baseline Run

**Date**: [date]
**AppForge version**: 1.0.0
**Tasks completed before this run**: TASK-35 through TASK-45

| Metric | Result |
|--------|--------|
| Total questions | 10 |
| Correct | X |
| Score | X% |
| Pass threshold | 70% |
| Status | PASS / FAIL |

## Failed Questions

List any questions the model got wrong and the actual vs expected answers.

## Next Steps

If score < 70%:
- Review failed questions to identify which tool descriptions are unclear
- Improve the tool description text for those tools
- Re-run evaluation

If score ≥ 70%:
- AppForge is ready for broader team use
- Re-run evaluation after any major tool description changes
```

---

## Verification

1. `npm run build` — zero errors.
2. `docs/evaluation/appforge_evaluation.xml` exists with 10 QA pairs.
3. `docs/evaluation/eval_results.md` exists with baseline score recorded.
4. Score ≥ 70%.

---

## Done Criteria
- [ ] `npm run build` passes with zero errors
- [ ] `docs/evaluation/appforge_evaluation.xml` created with 10 verified QA pairs
- [ ] Every answer verified by calling the actual tool before adding to XML
- [ ] Evaluation script run successfully
- [ ] Baseline score ≥ 70% recorded in `eval_results.md`
- [ ] If score < 70%, at least one round of tool description improvements made and re-run
- [ ] Change `Status` above to `DONE`
