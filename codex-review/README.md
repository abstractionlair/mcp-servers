# Codex Review MCP Server

MCP server that provides access to GPT-5 Codex for methodology reviews during autonomous Claude Code sessions.

## Features

- **Tool**: `mcp__codex_review` - Request Codex methodology reviews
- Configurable reasoning effort (low/medium/high)
- Optional output file saving
- Handles API key management
- Full error reporting

## Installation

```bash
cd codex-review
npm install
npm run build
```

## Configuration

Add to `~/.config/claude-code/mcp.json`:

```json
{
  "mcpServers": {
    "codex": {
      "command": "node",
      "args": ["/Users/YOUR_USERNAME/mcp-servers/mcp-servers/codex-review/build/index.js"],
      "env": {
        "OPENAI_API_KEY": "sk-proj-..."
      }
    }
  }
}
```

**Alternative**: Load API key from existing `.env`:

```json
{
  "mcpServers": {
    "codex": {
      "command": "bash",
      "args": [
        "-c",
        "source ~/.env && node /Users/YOUR_USERNAME/mcp-servers/mcp-servers/codex-review/build/index.js"
      ]
    }
  }
}
```

## Usage in Claude Code

Once configured, Claude Code will have access to the `mcp__codex_review` tool:

```javascript
// Claude Code can call this automatically
mcp__codex_review({
  prompt: `# CODEX REVIEW REQUEST: Stage 1 SFT Training Gate

## Context
Reviewing Stage 1 SFT training plan...

## Request
GO / NO-GO for starting SFT training?`,
  reasoning_effort: "high",
  output_file: "reviews/autonomous/20251015_sft_gate.txt"
})
```

## Tool Parameters

- `prompt` (required): Review request text
- `reasoning_effort` (optional): "low" | "medium" | "high" (default: "high")
- `output_file` (optional): Path to save response
- `model` (optional): Codex model name (default: "gpt-5-codex")

## Requirements

- Node.js 18+
- `codex` CLI installed and in PATH
- OpenAI API key with Codex access

## Development

```bash
# Watch mode for development
npm run watch

# Build for production
npm run build
```

## License

MIT
