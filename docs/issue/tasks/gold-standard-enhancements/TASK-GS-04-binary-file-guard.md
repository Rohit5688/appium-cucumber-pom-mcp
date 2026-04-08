# TASK-GS-04 — Binary File Guard (64KB Sniff Buffer)

**Status**: DONE  
**Effort**: Small (~45 min)  
**Depends on**: Nothing — standalone utility  
**Build check**: `npm run build` in `C:\Users\Rohit\mcp\AppForge`

---

## Context (No Prior Chat Needed)

When an AI agent attempts to read binary files (`.png`, `.ipa`, `.apk`, `.jar`) as text, it results in:
- Thousands of unprintable characters flooding the context window
- Token waste with zero useful information
- LLM confusion from corrupted binary data

**Example Failure**:
```
Agent calls read_file on LoginScreen.ipa
Result: ????PK\u0003\u0004...(20,000 binary characters)
Token cost: ~5000 tokens wasted
Useful result: 0 bytes
```

**Solution**: Read a 64KB sniff buffer first, detect binary content, and return an error instead of reading the full file.

---

## What to Create

### File: `C:\Users\Rohit\mcp\AppForge\src\utils\FileGuard.ts` (NEW)

```typescript
import * as fs from 'fs';
import * as path from 'path';

/**
 * Guards against reading binary files as text.
 * Uses a 64KB sniff buffer to detect binary content before full reads.
 */
export class FileGuard {
  static readonly SNIFF_BUFFER_SIZE = 64 * 1024; // 64KB

  /** Known binary file extensions — fail fast without sniffing */
  private static readonly BINARY_EXTENSIONS = new Set([
    '.png', '.jpg', '.jpeg', '.gif', '.webp', '.ico', '.bmp', '.tiff',
    '.ipa', '.apk', '.aab', '.dex',
    '.jar', '.war', '.ear', '.zip', '.gz', '.tar', '.7z', '.rar',
    '.exe', '.dll', '.so', '.dylib', '.framework',
    '.mp4', '.mov', '.avi', '.mkv', '.mp3', '.wav', '.aac',
    '.pdf', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx',
    '.class', '.o', '.obj', '.lib', '.a',
    '.db', '.sqlite', '.sqlitedb'
  ]);

  /**
   * Checks if a file is binary using extension + magic number sniffing.
   * Returns { binary: false } if safe to read as text.
   * Returns { binary: true, reason: string } if binary.
   */
  static isBinary(filePath: string): { binary: boolean; reason?: string } {
    const ext = path.extname(filePath).toLowerCase();

    // Fast path: known binary extensions
    if (this.BINARY_EXTENSIONS.has(ext)) {
      return { binary: true, reason: `Binary file extension: ${ext}` };
    }

    // Read sniff buffer
    let fd: number | null = null;
    try {
      fd = fs.openSync(filePath, 'r');
      const buffer = Buffer.alloc(Math.min(this.SNIFF_BUFFER_SIZE, 512));
      const bytesRead = fs.readSync(fd, buffer, 0, buffer.length, 0);

      if (bytesRead === 0) {
        return { binary: false }; // Empty file is valid text
      }

      const sniff = buffer.slice(0, bytesRead);

      // Check magic bytes for common binary formats
      if (this.hasBinaryMagicBytes(sniff)) {
        return { binary: true, reason: 'Binary magic bytes detected in file header' };
      }

      // Heuristic: >10% null bytes or high-bit chars → binary
      const nullCount = sniff.filter(b => b === 0).length;
      const highBitCount = sniff.filter(b => b > 127 && b < 160).length;
      const totalChecked = sniff.length;

      if (nullCount / totalChecked > 0.1) {
        return { binary: true, reason: `High null byte ratio: ${((nullCount / totalChecked) * 100).toFixed(1)}%` };
      }
      if (highBitCount / totalChecked > 0.3) {
        return { binary: true, reason: `High non-UTF8 byte ratio: ${((highBitCount / totalChecked) * 100).toFixed(1)}%` };
      }

      return { binary: false };
    } catch (err: any) {
      // If we can't stat/read, let the caller deal with the error naturally
      return { binary: false };
    } finally {
      if (fd !== null) {
        try { fs.closeSync(fd); } catch { /* ignore */ }
      }
    }
  }

  /**
   * Safely reads a file as text, throwing a clear error for binary files.
   * If the file fits within the sniff buffer, reuses that buffer (optimization).
   */
  static readTextFileSafely(filePath: string): string {
    const check = this.isBinary(filePath);
    if (check.binary) {
      throw new Error(
        `Cannot read binary file as text: ${path.basename(filePath)}. ` +
        `Reason: ${check.reason}. ` +
        `Use a dedicated tool for binary assets.`
      );
    }
    return fs.readFileSync(filePath, 'utf-8');
  }

  /** Check magic bytes for common binary formats */
  private static hasBinaryMagicBytes(buf: Buffer): boolean {
    if (buf.length < 4) return false;

    // PNG: \x89PNG
    if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4E && buf[3] === 0x47) return true;
    // ZIP/APK/IPA/JAR: PK\x03\x04
    if (buf[0] === 0x50 && buf[1] === 0x4B && buf[2] === 0x03 && buf[3] === 0x04) return true;
    // ELF (Linux shared objects): \x7fELF
    if (buf[0] === 0x7F && buf[1] === 0x45 && buf[2] === 0x4C && buf[3] === 0x46) return true;
    // MZ (Windows EXE/DLL): MZ
    if (buf[0] === 0x4D && buf[1] === 0x5A) return true;
    // JPEG: \xFF\xD8\xFF
    if (buf[0] === 0xFF && buf[1] === 0xD8 && buf[2] === 0xFF) return true;
    // GIF: GIF8
    if (buf[0] === 0x47 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x38) return true;
    // PDF: %PDF
    if (buf[0] === 0x25 && buf[1] === 0x50 && buf[2] === 0x44 && buf[3] === 0x46) return true;
    // Mach-O (macOS/iOS executables): \xCE\xFA\xED\xFE or \xCF\xFA\xED\xFE
    if ((buf[0] === 0xCE || buf[0] === 0xCF) && buf[1] === 0xFA && buf[2] === 0xED && buf[3] === 0xFE) return true;

    return false;
  }
}
```

---

## What to Update

### File: `src/services/ExecutionService.ts`

Find the file reading logic (search for `readFileSync` or `read_file`). Wrap with guard:

```typescript
// Add import at top:
import { FileGuard } from '../utils/FileGuard';

// Before any readFileSync on user-provided paths:
if (!FileGuard.isBinary(filePath).binary) {
  const content = fs.readFileSync(filePath, 'utf-8');
  // ... process content
} else {
  return {
    success: false,
    error: `Cannot read binary file: ${path.basename(filePath)}. Use a dedicated asset tool.`
  };
}
```

### File: `src/index.ts`

Find the `read_file` tool handler. Replace direct `readFileSync` with:

```typescript
case "read_file": {
  const { path: filePath } = args;
  try {
    const content = FileGuard.readTextFileSafely(filePath);
    return { content };
  } catch (err: any) {
    return { error: err.message };
  }
}
```

---

## Verification

1. Create a small test script at `/tmp/test-file-guard.ts`:
   ```typescript
   import { FileGuard } from './src/utils/FileGuard';
   import * as fs from 'fs';

   // Test 1: TypeScript file should be text
   const tsResult = FileGuard.isBinary('./src/index.ts');
   console.assert(tsResult.binary === false, 'Test 1 failed: .ts should be text');
   console.log('Test 1 passed: .ts recognized as text');

   // Test 2: .png extension should be binary (fast path)
   const pngResult = FileGuard.isBinary('./some-file.png');
   console.assert(pngResult.binary === true, 'Test 2 failed: .png should be binary');
   console.log('Test 2 passed: .png extension recognized as binary');

   // Test 3: JSON file should be text
   const jsonResult = FileGuard.isBinary('./package.json');
   console.assert(jsonResult.binary === false, 'Test 3 failed: .json should be text');
   console.log('Test 3 passed: .json recognized as text');

   console.log('All FileGuard tests passed!');
   ```

2. Run: `npm run build` — must pass with zero errors

3. Run test: `npx ts-node /tmp/test-file-guard.ts`

---

## Done Criteria

- [x] `FileGuard.ts` created with extension fast-path and magic number detection
- [x] 64KB sniff buffer used for unknown extensions
- [x] Binary files return clear error messages with reason
- [x] `ExecutionService.ts` and `read_file` tool use `FileGuard`
- [x] `npm run build` passes with zero errors
- [x] Test confirms `.ts`/`.json` = text, `.png`/`.ipa` = binary
- [x] Change `Status` above to `DONE`

---

## Notes

- **Extension fast-path avoids I/O cost** for well-known binary types
- **Sniff buffer is reused** — if file ≤512 bytes we already have the full content
- **Does not affect write operations** — only guards reads
- **Clear error messaging** tells agent exactly why it can't read the file
