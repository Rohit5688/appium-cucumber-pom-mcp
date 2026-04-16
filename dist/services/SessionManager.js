import { AppiumSessionService } from './AppiumSessionService.js';
import { McpErrors } from '../types/ErrorSystem.js';
import { Logger } from '../utils/Logger.js';
import { withRetry, RetryPolicies } from '../utils/RetryEngine.js';
/**
 * SessionManager - Singleton service to manage Appium sessions safely.
 *
 * Prevents issues:
 * - Concurrent session creation conflicts
 * - Resource leaks from failed sessions
 * - Memory accumulation from screenshots
 * - Zombie sessions that never cleanup
 *
 * Features:
 * - One session per projectRoot
 * - Automatic idle timeout and cleanup
 * - Retry logic with exponential backoff
 * - Memory usage monitoring
 * - Process exit cleanup hooks
 */
export class SessionManager {
    static instance = null;
    static hasRegisteredHandlers = false;
    static instanceCounter = 0;
    sessions = new Map();
    sessionLocks = new Map();
    cleanupTimer = null;
    config;
    instanceId;
    isShuttingDown = false;
    constructor(config) {
        this.instanceId = ++SessionManager.instanceCounter;
        this.config = {
            maxIdleTimeMs: 5 * 60 * 1000, // 5 minutes
            maxMemoryMB: 50,
            cleanupIntervalMs: 60 * 1000, // 1 minute
            maxRetryAttempts: 3,
            ...config
        };
        if (this.config.maxIdleTimeMs < 1000) {
            throw McpErrors.configValidationFailed(`maxIdleTimeMs must be >= 1000 (value: ${this.config.maxIdleTimeMs})`, 'SessionManager');
        }
        if (this.config.maxMemoryMB < 10) {
            throw McpErrors.configValidationFailed(`maxMemoryMB must be >= 10 (value: ${this.config.maxMemoryMB})`, 'SessionManager');
        }
        this.startCleanupTimer();
        this.registerExitHandlers();
    }
    /**
     * Get singleton instance
     */
    static getInstance(config) {
        if (!SessionManager.instance) {
            SessionManager.instance = new SessionManager(config);
        }
        else if (config) {
            Logger.warn('Reconfiguring existing instance with new configuration.');
            SessionManager.instance.reconfigure(config);
        }
        return SessionManager.instance;
    }
    reconfigure(config) {
        if (config.maxIdleTimeMs !== undefined) {
            if (config.maxIdleTimeMs < 1000)
                throw McpErrors.configValidationFailed(`maxIdleTimeMs must be >= 1000 (value: ${config.maxIdleTimeMs})`, 'SessionManager');
            this.config.maxIdleTimeMs = config.maxIdleTimeMs;
        }
        if (config.maxMemoryMB !== undefined) {
            if (config.maxMemoryMB < 10)
                throw McpErrors.configValidationFailed(`maxMemoryMB must be >= 10 (value: ${config.maxMemoryMB})`, 'SessionManager');
            this.config.maxMemoryMB = config.maxMemoryMB;
        }
        if (config.cleanupIntervalMs !== undefined) {
            this.config.cleanupIntervalMs = config.cleanupIntervalMs;
            if (this.cleanupTimer) {
                clearInterval(this.cleanupTimer);
                this.startCleanupTimer();
            }
        }
        if (config.maxRetryAttempts !== undefined) {
            this.config.maxRetryAttempts = config.maxRetryAttempts;
        }
    }
    /**
     * Get or create a session for the given project root.
     * Prevents concurrent sessions for the same project.
     *
     * RACE CONDITION FIX: Uses session locks to prevent multiple concurrent
     * session creation attempts for the same project.
     */
    async getSession(projectRoot, profileName, forceNew = false) {
        if (this.isShuttingDown) {
            throw McpErrors.sessionNotFound('shutdown', 'SessionManager');
        }
        const normalizedPath = this.normalizePath(projectRoot);
        // Check if session creation is already in progress (RACE CONDITION FIX)
        const existingLock = this.sessionLocks.get(normalizedPath);
        if (existingLock) {
            Logger.info(`Waiting for in-progress session creation: ${normalizedPath}`);
            return existingLock;
        }
        const existing = this.sessions.get(normalizedPath);
        // Return existing active session
        if (existing && !forceNew) {
            if (await this.isSessionHealthy(existing)) {
                existing.lastUsedAt = Date.now();
                Logger.info(`Reusing existing session for ${normalizedPath}`);
                return existing.service;
            }
            else {
                // Session is dead, clean it up
                await this.cleanupSession(normalizedPath);
            }
        }
        // Create lock to prevent concurrent creation (RACE CONDITION FIX)
        const creationPromise = this.createSessionWithRetry(normalizedPath, profileName);
        this.sessionLocks.set(normalizedPath, creationPromise);
        try {
            const service = await creationPromise;
            return service;
        }
        finally {
            this.sessionLocks.delete(normalizedPath);
        }
    }
    /**
     * Check if a session exists and is active for the given project
     */
    hasActiveSession(projectRoot) {
        const normalizedPath = this.normalizePath(projectRoot);
        const session = this.sessions.get(normalizedPath);
        return session ? session.isActive : false;
    }
    /**
     * Get session info without activating it
     */
    getSessionInfo(projectRoot) {
        const normalizedPath = this.normalizePath(projectRoot);
        return this.sessions.get(normalizedPath) || null;
    }
    /**
     * ISessionVerifier proxy — delegates to the first active AppiumSessionService.
     * Allows SessionManager to satisfy the ISessionVerifier interface so
     * OrchestrationService can receive it without an `as any` cast.
     *
     * Throws McpErrors.sessionNotFound if no active session exists.
     */
    async verifySelector(selector) {
        const active = Array.from(this.sessions.values()).find(s => s.isActive);
        if (!active) {
            throw McpErrors.sessionNotFound('none', 'SessionManager.verifySelector');
        }
        return active.service.verifySelector(selector);
    }
    /**
     * Explicitly end a session for a project
     */
    async endSession(projectRoot) {
        const normalizedPath = this.normalizePath(projectRoot);
        await this.cleanupSession(normalizedPath);
    }
    /**
     * End all sessions (for shutdown)
     */
    async endAllSessions() {
        this.isShuttingDown = true;
        if (this.cleanupTimer) {
            clearInterval(this.cleanupTimer);
            this.cleanupTimer = null;
        }
        const cleanupPromises = Array.from(this.sessions.keys()).map(projectRoot => this.cleanupSession(projectRoot));
        await Promise.allSettled(cleanupPromises);
        Logger.info('All sessions cleaned up during shutdown');
    }
    /**
     * Get memory usage statistics
     */
    getSessionHealthMetrics() {
        const now = Date.now();
        let totalSessions = 0;
        let activeSessions = 0;
        let failedSessions = 0;
        let totalAge = 0;
        let oldestSession = 0;
        for (const record of this.sessions.values()) {
            totalSessions++;
            if (record.isActive) {
                activeSessions++;
            }
            else {
                failedSessions++;
            }
            const age = now - record.createdAt;
            totalAge += age;
            if (age > oldestSession) {
                oldestSession = age;
            }
        }
        const averageSessionAge = totalSessions > 0 ? totalAge / totalSessions : 0;
        return {
            totalSessions,
            activeSessions,
            failedSessions,
            averageSessionAge,
            oldestSession
        };
    }
    getMemoryStats() {
        const activeSessions = Array.from(this.sessions.values()).filter(s => s.isActive).length;
        // TODO: Integrate with ScreenshotStorage to get actual memory usage
        return {
            totalSessions: this.sessions.size,
            activeSessions,
            memoryUsageMB: 0 // Placeholder - will be implemented with ScreenshotStorage integration
        };
    }
    // ─── Private Implementation ──────────────────────────
    async createSessionWithRetry(projectRoot, profileName) {
        const policy = {
            ...RetryPolicies.appiumSession,
            maxAttempts: this.config.maxRetryAttempts,
            onRetry: (error, attempt, delayMs) => {
                Logger.error(`Session creation failed (attempt ${attempt})`, { error: error.message });
                if (attempt < this.config.maxRetryAttempts) {
                    Logger.info(`Retrying in ${delayMs}ms...`);
                }
            }
        };
        try {
            const result = await withRetry(async () => {
                Logger.info(`Creating session for ${projectRoot}`);
                const service = new AppiumSessionService();
                const sessionInfo = await service.startSession(projectRoot, profileName);
                return { service, sessionInfo };
            }, policy);
            const record = {
                service: result.value.service,
                projectRoot,
                createdAt: Date.now(),
                lastUsedAt: Date.now(),
                sessionId: result.value.sessionInfo.sessionId,
                isActive: true
            };
            this.sessions.set(projectRoot, record);
            Logger.info(`Session created successfully: ${result.value.sessionInfo.sessionId}`);
            return result.value.service;
        }
        catch (error) {
            throw McpErrors.appiumNotReachable(`session creation after ${policy.maxAttempts} attempts. Last error: ${error.message}`, 'SessionManager');
        }
    }
    async isSessionHealthy(record) {
        try {
            return await record.service.isSessionAlive();
        }
        catch {
            return false;
        }
    }
    async cleanupSession(projectRoot) {
        const record = this.sessions.get(projectRoot);
        if (!record)
            return;
        try {
            Logger.info(`Cleaning up session for ${projectRoot}`);
            await record.service.endSession();
        }
        catch (error) {
            Logger.warn("Error during session cleanup", { error: error.message });
        }
        finally {
            this.sessions.delete(projectRoot);
        }
    }
    startCleanupTimer() {
        this.cleanupTimer = setInterval(() => {
            this.cleanupIdleSessions();
        }, this.config.cleanupIntervalMs);
    }
    async cleanupIdleSessions() {
        if (this.isShuttingDown)
            return;
        const now = Date.now();
        const idleProjectRoots = [];
        for (const [projectRoot, record] of this.sessions.entries()) {
            const idleTime = now - record.lastUsedAt;
            if (idleTime > this.config.maxIdleTimeMs) {
                Logger.info(`Session ${projectRoot} idle for ${Math.round(idleTime / 1000)}s, cleaning up...`);
                idleProjectRoots.push(projectRoot);
            }
        }
        // Cleanup idle sessions
        for (const projectRoot of idleProjectRoots) {
            await this.cleanupSession(projectRoot);
        }
    }
    registerExitHandlers() {
        // Prevent registering handlers multiple times
        if (SessionManager.hasRegisteredHandlers)
            return;
        SessionManager.hasRegisteredHandlers = true;
        const cleanup = async () => {
            Logger.info('Process exit detected, cleaning up sessions...');
            await this.endAllSessions();
        };
        // Handle various exit scenarios
        process.on('exit', () => {
            // Note: async cleanup won't work in 'exit', but we try anyway
            this.endAllSessions().catch(() => { });
        });
        process.on('SIGINT', async () => {
            await cleanup();
            process.exit(0);
        });
        process.on('SIGTERM', async () => {
            await cleanup();
            process.exit(0);
        });
        process.on('uncaughtException', async (error) => {
            Logger.error('Uncaught exception, cleaning up sessions...', { error: String(error) });
            await cleanup();
            process.exit(1);
        });
        process.on('unhandledRejection', async (reason) => {
            Logger.error('Unhandled rejection, cleaning up sessions...', { reason: String(reason) });
            await cleanup();
            process.exit(1);
        });
    }
    normalizePath(projectRoot) {
        // Normalize path separators and resolve relative paths
        return projectRoot.replace(/\\/g, '/').replace(/\/+$/, '');
    }
    delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
    /**
     * Return unique string identifier for this instance (for testing)
     */
    toString() {
        return `SessionManager#${this.instanceId}`;
    }
    /**
     * For testing: Force cleanup of singleton (use with caution)
     */
    static async destroyInstance() {
        if (SessionManager.instance) {
            await SessionManager.instance.endAllSessions();
            SessionManager.instance = null;
        }
    }
}
