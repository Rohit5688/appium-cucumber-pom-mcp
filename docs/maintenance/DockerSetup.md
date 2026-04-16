---
title: "🐳 Containerization & Docker"
description: "Deploying AppForge in a secure, ephemeral infrastructure."
---

import { Steps, Aside } from '@astrojs/starlight/components';

Deploying AppForge within a containerized infrastructure ensures **Environment Parity** and **Predictable Execution** across your developer team and CI/CD pipelines.

---

## 🏗️ 1. The Production-Ready Docker Image

AppForge includes a pre-configured Dockerfile designed for minimal footprint and maximum security isolation.

### Baseline Features:
- **Hardened Node.js base**: Uses a stable, security-patched LTS image.
- **Appium Driver Provisioning**: Includes the logic required to install and manage Android and iOS drivers inside the container.
- **Stateless Architecture**: Designed for ephemeral execution—spin up, test, tear down.

---

## 🔒 2. Data Persistence & Sovereignty

When running containerized, managing the lifecycle of your test artifacts is critical for security compliance.

### Volume Strategy
- **`projectRoot` mapping**: Mount your local project directory to the container to ensure the `StructuralBrain` and generated code remain persistent.
- **Encryption at Rest**: Ensure that mounted volumes (e.g., AWS EBS, Azure Files) are encrypted using organization-managed keys.

---

## 📡 3. Secure Transport Protocols

AppForge supports two primary transport modes for communication between the LLM and the container.

| Mode | Transport | Security Profile |
| :--- | :--- | :--- |
| **`stdio`** (Default) | Standard I/O | **Highest**. No network port is exposed; communication happens via the container's stdin/stdout. |
| **`SSE`** | TCP/3100 | **Restricted**. Used for remote bridge connections. Must be placed behind a Private VPC and TLS-secured Gateway. |

---

## 🏗️ 4. Deployment Orchestration

<Steps>

1.  ### Image Synthesis
    Build the local image: `docker build -t appforge-server .`
2.  ### Environment Injection
    Inject credentials at runtime using environment variables (AWS Secrets Manager / Vault). **Never** bake `.env` files into the image.
3.  ### Ephemeral Execution
    Launch for each CI job and terminate upon completion to minimize the residency window of sensitive app screenshots or UI hierarchies.

</Steps>

---

> [!CAUTION]
> **Network Isolation**: In `SSE` mode, never expose port 3100 to the public internet. Access should be restricted to your organization's internal VPN or a peered VPC boundary.

---

**Orchestrated infrastructure for the modern team. 🐳**
