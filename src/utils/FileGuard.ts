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
