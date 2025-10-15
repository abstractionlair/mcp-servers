# MCP Servers Collection

A collection of Model Context Protocol (MCP) servers for Claude Code.

## Available Servers

### codex-review
Request methodology reviews from GPT-5 Codex during autonomous work.

**Tool**: `mcp__codex_review`

**Installation**:
```bash
cd codex-review
npm install
npm run build
```

**Configuration** (`~/.config/claude-code/mcp.json`):
```json
{
  "mcpServers": {
    "codex": {
      "command": "node",
      "args": ["/Users/YOUR_USERNAME/mcp-servers/mcp-servers/codex-review/build/index.js"],
      "env": {
        "OPENAI_API_KEY": "your-api-key-here"
      }
    }
  }
}
```

## Development

Each server is in its own subdirectory with:
- `package.json` - Dependencies and scripts
- `src/index.ts` - MCP server implementation
- `tsconfig.json` - TypeScript configuration
- `README.md` - Server-specific documentation

## License

MIT
