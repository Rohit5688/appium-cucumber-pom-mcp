# AppForge AI Agent Optimization Notes

**⚠️ MANDATORY: Read `/docs/AGENT_TOKEN_OPTIMIZATION_GUIDE.md` BEFORE starting ANY work on this project.**

This file contains AppForge-specific optimizations and shortcuts that supplement the universal guide.

---

## 🎯 PROJECT-SPECIFIC TOKEN SAVERS

### 1. XML Hierarchy Optimization (CRITICAL)
```typescript
// ❌ NEVER DO THIS (50,000 tokens per call)
inspect_ui_hierarchy()  // Returns full XML dump

// ✅ ALWAYS DO THIS (1,250 tokens per call)
// After TASK-GS-09 is complete, use sparse action map instead
```

**Current status**: XML hierarchies are 50-200KB (12,500-50,000 tokens)  
**After optimization**: Sparse action maps will be 5KB (1,250 tokens)  
**Token savings**: 40x reduction per UI scan

### 2. Service File Reading Patterns
```typescript
// Known "God Nodes" (highest complexity - read last, not first):
- NavigationGraphService.ts (48 connections, 0.09 cohesion)
- ProjectSetupService.ts (32 connections)
- SessionManager.ts (21 connections)
- AppiumSessionService.ts (20 connections)

// If modifying these files, use replace_in_file, NEVER write_to_file
```

**Source**: Graphify structural analysis (see `docs/issue/todo/graphify_analysis_findings.md`)

### 3. Entry Points to Check First
```typescript
// Start here for understanding project flow:
1. src/index.ts (tool registrations - ~2000 lines)
2. package.json (scripts, dependencies - ~100 lines)
3. docs/ARCHITECTURE.md (high-level design - ~3000 tokens)

// DO NOT read all services blindly
```

### 4. Test File Patterns
```typescript
// Test files follow naming: ServiceName.test.ts
// Located in: src/tests/

// To find tests for a service:
ls src/tests/ | grep "ServiceName"

// DO NOT read test files unless debugging specific test failures
```

---

## 🚀 APPFORGE SHORTCUTS

### Common Tasks Token Budget

| Task | Efficient Token Budget | Wasteful Token Usage |
|------|------------------------|----------------------|
| Fix tool description | 3,000-5,000 | 15,000+ (reading all tools) |
| Add new service | 8,000-12,000 | 40,000+ (reading all services) |
| Debug session issue | 5,000-8,000 | 30,000+ (repeated XML scans) |
| Update config schema | 2,000-4,000 | 10,000+ (reading all config usages) |
| Add new tool | 6,000-10,000 | 25,000+ (reading index.ts fully) |

### File Reading Order for Common Tasks

**Adding a new tool**:
1. Read tool list from `docs/issue/tasks/README.md` (~2000 tokens)
2. Read ONE similar tool from `src/index.ts` using line ranges (~500 tokens)
3. Check `src/types/Response.ts` for return type (~200 tokens)
4. Implement new tool (~2000 tokens)
**Total**: ~5,000 tokens

**Debugging session issue**:
1. Search for "session" errors in logs (~500 tokens)
2. Read `SessionManager.ts` specific function (~800 tokens)
3. Read `AppiumSessionService.ts` specific function (~800 tokens)
4. Fix issue (~1000 tokens)
**Total**: ~3,000 tokens

**Updating XML processing**:
1. Read `ExecutionService.ts` parseXmlElements function only (~600 tokens)
2. Modify specific section (~400 tokens)
3. Verify with line range read (~300 tokens)
**Total**: ~1,300 tokens

---

## ❌ KNOWN TOKEN TRAPS (AVOID THESE)

### Trap 1: Reading Entire index.ts
```typescript
// ❌ DON'T: Read full index.ts (6,000 lines = 24,000 tokens)
read_file("src/index.ts")

// ✅ DO: Search for specific tool registration
grep -A 20 "case 'tool_name'" src/index.ts  // 200 tokens
```

### Trap 2: Repeated UI Hierarchy Scans
```typescript
// ❌ DON'T: Call inspect_ui_hierarchy multiple times
// Each call = 50,000 tokens

// ✅ DO: Cache result, reference by summary
"Previous scan showed 45 elements. Element #12 is username input."
```

### Trap 3: Reading All Services to Find One Function
```typescript
// ❌ DON'T: Read all 24 service files
// Total = 24 × 3000 = 72,000 tokens

// ✅ DO: Use grep to find function location
grep -r "functionName" src/services/  // 100 tokens
read_file("src/services/FoundService.ts", start_line=X, end_line=Y)  // 500 tokens
```

### Trap 4: Full Test Suite Execution Output
```typescript
// ❌ DON'T: Run all 22 test files
// Output = 50,000+ tokens

// ✅ DO: Run specific test file
npm test -- src/tests/SpecificService.test.ts  // 2,000 tokens
```

### Trap 5: Reading Documentation Files Completely
```typescript
// ❌ DON'T: Read all 30+ documentation files
// Total = 100,000+ tokens

// ✅ DO: Check docs/index.html or README for relevant doc pointer
// Then read ONLY that specific doc
```

---

## 🎯 PREFERRED PATTERNS

### Pattern 1: Tool Modification
```
1. List tools: grep "case '" src/index.ts | head -20  (200 tokens)
2. Find target: grep -A 30 "case 'target_tool'" src/index.ts  (500 tokens)
3. Modify: replace_in_file with targeted SEARCH/REPLACE  (400 tokens)
4. Verify: grep -A 5 "case 'target_tool'" src/index.ts  (100 tokens)
TOTAL: ~1,200 tokens vs 24,000 (reading full file)
```

### Pattern 2: Service Method Addition
```
1. Check service exists: ls src/services/ | grep "ServiceName"  (50 tokens)
2. Read imports only: read_file("Service.ts", start_line=1, end_line=10)  (200 tokens)
3. Find insertion point: grep "public async" Service.ts  (300 tokens)
4. Add method: replace_in_file with targeted insert  (800 tokens)
5. Verify: read_file("Service.ts", start_line=new_method_line, end_line=new_method_line+20)  (400 tokens)
TOTAL: ~1,750 tokens vs 12,000 (reading full service)
```

### Pattern 3: Config Schema Update
```
1. Read config interface: grep -A 50 "interface.*Config" src/services/McpConfigService.ts  (800 tokens)
2. Modify: replace_in_file (400 tokens)
3. Update default: grep -A 20 "defaultConfig" src/services/McpConfigService.ts  (300 tokens)
4. Modify: replace_in_file (400 tokens)
TOTAL: ~1,900 tokens vs 8,000 (reading full service)
```

---

## 📋 TASK-SPECIFIC OPTIMIZATIONS

### For TASK-GS-01 (Tool Description Audit)
```
1. List all tool cases: grep "case '" src/index.ts  (500 tokens)
2. For each tool, read ONLY description block:
   grep -A 30 "case 'tool_name'" src/index.ts  (500 tokens × 8 tools = 4,000)
3. Modify each: replace_in_file (400 tokens × 8 = 3,200)
TOTAL: ~8,000 tokens vs 50,000+ (reading index.ts multiple times)
```

### For TASK-GS-09 (Sparse Action Map)
```
1. Read ExecutionService parseXmlElements only: 
   grep -A 100 "parseXmlElements" src/services/ExecutionService.ts  (2,000 tokens)
2. Create new MobileSmartTreeService (3,000 tokens)
3. Update ExecutionService to call it: replace_in_file (800 tokens)
TOTAL: ~6,000 tokens vs 30,000+ (reading full ExecutionService)
```

### For TASK-GS-14 (Observability Service)
```
1. Check existing Logger: read_file("src/utils/Logger.ts")  (1,500 tokens)
2. Create ObservabilityService (4,000 tokens)
3. Update index.ts safeExecute wrapper: replace_in_file (600 tokens)
TOTAL: ~6,000 tokens vs 25,000+ (reading all services for patterns)
```

---

## 🔄 CHECKPOINT STRATEGY

After completing these groupings, consider starting a fresh conversation:

**Group 1: TIER 0 Tasks (GS-01 through GS-08)**
- Estimated total: 25,000-35,000 tokens
- Checkpoint after GS-08, summarize foundation work

**Group 2: TIER 1 Tasks (GS-09 through GS-13)**
- Estimated total: 30,000-40,000 tokens
- Checkpoint after GS-13, summarize token optimization work

**Group 3: TIER 2 Tasks (GS-14 through GS-18)**
- Estimated total: 25,000-35,000 tokens
- Checkpoint after GS-18, summarize intelligence/observability work

**Why checkpoint**: Prevents context window bloat, maintains focus, ensures each tier is complete before moving to next

---

## 📊 SUCCESS METRICS FOR APPFORGE

**Optimized AppForge session looks like**:
- ✅ Added new tool using <10,000 tokens
- ✅ Fixed service bug using <5,000 tokens
- ✅ Updated config schema using <3,000 tokens
- ✅ Never read full index.ts unless absolutely necessary
- ✅ Use grep/search before read_file 90%+ of time

**Wasteful AppForge session looks like**:
- ❌ Read all 24 services to find one function
- ❌ Called inspect_ui_hierarchy 5+ times (250,000 tokens)
- ❌ Read entire index.ts to modify one tool
- ❌ Ran full test suite to check one function
- ❌ Read all documentation files "to understand project"

---

## 🚨 CRITICAL REMINDERS

1. **XML is expensive**: Each UI scan = 50,000 tokens. Cache and reuse.
2. **God nodes are large**: NavigationGraphService, ProjectSetupService are 1000+ lines. Use targeted edits.
3. **index.ts is huge**: 6,000 lines = 24,000 tokens. NEVER read fully. Use grep + line ranges.
4. **Tests are numerous**: 22 test files. Run specific test, not full suite.
5. **Docs are extensive**: 30+ files. Check index first, read only relevant doc.

---

*Update this file as you discover new project-specific optimization patterns.*