# TASK-GS-02 — File State Tracker (Prevent External Change Collisions)

**Status**: TODO  
**Effort**: Medium (~90 min)  
**Depends on**: GS-07 (Type System Expansion) — needs types defined first  
**Build check**: `npm run build` in `/Users/rsakhawalkar/forge/AppForge`

---

## Context (No Prior Chat Needed)

When external tools (formatters, linters, auto-save) modify files while an AI agent is working, the agent's internal state becomes stale. This causes:
- Silent overwrites of external changes
- "Brain fog" where agent doesn't realize file changed
- Race conditions between agent edits and external tools

**Example Failure**:
```
1. Agent reads LoginPage.ts at timestamp T1
2. Prettier formats the file at timestamp T2 (user saves)
3. Agent writes changes based on T1 version
4. Result: Prettier's formatting is lost, agent's changes applied to wrong lines
```

**Solution**: Track file read timestamps and verify before writes.

---

## What to Create

### File: `/Users/rsakhawalkar/forge/AppForge/src/services/FileStateService.ts` (NEW)

Create a new service that tracks file read states and validates before writes.

```typescript
import * as fs from 'fs';
import * as path from 'path';

/**
 * Tracks file read timestamps to detect external modifications.
 * Prevents the agent from overwriting files that changed since reading.
 */
export class FileStateService {
  private static instance: FileStateService;
  private fileStates: Map<string, FileReadState>;

  private constructor() {
    this.fileStates = new Map();
  }

  public static getInstance(): FileStateService {
    if (!FileStateService.instance) {
      FileStateService.instance = new FileStateService();
    }
    return FileStateService.instance;
  }

  /**
   * Records the timestamp when a file was read by the agent.
   */
  public recordRead(filePath: string, content: string): void {
    const absolutePath = path.resolve(filePath);
    const stats = fs.statSync(absolutePath);
    
    this.fileStates.set(absolutePath, {
      path: absolutePath,
      lastReadTime: Date.now(),
      diskModifiedTime: stats.mtimeMs,
      contentHash: this.hashContent(content),
      isPartialRead: false
    });
  }

  /**
   * Validates that a file hasn't been modified externally since reading.
   * Returns { valid: true } if safe to write, or { valid: false, reason: string } if not.
   */
  public validateWrite(filePath: string): { valid: boolean; reason?: string } {
    const absolutePath = path.resolve(filePath);
    const state = this.fileStates.get(absolutePath);

    // If never read, it's a new file - allow write
    if (!state) {
      return { valid: true };
    }

    // Check if file was modified on disk since we read it
    if (!fs.existsSync(absolutePath)) {
      return { valid: true }; // File deleted, safe to recreate
    }

    const currentStats = fs.statSync(absolutePath);
    
    if (currentStats.mtimeMs > state.diskModifiedTime) {
      return {
        valid: false,
        reason: `File was modified externally after agent read it. Last read: ${new Date(state.lastReadTime).toISOString()}, Disk modified: ${new Date(currentStats.mtimeMs).toISOString()}`
      };
    }

    return { valid: true };
  }

  /**
   * Updates the state after a successful write.
   */
  public recordWrite(filePath: string, content: string): void {
    const absolutePath = path.resolve(filePath);
    const stats = fs.statSync(absolutePath);
    
    this.fileStates.set(absolutePath, {
      path: absolutePath,
      lastReadTime: Date.now(),
      diskModifiedTime: stats.mtimeMs,
      contentHash: this.hashContent(content),
      isPartialRead: false
    });
  }

  /**
   * Clears tracking for a specific file or all files.
   */
  public clearState(filePath?: string): void {
    if (filePath) {
      const absolutePath = path.resolve(filePath);
      this.fileStates.delete(absolutePath);
    } else {
      this.fileStates.clear();
    }
  }

  /**
   * Simple content hash for change detection.
   */
  private hashContent(content: string): string {
    let hash = 0;
    for (let i = 0; i < content.length; i++) {
      const char = content.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return hash.toString(16);
  }
}

interface FileReadState {
  path: string;
  lastReadTime: number;
  diskModifiedTime: number;
  contentHash: string;
  isPartialRead: boolean;
}
```

---

## What to Update

### File: `/Users/rsakhawalkar/forge/AppForge/src/services/FileWriterService.ts`

Update to use FileStateService before writes.

#### Step 1 — Add FileStateService import

Add at top of file:
```typescript
import { FileStateService } from './FileStateService';
```

#### Step 2 — Update writeFile method

Find the `writeFile` method (around line 50). Add validation before write:

```typescript
public async writeFile(filePath: string, content: string): Promise<void> {
  const fileState = FileStateService.getInstance();
  
  // Validate file hasn't changed externally
  const validation = fileState.validateWrite(filePath);
  if (!validation.valid) {
    throw new Error(`Cannot write file: ${validation.reason}`);
  }

  // Existing write logic here...
  fs.writeFileSync(filePath, content, 'utf-8');
  
  // Record successful write
  fileState.recordWrite(filePath, content);
}
```

#### Step 3 — Update any file read methods

If FileWriterService has read methods, add state tracking:

```typescript
public readFile(filePath: string): string {
  const content = fs.readFileSync(filePath, 'utf-8');
  
  // Track that we read this file
  const fileState = FileStateService.getInstance();
  fileState.recordRead(filePath, content);
  
  return content;
}
```

---

## What to Update in Tools

### File: `/Users/rsakhawalkar/forge/AppForge/src/index.ts`

Update file reading tools to track state.

Find the `read_file` tool handler (search for `case "read_file"`). After reading, add:

```typescript
case "read_file": {
  const { path: filePath } = args;
  const content = fs.readFileSync(filePath, 'utf-8');
  
  // Track file read state
  FileStateService.getInstance().recordRead(filePath, content);
  
  return { content };
}
```

---

## Verification

1. Create a test file:
   ```typescript
   // test-state-tracking.ts
   import { FileStateService } from './src/services/FileStateService';
   import * as fs from 'fs';

   const stateService = FileStateService.getInstance();
   const testFile = './test-file.txt';

   // Test 1: Write without read - should succeed
   fs.writeFileSync(testFile, 'initial', 'utf-8');
   stateService.recordWrite(testFile, 'initial');
   console.log('Test 1 passed');

   // Test 2: Read then write - should succeed
   const content = fs.readFileSync(testFile, 'utf-8');
   stateService.recordRead(testFile, content);
   const validation = stateService.validateWrite(testFile);
   console.assert(validation.valid === true, 'Test 2 failed');
   console.log('Test 2 passed');

   // Test 3: Read, external modify, write - should fail
   fs.writeFileSync(testFile, 'external change', 'utf-8');
   const validation2 = stateService.validateWrite(testFile);
   console.assert(validation2.valid === false, 'Test 3 failed');
   console.log('Test 3 passed:', validation2.reason);

   // Cleanup
   fs.unlinkSync(testFile);
   ```

2. Run: `npm run build` — must pass with zero errors

3. Run test: `npx ts-node test-state-tracking.ts`

4. Verify output shows Test 3 detecting external modification

---

## Done Criteria

- [ ] `FileStateService.ts` created with timestamp tracking
- [ ] `FileWriterService.ts` validates before writes
- [ ] File read operations record state
- [ ] External modifications detected and prevented
- [ ] `npm run build` passes with zero errors
- [ ] Test script confirms detection works
- [ ] Change `Status` above to `DONE`

---

## Notes

- **This prevents silent overwrites** — the #1 source of agent regressions
- **Low overhead** — only tracks files agent actually touches
- **Can be cleared** — `clearState()` resets tracking if needed
- **Foundation for other tasks** — GS-03 (fuzzy matching) builds on this