# MCP client setup

The `brightspace-mcp` server speaks the Model Context Protocol over stdio. Any MCP-capable client can launch it as a subprocess.

## Claude Desktop

Edit `~/Library/Application Support/Claude/claude_desktop_config.json` (macOS) or `%APPDATA%\Claude\claude_desktop_config.json` (Windows):

```json
{
  "mcpServers": {
    "brightspace": {
      "command": "npx",
      "args": ["--yes", "brightspace-mcp", "serve"],
      "env": {
        "BRIGHTSPACE_API_TOKEN": "your-token-here"
      }
    }
  }
}
```

Restart Claude Desktop. The Brightspace tools appear in the tool picker.

## Cursor

Edit `~/.cursor/mcp.json`:

```json
{
  "mcpServers": {
    "brightspace": {
      "command": "npx",
      "args": ["--yes", "brightspace-mcp", "serve"],
      "env": {
        "BRIGHTSPACE_API_TOKEN": "your-token-here"
      }
    }
  }
}
```

## Windsurf

Edit `~/.codeium/windsurf/mcp_config.json`:

```json
{
  "mcpServers": {
    "brightspace": {
      "command": "npx",
      "args": ["--yes", "brightspace-mcp", "serve"],
      "env": {
        "BRIGHTSPACE_API_TOKEN": "your-token-here"
      }
    }
  }
}
```

## Using a config file instead of env vars

Point the server to a YAML config via `BRIGHTSPACE_CONFIG`:

```json
{
  "mcpServers": {
    "brightspace": {
      "command": "npx",
      "args": ["--yes", "brightspace-mcp", "serve"],
      "env": {
        "BRIGHTSPACE_CONFIG": "/Users/you/.brightspace-mcp/config.yaml"
      }
    }
  }
}
```

## Docker variant

If you prefer Docker, the `command`/`args` pair becomes:

```json
{
  "mcpServers": {
    "brightspace": {
      "command": "docker",
      "args": [
        "run", "--rm", "-i",
        "-v", "/Users/you/.brightspace-mcp:/config:ro",
        "-e", "BRIGHTSPACE_CONFIG=/config/config.yaml",
        "ghcr.io/jhostinaleck/brightspace-mcp:latest",
        "serve"
      ]
    }
  }
}
```

## MCP Resources and Prompts

If your MCP client supports Resources and Prompts (Claude Desktop, Cursor), they are automatically available once the server starts:

- **Resources** — ask "read `brightspace://{courseId}/syllabus`" or let the LLM construct URIs from tool output IDs.
- **Prompts** — look for `weekly_briefing`, `grade_audit`, `study_planner`, `course_summary` in the prompt picker (⌘/ or `/` in the chat).

## Verification

Once registered, ask the client: *"List my Brightspace courses."* The client should invoke `list_my_courses` and return the result.

If the tool does not appear:
- Check the client's log (Claude Desktop: `~/Library/Logs/Claude/mcp*.log`)
- Confirm `BRIGHTSPACE_API_TOKEN` or `BRIGHTSPACE_CONFIG` is set in the `env` block
- Run `npx brightspace-mcp serve` manually in a terminal and confirm it starts without crashing
- Run `brightspace-mcp doctor` to diagnose config, auth, and API connectivity in one step
