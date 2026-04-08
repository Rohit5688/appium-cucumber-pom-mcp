# TASK-GS-21 — Observer Fork (Background Status Updates)

**Status**: TODO (Low Priority — UX Polish)  
**Effort**: Medium (~75 min)  
**Depends on**: Nothing — standalone service  
**Build check**: `npm run build` in `C:\Users\Rohit\mcp\AppForge`

---

## Context (No Prior Chat Needed)

> ⚠️ **Decision Point**: Implement this task only if user feedback indicates frustration with long silent operations. It is a UX enhancement, not a functionality fix.

During long operations (UI hierarchy inspection of complex screens, large test suite runs), AppForge is completely silent. The user client shows no progress for 5-30 seconds, making users think the tool hung.

**Solution**: Create `ObserverService` that emits periodic status messages during long operations so users know work is in progress.

**Example**:
```
[Scanning] Inspecting LoginScreen XML... (0.5s)
[Scanning] Inspecting LoginScreen XML... (1.5s) 
[Scanning] Parsing 847 elements...
[Done] LoginScreen inspection complete (2.3s)
```

**Note**: MCP protocol doesn't officially support streaming updates within a single tool call. This service uses a workaround: writing to a status file that can be polled, or logging to console (which some clients display).

---

## What to Create

### File: `src/services/ObserverService.ts` (NEW)

```typescript
import * as path from 'path';
import * as fs from 'fs';

export interface ObserverConfig {
  /** How often to emit status messages (ms). Default: 1000 */
  intervalMs?: number;
  /** Whether to log to console. Default: true */
  logToConsole?: boolean;
  /** Whether to write status to .AppForge/status.json. Default: false */
  writeStatusFile?: boolean;
}

export interface OperationStatus {
  operationId: string;
  toolName: string;
  message: string;
  startedAt: string;
  elapsedMs: number;
  isComplete: boolean;
}

/**
 * ObserverService — emits background status updates during long operations.
 *
 * Uses setInterval to emit periodic progress messages.
 * Operations are automatically cleaned up on completion or error.
 *
 * USAGE:
 *   const observer = ObserverService.getInstance();
 *   const opId = observer.start('inspect_ui_hierarchy', 'Scanning LoginScreen...');
 *   try {
 *     observer.update(opId, 'Parsing XML elements...');
 *     const result = await longOperation();
 *     observer.complete(opId, 'LoginScreen inspection done');
 *     return result;
 *   } catch (err) {
 *     observer.fail(opId, `Inspection failed: ${err.message}`);
 *     throw err;
 *   }
 */
export class ObserverService {
  private static instance: ObserverService;

  private operations: Map<string, ActiveOperation> = new Map();
  private readonly STATUS_FILE = path.join(process.cwd(), '.AppForge', 'status.json');

  public static getInstance(): ObserverService {
    if (!ObserverService.instance) {
      ObserverService.instance = new ObserverService();
    }
    return ObserverService.instance;
  }

  /**
   * Starts observing a long operation.
   * Emits periodic status messages until complete() or fail() is called.
   *
   * @returns operationId — pass to update(), complete(), fail()
   */
  public start(
    toolName: string,
    initialMessage: string,
    config: ObserverConfig = {}
  ): string {
    const operationId = `${toolName}_${Date.now()}`;
    const startedAt = Date.now();
    const intervalMs = config.intervalMs ?? 1500;
    const logToConsole = config.logToConsole ?? true;

    const emitStatus = (message: string, elapsedMs: number, isComplete: boolean) => {
      const status: OperationStatus = {
        operationId,
        toolName,
        message,
        startedAt: new Date(startedAt).toISOString(),
        elapsedMs,
        isComplete,
      };

      if (logToConsole) {
        const elapsed = (elapsedMs / 1000).toFixed(1);
        const prefix = isComplete ? '✅' : '⏳';
        console.log(`[${toolName}] ${prefix} ${message} (${elapsed}s)`);
      }

      if (config.writeStatusFile) {
        this.writeStatusFile(status);
      }
    };

    // Emit initial status
    emitStatus(initialMessage, 0, false);

    // Set up interval for periodic updates
    let currentMessage = initialMessage;
    const intervalHandle = setInterval(() => {
      const elapsed = Date.now() - startedAt;
      emitStatus(currentMessage, elapsed, false);
    }, intervalMs);

    this.operations.set(operationId, {
      toolName,
      currentMessage,
      startedAt,
      intervalHandle,
      updateMessage: (msg: string) => { currentMessage = msg; },
      stop: () => clearInterval(intervalHandle),
    });

    return operationId;
  }

  /**
   * Updates the status message for an active operation.
   */
  public update(operationId: string, message: string): void {
    const op = this.operations.get(operationId);
    if (!op) return;

    op.updateMessage(message);
    const elapsed = Date.now() - op.startedAt;
    console.log(`[${op.toolName}] 🔄 ${message} (${(elapsed / 1000).toFixed(1)}s)`);
  }

  /**
   * Marks operation as complete (clears interval).
   */
  public complete(operationId: string, message: string): void {
    const op = this.operations.get(operationId);
    if (!op) return;

    op.stop();
    const elapsed = Date.now() - op.startedAt;
    console.log(`[${op.toolName}] ✅ ${message} (${(elapsed / 1000).toFixed(1)}s total)`);
    this.operations.delete(operationId);
  }

  /**
   * Marks operation as failed (clears interval).
   */
  public fail(operationId: string, message: string): void {
    const op = this.operations.get(operationId);
    if (!op) return;

    op.stop();
    const elapsed = Date.now() - op.startedAt;
    console.log(`[${op.toolName}] ❌ ${message} (after ${(elapsed / 1000).toFixed(1)}s)`);
    this.operations.delete(operationId);
  }

  /**
   * Cleans up all active operations (call on server shutdown or error).
   */
  public cleanup(): void {
    for (const [id, op] of this.operations.entries()) {
      op.stop();
      this.operations.delete(id);
    }
  }

  private writeStatusFile(status: OperationStatus): void {
    try {
      const dir = path.dirname(this.STATUS_FILE);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(this.STATUS_FILE, JSON.stringify(status, null, 2), 'utf-8');
    } catch { /* non-fatal */ }
  }
}

interface ActiveOperation {
  toolName: string;
  currentMessage: string;
  startedAt: number;
  intervalHandle: ReturnType<typeof setInterval>;
  updateMessage: (msg: string) => void;
  stop: () => void;
}
```

---

## What to Update

### File: `src/services/ExecutionService.ts`

Wrap the `inspect_ui_hierarchy` operation:

```typescript
import { ObserverService } from './ObserverService';

// In inspect_ui_hierarchy:
const observer = ObserverService.getInstance();
const opId = observer.start('inspect_ui_hierarchy', `Scanning ${args.screenName ?? 'screen'}...`);

try {
  observer.update(opId, 'Fetching UI hierarchy from Appium...');
  const rawXml = await driver.getPageSource();

  observer.update(opId, `Processing XML (${(rawXml.length / 1024).toFixed(0)}KB)...`);
  const actionMap = MobileSmartTreeService.getInstance().buildSparseMap(rawXml, platform, args.screenName);

  observer.complete(opId, `${args.screenName ?? 'Screen'} scanned — ${actionMap.interactiveCount} interactive elements`);
  return actionMap;
} catch (err) {
  observer.fail(opId, `Scan failed: ${(err as Error).message}`);
  throw err;
}
```

### Also apply to:
- `run_cucumber_test` — wrap test execution with observer
- `self_heal_test` — wrap healing process with observer
- `generate_cucumber_pom` — wrap file generation with observer

---

## Verification

1. Run `npm run build` — must pass

2. Call `inspect_ui_hierarchy` on a complex screen and observe console output:
   ```
   [inspect_ui_hierarchy] ⏳ Scanning LoginScreen... (0.0s)
   [inspect_ui_hierarchy] 🔄 Fetching UI hierarchy from Appium... (1.2s)
   [inspect_ui_hierarchy] 🔄 Processing XML (45KB)... (2.1s)
   [inspect_ui_hierarchy] ✅ LoginScreen scanned — 8 interactive elements (2.4s total)
   ```

3. Simulate a long operation:
   ```typescript
   const observer = ObserverService.getInstance();
   const opId = observer.start('test_tool', 'Starting...');
   await new Promise(res => setTimeout(res, 3000));
   observer.update(opId, 'Almost done...');
   await new Promise(res => setTimeout(res, 1000));
   observer.complete(opId, 'Done!');
   ```

---

## Done Criteria

- [ ] `ObserverService.ts` created with `start()`, `update()`, `complete()`, `fail()`, `cleanup()`
- [ ] Interval-based status emission with configurable interval
- [ ] `inspect_ui_hierarchy` wrapped with observer
- [ ] `run_cucumber_test` wrapped with observer
- [ ] `cleanup()` called on server shutdown/error
- [ ] No resource leaks (intervals always cleared via try/finally pattern)
- [ ] `npm run build` passes with zero errors
- [ ] Change `Status` above to `DONE`

---

## Notes

- **Console output only** — MCP doesn't support streaming tool responses; this only updates the server's console/stderr
- **try/finally is mandatory** — all observer usage must use try/finally to guarantee `complete()` or `fail()` is called; uncleaned intervals will leak
- **Low overhead** — `setInterval` with 1500ms interval is negligible CPU cost
- **Status file optional** — `writeStatusFile: true` config allows external tools to poll `.AppForge/status.json`
- **UX only** — does not affect tool output or error handling; purely informational
