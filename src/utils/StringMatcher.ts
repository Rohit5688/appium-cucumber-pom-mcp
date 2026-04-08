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
  /**
   * Normalizes a string by converting quotes and removing ALL whitespace,
   * while keeping a map of normalized indices to original indices.
   */
  private static normalizeWithMap(str: string) {
    let normalized = '';
    const map: number[] = [];
    for (let i = 0; i < str.length; i++) {
      const char = str[i];
      if (/\s/.test(char)) {
        continue;
      }
      if (char === "'" || char === '"' || char === '`') {
        normalized += '"';
      } else {
        normalized += char;
      }
      map.push(i);
    }
    // ensure we have a mapping for the end of the string length
    map.push(str.length);
    return { normalized, map };
  }

  /**
   * Normalizes a string for simple fuzzy comparison:
   * - Converts all quotes to double quotes
   * - Normalizes whitespace to single spaces
   * - Trims leading/trailing whitespace
   */
  private static normalize(str: string): string {
    return str
      .replace(/['`]/g, '"')
      .replace(/\s+/g, ' ')
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

    if (preserveWhitespace) {
      const searchTarget = caseSensitive ? searchString : searchString.toLowerCase();
      const contentTarget = caseSensitive ? content : content.toLowerCase();
      const index = contentTarget.indexOf(searchTarget);
      if (index === -1) return { found: false };
      return {
        found: true,
        actualMatch: content.substring(index, index + searchString.length),
        startIndex: index
      };
    }

    const { normalized: normSearch } = this.normalizeWithMap(searchString);
    const { normalized: normContent, map } = this.normalizeWithMap(content);

    const searchTarget = caseSensitive ? normSearch : normSearch.toLowerCase();
    const contentTarget = caseSensitive ? normContent : normContent.toLowerCase();

    const index = contentTarget.indexOf(searchTarget);

    if (index === -1) {
      return { found: false };
    }

    const startIndex = map[index];
    // endIndex maps to the character in original string right after the last matched non-whitespace character
    const endIndex = map[index + searchTarget.length];

    const actualMatch = content.substring(startIndex, endIndex);

    return {
      found: true,
      actualMatch,
      startIndex
    };
  }

  /**
   * Finds and replaces a string using fuzzy matching.
   * Returns the modified content and whether replacement occurred.
   */
  public static fuzzyReplace(
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
