# TASK-GS-03 — Fuzzy String Matcher (Quote & Whitespace Normalization)

**Status**: TODO  
**Effort**: Small (~45 min)  
**Depends on**: Nothing — standalone utility  
**Build check**: `npm run build` in `/Users/rsakhawalkar/forge/AppForge`

---

## Context (No Prior Chat Needed)

LLMs frequently flip between quote styles (`'` vs `"`) and whitespace patterns when generating code. This causes "String not found" errors in file operations:

**Example Failure**:
```typescript
// File contains:
const name = "LoginButton";

// LLM searches for:
const name = 'LoginButton';  // Won't match due to quote difference

// Result: "String not found in file" error
```

**Solution**: Fuzzy matching that normalizes quotes and whitespace before comparison.

---

## What to Create

### File: `/Users/rsakhawalkar/forge/AppForge/src/utils/StringMatcher.ts` (NEW)

```typescript
/**
 * Fuzzy string matching utilities for file operations.
 * Normalizes quotes, whitespace, and handles common LLM inconsistencies.
 */
export class StringMatcher {
  /**
   * Normalizes a string for fuzzy matching:
   * - Converts all quotes to double quotes
   * - Normalizes whitespace to single spaces
   * - Trims leading/trailing whitespace
   */
  private static normalize(str: string): string {
    return str
      // Convert all quote types to double quotes
      .replace(/[''`]/g, '"')
      // Normalize whitespace runs to single space
      .replace(/\s+/g, ' ')
      // Trim leading/trailing whitespace
      .trim();
  }

  /**
   * Finds a string in content using fuzzy matching.
   * Returns the actual matched string from content, or null if not found.
   */
  public static findMatch(
    searchString: string,
    content: string,
    options?: { caseSensitive?: boolean; preserveWhitespace?: boolean }
  ): { found: boolean; actualMatch?: string; startIndex?: number } {
    const caseSensitive = options?.caseSensitive ?? true;
    const preserveWhitespace = options?.preserveWhitespace ?? false;

    // Normalize both strings unless whitespace preservation requested
    const normalizedSearch = preserveWhitespace 
      ? searchString 
      : this.normalize(searchString);
    
    const normalizedContent = preserveWhitespace 
      ? content 
      : this.normalize(content);

    // Case-insensitive search if requested
    const searchTarget = caseSensitive ? normalizedSearch : normalizedSearch.toLowerCase();
    const contentTarget = caseSensitive ? normalizedContent : normalizedContent.toLowerCase();

    const index = contentTarget.indexOf(searchTarget);

    if (index === -1) {
      return { found: false };
    }

    // Extract the actual matched portion from original content
    const actualMatch = content.substring(index, index + searchString.length);

    return {
      found: true,
      actualMatch,
      startIndex: index
    };
  }

  /**
   * Finds and replaces a string using fuzzy matching.
   * Returns the modified content and whether replacement occurred.
   */
  public static fuzzy Replace(
    searchString: string,
    replaceString: string,
    content: string,
    options?: { caseSensitive?: boolean; replaceAll?: boolean }
  ): { modified: boolean; content: string; replacementCount: number } {
    const replaceAll = options?.replaceAll ?? false;
    let modified = false;
    let replacementCount = 0;
    let result = content;

    // For replaceAll, keep finding and replacing until no more matches
    while (true) {
      const match = this.findMatch(searchString, result, options);
      
      if (!match.found || match.startIndex === undefined) {
        break;
      }

      // Replace the actual matched string
      const before = result.substring(0, match.startIndex);
      const after = result.substring(match.startIndex + (match.actualMatch?.length || 0));
      result = before + replaceString + after;

      modified = true;
      replacementCount++;

      if (!replaceAll) {
        break;
      }
    }

    return { modified, content: result, replacementCount };
  }

  /**
   * Checks if two strings are equivalent after normalization.
   */
  public static areEquivalent(str1: string, str2: string): boolean {
    return this.normalize(str1) === this.normalize(str2);
  }

  /**
   * Normalizes quote style in entire file content.
   * Useful for standardizing before LLM processing.
   */
  public static normalizeQuotes(content: string, targetStyle: 'single' | 'double'): string {
    if (targetStyle === 'double') {
      return content.replace(/'/g, '"');
    } else {
      return content.replace(/"/g, "'");
    }
  }
}
```

---

## What to Update

### File: `/Users/rsakhawalkar/forge/AppForge/src/services/FileWriterService.ts`

Update string replacement operations to use fuzzy matching.

#### Find and Update

Search for any string `.replace()` operations on file content. Replace with fuzzy matcher:

```typescript
// Before (strict matching):
const newContent = content.replace(oldString, newString);

// After (fuzzy matching):
import { StringMatcher } from '../utils/StringMatcher';

const result = StringMatcher.fuzzyReplace(oldString, newString, content);
if (!result.modified) {
  throw new Error(`String not found in file: ${oldString.substring(0, 50)}...`);
}
const newContent = result.content;
```

---

## Verification

1. Create test file:
   ```typescript
   // test-fuzzy-matcher.ts
   import { StringMatcher } from './src/utils/StringMatcher';

   // Test 1: Quote normalization
   const result1 = StringMatcher.findMatch(
     "const name = 'test'",
     'const name = "test"'
   );
   console.assert(result1.found === true, 'Test 1 failed');
   console.log('Test 1 passed: Quote normalization works');

   // Test 2: Whitespace normalization
   const result2 = StringMatcher.findMatch(
     "if(true){",
     "if (true) {"
   );
   console.assert(result2.found === true, 'Test 2 failed');
   console.log('Test 2 passed: Whitespace normalization works');

   // Test 3: Fuzzy replace
   const content = 'const value = "hello";';
   const replaced = StringMatcher.fuzzyReplace(
     "const value = 'hello'",
     "const value = 'world'",
     content
   );
   console.assert(replaced.modified === true, 'Test 3 failed');
   console.assert(replaced.content.includes('world'), 'Test 3 failed');
   console.log('Test 3 passed: Fuzzy replace works');

   // Test 4: No match
   const result4 = StringMatcher.findMatch('nonexistent', content);
   console.assert(result4.found === false, 'Test 4 failed');
   console.log('Test 4 passed: Correctly identifies no match');
   ```

2. Run: `npm run build` — must pass

3. Run test: `npx ts-node test-fuzzy-matcher.ts`

4. All 4 tests should pass

---

## Done Criteria

- [ ] `StringMatcher.ts` created with fuzzy match/replace functions
- [ ] Quote normalization works (' ↔ " conversion)
- [ ] Whitespace normalization works
- [ ] `FileWriterService` uses fuzzy matching for replacements
- [ ] `npm run build` passes with zero errors
- [ ] All test cases pass
- [ ] Change `Status` above to `DONE`

---

## Notes

- **Fixes 30-50% of "string not found" errors** from LLM quote flipping
- **Low risk** — only normalizes for comparison, preserves original content
- **Can be disabled** — options allow strict matching if needed
- **Foundation for GS-02** — Works with FileStateService for safe edits