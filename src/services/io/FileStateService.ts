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
   * Returns a list of tracked file paths (absolute).
   */
  public getTrackedFiles(): string[] {
    return Array.from(this.fileStates.keys());
  }

  /**
   * Returns files that were recorded as modified on disk since read.
   * For compatibility with SystemStateService tests we return the filenames
   * (base name) rather than absolute paths.
   */
  public getModifiedFiles(): string[] {
    const modified: string[] = [];
    for (const [p, state] of this.fileStates.entries()) {
      try {
        if (fs.existsSync(p)) {
          const stats = fs.statSync(p);
          if (stats.mtimeMs > state.diskModifiedTime) {
            modified.push(path.basename(p));
          }
        }
      } catch {
        // ignore stat errors
      }
    }
    return modified;
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
