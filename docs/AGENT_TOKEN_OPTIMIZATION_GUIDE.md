# Universal Agent Token Optimization Guide

**Purpose**: Mandatory reading for ANY AI model/agent working on ANY codebase. This guide minimizes token consumption across all development sessions.

**Audience**: Claude, GPT-4, Gemini, or any LLM-based coding assistant working on software projects.

---

## 🎯 CORE PRINCIPLE: Token Efficiency First

Every token consumed costs money and reduces context window available for actual work. Before starting ANY task, review these optimization strategies.

---

## 📋 SECTION 1: PRE-WORK RECONNAISSANCE (Avoid Wasteful Exploration)

### ❌ NEVER DO THIS (Token Wasteful):
```
Agent: "Let me read the entire codebase to understand the project..."
*Proceeds to read 50 files, 100,000 tokens consumed*
```

### ✅ ALWAYS DO THIS (Token Efficient):

#### 1.1 Start with Project Metadata (Zero/Low Token)
**BEFORE reading ANY code**, check these in order:
1. `README.md` - Project overview (typically <2000 tokens)
2. `package.json` or equivalent - dependencies, scripts, entry points (~500 tokens)
3. `.gitignore` - Understand what's intentionally excluded (~200 tokens)
4. `ARCHITECTURE.md` or `docs/` folder - High-level design (if exists)
5. `CHANGELOG.md` - Recent changes context (~1000 tokens)

**Token saved**: 95,000+ by avoiding blind exploration

#### 1.2 Use Directory Structure, Not File Contents
```bash
# Good: List files only (100 tokens)
ls -R src/

# Bad: Read all files (50,000 tokens)
cat src/**/*.ts
```

**Rule**: Directory tree tells you WHERE to look. File content tells you WHAT exists. Do the first before the second.

#### 1.3 Targeted File Reading with Line Ranges
```typescript
// Bad: Read entire 5000-line file (20,000 tokens)
read_file("src/services/LargeService.ts")

// Good: Read specific section (500 tokens)
read_file("src/services/LargeService.ts", start_line=100, end_line=150)
```

**Rule**: If you know the function name or area, use grep/search first, then read specific lines.

---

## 📋 SECTION 2: SMART CONTEXT GATHERING (Read Only What's Needed)

### 2.1 Use Code Search Instead of File Reading
```bash
# Good: Find specific pattern (200 tokens result)
grep -r "function handleLogin" src/

# Bad: Read 10 files hoping to find it (30,000 tokens)
read_file("src/auth/LoginService.ts")
read_file("src/auth/AuthService.ts")
# ... continues reading files blindly
```

**Token saved**: 29,800

### 2.2 AST/Symbol Navigation Over Full File Reading
```typescript
// Good: List function names only (1000 tokens)
list_code_definitions("src/services/")

// Bad: Read all service files (40,000 tokens)
read_file("src/services/ServiceA.ts")
read_file("src/services/ServiceB.ts")
// ... continues
```

**Rule**: Get the map before exploring the territory.

### 2.3 Incremental Discovery Pattern
```
1. Read file structure (100 tokens)
2. Read imports/exports only (500 tokens)
3. Read function signatures only (1000 tokens)
4. Read specific function body IF needed (2000 tokens)
```

**Total**: 3600 tokens vs. reading entire file (15,000 tokens)

---

## 📋 SECTION 3: EXECUTION & TESTING (Avoid Repeated Failures)

### 3.1 Validate Before Executing
```typescript
// Bad: Try command, watch it fail, read docs, try again (5 attempts × 2000 tokens = 10,000)
execute("npm run build")  // fails
execute("npm run build")  // fails again
execute("npm run build")  // fails again

// Good: Check package.json scripts first (500 tokens)
read_file("package.json")  // See actual script names
execute("npm run build")   // Works first time
```

**Token saved**: 9,500

### 3.2 Use Dry-Run/Validation Flags
```bash
# Good: Validate first (500 tokens)
npm run build --dry-run
# Then execute if valid

# Bad: Execute blindly, iterate on failures (5000 tokens)
npm run build  # Fail
npm run build  # Fail
npm run build  # Finally works
```

### 3.3 Batch Similar Operations
```typescript
// Bad: Individual operations (10 × 1000 = 10,000 tokens)
write_file("FileA.ts", contentA)
wait_for_confirmation()
write_file("FileB.ts", contentB)
wait_for_confirmation()
// ... 10 times

// Good: Batch plan, single confirmation (2000 tokens)
plan = [
  { file: "FileA.ts", content: contentA },
  { file: "FileB.ts", content: contentB },
  // ... all 10 files
]
present_plan_to_user()
execute_batch(plan)
```

**Token saved**: 8,000

---

## 📋 SECTION 4: CODE MODIFICATION (Surgical Edits)

### 4.1 Use Replace-In-File, Not Rewrite-Entire-File
```typescript
// Bad: Rewrite 1000-line file to change 2 lines (4000 tokens)
write_to_file("LargeFile.ts", entire_file_content)

// Good: Replace specific lines (200 tokens)
replace_in_file("LargeFile.ts", 
  search: "old code",
  replace: "new code"
)
```

**Token saved**: 3,800

### 4.2 Read Only Changed Sections After Edits
```typescript
// Bad: Read entire file after each edit to verify (5 edits × 4000 = 20,000 tokens)
replace_in_file("File.ts", ...)
read_file("File.ts")  // Full file
replace_in_file("File.ts", ...)
read_file("File.ts")  // Full file again

// Good: Trust edit, verify at end (500 tokens)
replace_in_file("File.ts", ...)
replace_in_file("File.ts", ...)
replace_in_file("File.ts", ...)
read_file("File.ts", start_line=100, end_line=200)  // Only changed section
```

**Token saved**: 19,500

### 4.3 Use Diff/Patch Format
```typescript
// Bad: Send full new file content (10,000 tokens)
write_to_file("Component.tsx", full_new_content)

// Good: Send only changes (500 tokens)
diff = `
--- Component.tsx
+++ Component.tsx
@@ -45,7 +45,7 @@
-  const [state, setState] = useState(false);
+  const [state, setState] = useState(true);
`
apply_diff("Component.tsx", diff)
```

**Token saved**: 9,500

---

## 📋 SECTION 5: CONTEXT WINDOW MANAGEMENT (Stay Within Limits)

### 5.1 Prune Old Conversation Context
**Don't include**:
- ❌ Full file contents from 10 messages ago
- ❌ Repeated error messages (summarize instead)
- ❌ Successful command outputs (just note "success")
- ❌ Old XML/JSON dumps that are no longer relevant

**Do include**:
- ✅ Current task description
- ✅ Recent 2-3 errors (if debugging)
- ✅ File paths and function names (not full contents)
- ✅ Compact summaries of completed steps

### 5.2 Use Semantic Compression
```typescript
// Bad: Include full XML hierarchy every message (50,000 tokens × 5 messages = 250,000)
"Here's the XML again: <root>...</root> [50KB]"

// Good: Compress to semantic summary (500 tokens × 5 = 2,500)
"Screen: LoginScreen (45 interactive elements). Key: #12 username input, #13 password input, #14 submit button"
```

**Token saved per conversation**: 247,500

### 5.3 Checkpoint and Restart Pattern
```
After completing 3-4 related tasks:
1. Summarize what was done (500 tokens)
2. Note current state (200 tokens)
3. Start NEW conversation with summary
4. Continue work (fresh context window)
```

**Benefit**: Prevents context window bloat, maintains focus

---

## 📋 SECTION 6: SPECIALIZED DOMAIN OPTIMIZATIONS

### 6.1 For Mobile/UI Testing Projects
```typescript
// Bad: Send full XML hierarchy (200KB = 50,000 tokens)
inspect_ui_hierarchy()  // Returns entire DOM

// Good: Send sparse action map (5KB = 1,250 tokens)
get_interactive_elements()  // Returns only clickable items with IDs
```

**Token saved**: 48,750

### 6.2 For Web Projects
```typescript
// Bad: Send full HTML page source (100KB = 25,000 tokens)
get_page_source()

// Good: Send accessibility tree (3KB = 750 tokens)
get_accessibility_tree()
```

**Token saved**: 24,250

### 6.3 For Data Processing Projects
```typescript
// Bad: Include sample data in every message (10KB × 10 = 100KB = 25,000 tokens)
"Here's the data again: [10,000 rows]"

// Good: Reference data location (200 tokens)
"Processing data from data/input.csv (10,000 rows, schema: id, name, email)"
```

**Token saved**: 24,800

---

## 📋 SECTION 7: ANTI-PATTERNS TO AVOID

### 7.1 The "Read Everything" Anti-Pattern
```typescript
❌ "Let me read all files in src/ to understand the codebase"
✅ "Let me check the entry point (index.ts) and README to understand the architecture"
```

### 7.2 The "Repeat Context" Anti-Pattern
```typescript
❌ Including full error messages and stack traces in every message
✅ "Still getting MODULE_NOT_FOUND error from line 45"
```

### 7.3 The "Premature Optimization" Anti-Pattern
```typescript
❌ Reading performance profiling code before understanding if performance is an issue
✅ Checking GitHub issues/CHANGELOG for known performance problems first
```

### 7.4 The "No Plan" Anti-Pattern
```typescript
❌ Starting to code immediately without understanding the task
✅ Spending 1-2 messages planning approach (saves 10+ messages of trial-and-error)
```

### 7.5 The "Verbose Response" Anti-Pattern
```typescript
❌ "I will now proceed to read the file at path/to/file.ts which contains..."
✅ *Directly reads file without announcement*
```

---

## 📋 SECTION 8: MEASUREMENT & ACCOUNTABILITY

### 8.1 Self-Audit Questions (Before Each Action)
1. "Do I NEED to read this entire file, or can I search for specific functions?"
2. "Can I get this information from package.json/README instead of reading code?"
3. "Am I repeating context from previous messages unnecessarily?"
4. "Can I batch these 5 operations into one?"
5. "Is this exploration, or am I actually solving the task?"

### 8.2 Token Budget Awareness
Set mental budgets per task type:
- **Simple bug fix**: 5,000-10,000 tokens max
- **Feature addition**: 15,000-30,000 tokens max
- **Refactoring**: 20,000-40,000 tokens max
- **Architecture design**: 10,000-20,000 tokens max (mostly thinking, less reading)

**If exceeding budget**: Stop, summarize, restart fresh conversation

### 8.3 Project-Specific Optimization Files
Create/update this file in every project:
```
.ai-context/optimization-notes.md
```

Contents:
- Known expensive operations to avoid
- Preferred file reading patterns
- Project-specific shortcuts
- Common false paths to skip

---

## 📋 SECTION 9: TOOL-SPECIFIC OPTIMIZATIONS

### 9.1 For MCP Tools
```typescript
// Bad: Call inspect_ui_hierarchy repeatedly (50,000 tokens × 3 = 150,000)
inspect_ui()
make_change()
inspect_ui()  // Full hierarchy again
make_change()
inspect_ui()  // Full hierarchy again

// Good: Cache inspection result (50,000 + 500 + 500 = 51,000 tokens)
inspection = inspect_ui()  // Once
extract_elements(inspection, filter="clickable")  // Reuse cached data
extract_elements(inspection, filter="inputs")     // Reuse cached data
```

**Token saved**: 99,000

### 9.2 For File Operations
```typescript
// Bad: Read then write repeatedly
content = read_file("File.ts")  // 4000 tokens
write_file("File.ts", modified)  // 4000 tokens
content = read_file("File.ts")  // 4000 tokens again
write_file("File.ts", modified2) // 4000 tokens again

// Good: Plan all changes first
changes = [change1, change2, change3]
apply_all_changes("File.ts", changes)  // 500 tokens
read_file("File.ts")  // Once at end: 4000 tokens
```

**Token saved**: 11,500

### 9.3 For Testing/Execution
```typescript
// Bad: Execute full test suite to check one function
npm test  // Runs 500 tests, 50,000 tokens output

// Good: Execute specific test file
npm test -- src/utils/targetFunction.test.ts  // 2,000 tokens output
```

**Token saved**: 48,000

---

## 📋 SECTION 10: DAILY WORKFLOW OPTIMIZATION

### Morning Routine (Project Start)
```
1. Read CHANGELOG.md (check recent changes) - 1000 tokens
2. Check git status (see uncommitted work) - 200 tokens
3. Review task list/issues - 500 tokens
4. Plan today's work - 1000 tokens
TOTAL: ~3,000 tokens to start day productively
```

### Task Execution Pattern
```
1. Understand requirement (500 tokens)
2. Locate relevant files via search (500 tokens)
3. Read specific sections only (2000 tokens)
4. Plan changes (500 tokens)
5. Execute changes (1000 tokens)
6. Verify (1000 tokens)
TOTAL: ~5,500 tokens per task
```

### End of Day Cleanup
```
1. Summarize completed work (500 tokens)
2. Note pending items (300 tokens)
3. Commit changes (200 tokens)
TOTAL: ~1,000 tokens
```

**Daily total for productive work**: ~10,000-15,000 tokens (efficient)  
**Daily total for wasteful work**: ~100,000-200,000 tokens (inefficient)

---

## 🎯 SUCCESS METRICS

**You are optimized if**:
- ✅ 80%+ of file reads are <1000 lines (targeted, not full files)
- ✅ 90%+ of searches use grep/AST before reading files
- ✅ Commands succeed on first try 70%+ of the time
- ✅ Context summaries replace full content after 3 messages
- ✅ Daily token usage <20,000 for routine development

**You are wasteful if**:
- ❌ Reading entire codebases "to understand"
- ❌ Repeating file contents in every message
- ❌ Trying commands without checking docs/package.json first
- ❌ Including full error logs repeatedly
- ❌ Daily token usage >50,000 with little progress

---

## 📚 APPENDIX: Quick Reference Card

**BEFORE Reading a File**:
1. Do I know the file path? (use search if not)
2. Do I need the whole file? (use line ranges if not)
3. Can I get this from package.json/README? (check metadata first)

**BEFORE Executing a Command**:
1. Do I know the exact command? (check package.json scripts)
2. Will this produce huge output? (use --quiet or filter)
3. Can I batch with other commands? (combine when possible)

**BEFORE Making Changes**:
1. Do I understand the full scope? (plan first)
2. Can I use replace vs. rewrite? (surgical edits)
3. Do I need to read back the result? (trust, verify at end)

**DURING Conversation**:
1. Am I repeating old context? (summarize instead)
2. Is this message >10KB? (compress or split)
3. Am I staying on task? (avoid tangents)

---

## 🚀 BOTTOM LINE

**Every message costs tokens. Every file read costs tokens. Every command output costs tokens.**

**Think first. Plan second. Execute third. Verify fourth.**

**Token efficiency = Cost efficiency = Faster delivery = Better outcomes**

---

*This guide should be reviewed before starting work on ANY project, not just AppForge.*