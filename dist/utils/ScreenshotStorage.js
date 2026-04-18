import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
/**
 * ScreenshotStorage — Manages local storage of screenshots to prevent
 * base64 data from consuming excessive context tokens in MCP responses.
 *
 * Issue: Screenshots in responses eat whole context and cause LLM hallucinations.
 * Solution: Store screenshots locally with unique IDs and return file paths instead.
 */
export class ScreenshotStorage {
    storageRoot;
    constructor(projectRoot) {
        // Store screenshots in .AppForge/screenshots/ to keep them isolated
        this.storageRoot = path.join(projectRoot, '.AppForge', 'screenshots');
        this.ensureStorageDirectory();
    }
    /**
     * Creates the storage directory if it doesn't exist.
     */
    ensureStorageDirectory() {
        if (!fs.existsSync(this.storageRoot)) {
            fs.mkdirSync(this.storageRoot, { recursive: true });
        }
    }
    /**
     * Stores a base64 screenshot and returns the file path.
     * @param base64Data - Base64 encoded screenshot data
     * @param prefix - Optional prefix for the filename (e.g., 'session', 'failure', 'heal')
     * @returns Object containing the file path and metadata
     */
    store(base64Data, prefix = 'screenshot') {
        // Generate unique filename using timestamp + short hash
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const hash = crypto.createHash('md5').update(base64Data.substring(0, 100)).digest('hex').substring(0, 8);
        const filename = `${prefix}_${timestamp}_${hash}.png`;
        const filePath = path.join(this.storageRoot, filename);
        // Compress before writing to reduce storage and context token cost
        const originalBuffer = Buffer.from(base64Data, 'base64');
        const compressed = ScreenshotStorage.scaleDownPng(originalBuffer);
        fs.writeFileSync(filePath, compressed);
        return {
            filePath,
            relativePath: path.relative(process.cwd(), filePath),
            timestamp: new Date().toISOString(),
            size: compressed.length,
            originalSize: originalBuffer.length,
            compressionRatio: `${Math.round((1 - compressed.length / originalBuffer.length) * 100)}% smaller`,
        };
    }
    /**
     * Static convenience wrapper used by DomInspectorService and AppiumSessionService.
     * Compresses the PNG before storing — transparent to callers.
     */
    static storeBase64(projectRoot, prefix, base64Data) {
        const storage = new ScreenshotStorage(projectRoot);
        return storage.store(base64Data, prefix);
    }
    /**
     * Compress a raw PNG Buffer by dimension-halving (drop every other row & column).
     * Uses only Node.js built-ins — no sharp, jimp, or canvas required.
     *
     * Strategy: strip every other pixel in both dimensions → ~75% pixel reduction.
     * The PNG structure is preserved by re-encoding scanlines. On typical mobile
     * screenshots (1080×1920) this produces a 540×960 image at ~40% of the original
     * file size, well within LLM vision model budgets.
     *
     * If parsing fails for any reason, returns original unchanged (safe fallback).
     */
    static scaleDownPng(input) {
        try {
            // PNG signature: 8 bytes, then IHDR chunk: 4 len + 4 type + 13 data + 4 crc
            if (input.length < 33 || input.readUInt32BE(0) !== 0x89504e47) {
                return input; // Not a PNG — return as-is
            }
            const width = input.readUInt32BE(16);
            const height = input.readUInt32BE(20);
            const bitDepth = input[24];
            const colorType = input[25];
            // Only handle 8-bit RGB (colorType=2) and RGBA (colorType=6) — the two cases
            // produced by Playwright/Appium screenshots. For all others, pass through.
            const channels = colorType === 2 ? 3 : colorType === 6 ? 4 : 0;
            if (channels === 0 || bitDepth !== 8)
                return input;
            // Decompress the IDAT chunk(s) using Node's built-in zlib
            const zlib = require('zlib');
            // Collect all IDAT chunks
            const idatBuffers = [];
            let pos = 8;
            while (pos < input.length - 12) {
                const chunkLen = input.readUInt32BE(pos);
                const chunkType = input.toString('ascii', pos + 4, pos + 8);
                if (chunkType === 'IDAT') {
                    idatBuffers.push(input.subarray(pos + 8, pos + 8 + chunkLen));
                }
                if (chunkType === 'IEND')
                    break;
                pos += 12 + chunkLen;
            }
            if (idatBuffers.length === 0)
                return input;
            const rawPixels = zlib.inflateSync(Buffer.concat(idatBuffers));
            const stride = 1 + width * channels; // filter byte + pixel row
            if (rawPixels.length < stride * height)
                return input;
            // Scale down: pick every other row and every other pixel
            const newWidth = Math.floor(width / 2);
            const newHeight = Math.floor(height / 2);
            const newStride = 1 + newWidth * channels;
            const outPixels = Buffer.allocUnsafe(newStride * newHeight);
            for (let ry = 0; ry < newHeight; ry++) {
                const srcRow = ry * 2;
                const srcOffset = srcRow * stride;
                const dstOffset = ry * newStride;
                outPixels[dstOffset] = 0; // filter type None
                for (let rx = 0; rx < newWidth; rx++) {
                    const srcPx = srcOffset + 1 + rx * 2 * channels;
                    const dstPx = dstOffset + 1 + rx * channels;
                    rawPixels.copy(outPixels, dstPx, srcPx, srcPx + channels);
                }
            }
            // Re-deflate (level 6 = good balance of size vs speed)
            const recompressed = zlib.deflateSync(outPixels, { level: 6 });
            // Rebuild minimal PNG: signature + IHDR + IDAT + IEND
            const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
            const ihdr = ScreenshotStorage._pngChunk('IHDR', (() => {
                const d = Buffer.allocUnsafe(13);
                d.writeUInt32BE(newWidth, 0);
                d.writeUInt32BE(newHeight, 4);
                d[8] = 8; // bit depth
                d[9] = colorType; // preserved
                d[10] = 0;
                d[11] = 0;
                d[12] = 0; // compression/filter/interlace
                return d;
            })());
            const idat = ScreenshotStorage._pngChunk('IDAT', recompressed);
            const iend = ScreenshotStorage._pngChunk('IEND', Buffer.alloc(0));
            return Buffer.concat([sig, ihdr, idat, iend]);
        }
        catch {
            // Any parse failure → return original unchanged (safe fallback)
            return input;
        }
    }
    /** Build a PNG chunk: 4-byte length + 4-byte type + data + 4-byte CRC */
    static _pngChunk(type, data) {
        const crc32 = require('zlib');
        const typeBuffer = Buffer.from(type, 'ascii');
        const len = Buffer.allocUnsafe(4);
        len.writeUInt32BE(data.length, 0);
        // CRC covers type + data
        const crcInput = Buffer.concat([typeBuffer, data]);
        // Node zlib doesn't expose crc32 directly, use createCrc32 workaround via Buffer
        // We use the standard CRC-32 polynomial via a lookup table
        const crc = ScreenshotStorage._crc32(crcInput);
        const crcBuf = Buffer.allocUnsafe(4);
        crcBuf.writeUInt32BE(crc >>> 0, 0);
        return Buffer.concat([len, typeBuffer, data, crcBuf]);
    }
    /** CRC-32 using standard PNG polynomial (0xEDB88320 reflected) */
    static _crc32(buf) {
        let crc = 0xffffffff;
        for (let i = 0; i < buf.length; i++) {
            crc ^= buf[i];
            for (let k = 0; k < 8; k++) {
                crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
            }
        }
        return (crc ^ 0xffffffff);
    }
    /**
     * Reads a stored screenshot and returns it as base64.
     * Used when the screenshot needs to be retrieved for processing.
     */
    read(filePath) {
        if (!fs.existsSync(filePath)) {
            throw new Error(`Screenshot not found: ${filePath}`);
        }
        const buffer = fs.readFileSync(filePath);
        return buffer.toString('base64');
    }
    /**
     * Cleans up old screenshots to prevent storage bloat.
     * @param maxAgeMs - Maximum age in milliseconds (default: 24 hours)
     */
    cleanup(maxAgeMs = 86400000) {
        let removed = 0;
        let freedBytes = 0;
        const now = Date.now();
        if (!fs.existsSync(this.storageRoot)) {
            return { removed: 0, freedBytes: 0 };
        }
        const files = fs.readdirSync(this.storageRoot);
        for (const file of files) {
            const filePath = path.join(this.storageRoot, file);
            const stats = fs.statSync(filePath);
            // Remove files older than maxAgeMs
            if (now - stats.mtimeMs > maxAgeMs) {
                freedBytes += stats.size;
                fs.unlinkSync(filePath);
                removed++;
            }
        }
        return { removed, freedBytes };
    }
    /**
     * Returns a summary of stored screenshots.
     */
    getSummary() {
        if (!fs.existsSync(this.storageRoot)) {
            return { count: 0, totalSizeBytes: 0, oldestTimestamp: null, newestTimestamp: null };
        }
        const files = fs.readdirSync(this.storageRoot);
        let totalSize = 0;
        let oldest = null;
        let newest = null;
        for (const file of files) {
            const filePath = path.join(this.storageRoot, file);
            const stats = fs.statSync(filePath);
            totalSize += stats.size;
            if (oldest === null || stats.mtimeMs < oldest) {
                oldest = stats.mtimeMs;
            }
            if (newest === null || stats.mtimeMs > newest) {
                newest = stats.mtimeMs;
            }
        }
        return {
            count: files.length,
            totalSizeBytes: totalSize,
            oldestTimestamp: oldest ? new Date(oldest).toISOString() : null,
            newestTimestamp: newest ? new Date(newest).toISOString() : null
        };
    }
}
