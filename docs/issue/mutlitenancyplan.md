# Implementation Plan: Enterprise Multi-Tenant Architecture

This document outlines the architectural roadmap for migrating **TestForge** and **AppForge** from a singleton-based shared environment to a secure, multi-tenant enterprise system.

## 1. Objective

To support multiple organizational tenants on shared infrastructure with strict isolation, federated knowledge growth, and robust resource governance.

## 2. Core Architectural Pillars

### A. Tenant Identity & Call Tracking

- **Context Propagation**: Use Node.js `AsyncLocalStorage` to carry `tenantId` through the entire request lifecycle.
- **Middleware**: Express middleware to authenticate and identify tenants from HTTP headers.

### B. Scoped Service Resolution

- **Registry isolation**: `ServiceContainer` resolves instances (SessionManager, BudgetService) uniquely per `tenantId`.

### C. Partitioned Persistence & Layered Knowledge

- **Cascading Lookup**: Tenant Override -> Team Pool -> Central Global Brain.
- **Shadowing**: User corrections create local overrides that do not immediately affect others.
- **Central Sync**: A de-duplication service that reconciles frequent overrides to update the Central Knowledge Base.

## 3. The Knowledge Flywheel & Hygiene

- **Federated Learning**: Promote unique, high-confidence tenant patterns to the global pool.
- **Success-Based Decay**: Automatically de-rank patterns that begin failing in the field.
- **Semantic Deduping**: Merge similar issues into canonical entries to prevent bloat.

## 4. Knowledge Resilience & Safety

- **Auto-Snapshots**: Hourly incremental backups of all knowledge files.
- **Write-Ahead Logging (WAL)**: Use transaction logs to ensure crash-consistency during updates.

## 5. Advanced Governance & Security

### A. "Noisy Neighbor" Protection

- **Concurrency Semaphores**: Implement strict quotas on parallel automation runs per tenant to prevent resource monopolization.

### B. Tenantized Secrets (Vault)

- **Isolated Credentials**: Keyed storage for site passwords and API keys, encrypted with tenant-specific salts.

### C. Attribution & Observability

- **Log Tagging**: Inject `tenantId` into every log entry and trace for secure, partitioned debugging in external platforms (ELK, Datadog).

### D. Version Divergence (Runners)

- **Isolated Execution**: Support for different SDK versions (Playwright/Appium) by spawning isolated runners in tenant-specific environments.

## 6. Implementation Phases

1. **Phase 1**: Identity Context & Scoped Container.
2. **Phase 2**: WAL Persistence & Automated Backups.
3. **Phase 3**: Layered Knowledge, Shadowing, and Syncing.
4. **Phase 4**: Concurrency Semaphores & Secret Vault isolation.
5. **Phase 5**: Multi-version Runner Architecture.
