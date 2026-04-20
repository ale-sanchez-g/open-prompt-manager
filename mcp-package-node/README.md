# open-prompt-manager-mcp (Node.js / npx)

A standalone MCP (Model Context Protocol) server that connects **Claude Desktop** to your running [Open Prompt Manager](https://github.com/ale-sanchez-g/open-prompt-manager) backend using **Node.js / npx**.

It communicates over **stdio** (required by Claude Desktop) and calls the backend REST API — no direct database access is needed.

---

## Requirements

- Node.js 24+
- A running Open Prompt Manager backend (default: `http://localhost:8000`)

---

## Claude Desktop configuration

Open your Claude Desktop config file:

| OS      | Path |
|---------|------|
| macOS   | `~/Library/Application Support/Claude/claude_desktop_config.json` |
| Windows | `%APPDATA%\Claude\claude_desktop_config.json` |

### Recommended — point directly at the node binary (works with nvm)

Claude Desktop does **not** inherit your shell's `PATH` or `nvm` environment, so
always use the **full absolute path** to a Node 24+ binary.

```json
{
  "mcpServers": {
    "open-prompt-manager": {
      "command": "/absolute/path/to/node",
      "args": ["/absolute/path/to/mcp-package-node/bin/server.js"],
      "env": {
        "BACKEND_URL": "http://localhost:8000"
      }
    }
  }
}
```

> **Tip:** find your node path with `which node` or `nvm which 21` (or whichever version ≥ 18 you use), and replace `/absolute/path/to/node` accordingly.

### Option B — after publishing to npm

Once the package is published to the npm registry you can use npx:

```json
{
  "mcpServers": {
    "open-prompt-manager": {
      "command": "/absolute/path/to/npx",
      "args": ["-y", "open-prompt-manager-mcp"],
      "env": {
        "BACKEND_URL": "http://localhost:8000"
      }
    }
  }
}
```

Restart Claude Desktop after saving the config.

---

## Environment variables

| Variable      | Default                   | Description                              |
|---------------|---------------------------|------------------------------------------|
| `BACKEND_URL` | `http://localhost:8000`   | Base URL of the Open Prompt Manager API  |
| `API_KEY`     | *(empty)*                 | Optional Bearer token for protected APIs |

---

## Local development

```bash
cd mcp-package-node
npm install
node bin/server.js   # waits for stdin from an MCP client — Ctrl+C to stop
```

---

## Available tools

| Tool | Description |
|------|-------------|
| `list_prompts` | List prompts with optional search / tag / agent filters |
| `get_prompt` | Retrieve a prompt by ID |
| `create_prompt` | Create a new prompt |
| `update_prompt` | Update an existing prompt |
| `delete_prompt` | Delete a prompt |
| `render_prompt` | Render a prompt with variable substitution |
| `list_tags` | List all tags |
| `create_tag` | Create a tag |
| `delete_tag` | Delete a tag |
| `list_agents` | List all agents |
| `get_agent` | Retrieve an agent by ID |
| `create_agent` | Create an agent |
| `update_agent` | Update an agent |
| `delete_agent` | Delete an agent |
| `health_check` | Verify the backend is reachable |
