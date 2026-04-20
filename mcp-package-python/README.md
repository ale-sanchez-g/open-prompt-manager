# open-prompt-manager-mcp

A standalone MCP (Model Context Protocol) server that connects **Claude Desktop** to your running [Open Prompt Manager](https://github.com/ale-sanchez-g/open-prompt-manager) backend.

It communicates over **stdio** (required by Claude Desktop) and calls the backend REST API — no direct database access is needed.

---

## Requirements

- Python 3.14+
- A running Open Prompt Manager backend (default: `http://localhost:8000`)

---

## Installation

### Option A — install directly from the repo

```bash
pip install ./mcp-package-python
```

### Option B — install in editable/development mode

```bash
pip install -e ./mcp-package-python
```

---

## Claude Desktop configuration

Open your Claude Desktop config file:

| OS      | Path |
|---------|------|
| macOS   | `~/Library/Application Support/Claude/claude_desktop_config.json` |
| Windows | `%APPDATA%\Claude\claude_desktop_config.json` |

Add the following entry inside `"mcpServers"`:

```json
{
  "mcpServers": {
    "open-prompt-manager": {
      "command": "open-prompt-manager-mcp",
      "env": {
        "BACKEND_URL": "http://localhost:8000"
      }
    }
  }
}
```

If your backend is running on a different host or port, update `BACKEND_URL` accordingly.

If you have not installed the package globally, use the full path to the script instead:

```json
{
  "mcpServers": {
    "open-prompt-manager": {
      "command": "python",
      "args": ["-m", "open_prompt_manager_mcp"],
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

## Available tools

Once connected, Claude can use these tools:

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

---

## Testing the server manually

```bash
# Install
pip install ./mcp-package-python

# Verify the entry point works
BACKEND_URL=http://localhost:8000 open-prompt-manager-mcp
# (Press Ctrl+C — it will wait for stdin from an MCP client)
```
