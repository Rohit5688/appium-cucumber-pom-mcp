---
title: "🐳 Dockerized AppForge Server"
---

import { Steps } from '@astrojs/starlight/components';

The AppForge Server can be fully dockerized for consistent local development and remote team collaboration. Using the official `node` image ensures that all OS-level dependencies for WebdriverIO execution are standardized.

---

<Steps>

1.  ### 🏗️ Building the Image
    Clone the repository and build the Docker image locally:
    
    ```bash
    docker build -t mcp-AppForge .
    ```
    
    *Note: The image contains the full Node.js environment, the MCP server, and its dependencies.*

2.  ### 🏠 Running Locally (Stdio for local codebases)
    If you are running the MCP Server to analyze and generate code for a **local project**, you must run the container using `stdio` and mount your workspace.

    ```bash
    docker run -i --rm \
      -v /path/to/your/project:/app/workspace \
      mcp-AppForge
    ```

3.  ### 🌐 Running Remotely (SSE over HTTP)
    If deploying to a cloud provider for remote team access, run it using the **SSE (Server-Sent Events)** transport.

    ```bash
    docker run -p 3100:3100 -d mcp-AppForge --transport sse --port 3100 --host 0.0.0.0
    ```

4.  ### 📂 Best Practices
    *   **Mounting the AI Brain**: Mount the `.AppForge` knowledge folder as a volume for persistent learning.
    *   **Environment Secrets**: Pass Cloud Device testing credentials (e.g., BrowserStack) via Docker environment variables.
    *   **Host Permissions**: If encountering permission errors on Linux, force Docker to run as your local user via `--user $(id -u):$(id -g)`.

</Steps>

---