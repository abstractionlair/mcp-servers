# Enhanced Review MCP - Specification

**Status**: Draft  
**Created**: 2025-10-16  
**Purpose**: Enhance codex-review MCP to support multiple models and review types

## Current Limitations

The existing codex-review MCP:
- ✅ Calls GPT-5 Codex for reviews
- ✅ Saves output to files
- ❌ Can't switch to GPT-5 (non-Codex)
- ❌ No review type hints
- ❌ No automatic AGENTS.md loading

## Proposed Enhancement

### New Tool Parameters

```typescript
interface ReviewArgs {
  prompt: string;                              // Review request (required)
  model?: "gpt-5" | "gpt-5-codex";            // Which model (default: gpt-5-codex)
  review_type?: "code" | "spec" | "doc" | "contract";  // Review type hint
  reasoning_effort?: "low" | "medium" | "high";         // Reasoning level
  output_file?: string;                        // Optional save location
  agent_file?: string;                         // Optional agent instructions
}
```

### Behavioral Changes

1. **Model Selection**:
   - Default: `gpt-5-codex` (for backward compatibility)
   - Can specify: `gpt-5` for spec/doc reviews
   - Passes to `codex` CLI via `-m` flag

2. **Review Type**:
   - Optional hint about what's being reviewed
   - Could be used to:
     - Select appropriate checklist from AGENTS.md
     - Format response appropriately
     - Add context to prompt

3. **Agent File Loading**:
   - If `agent_file` specified, prepend its contents to prompt
   - Allows automatic loading of AGENTS.md
   - Default: No auto-loading (for backward compatibility)

### Example Usage

```javascript
// Code review (existing behavior)
codex_review({
  prompt: "Review this implementation...",
  model: "gpt-5-codex",
  review_type: "code"
})

// Spec review (new capability)
codex_review({
  prompt: "Review this specification...",
  model: "gpt-5",
  review_type: "spec",
  agent_file: "/path/to/AGENTS.md"
})

// Contract review
codex_review({
  prompt: "Verify behavioral contracts...",
  model: "gpt-5",
  review_type: "contract"
})
```

### Implementation Notes

**codex CLI supports**:
```bash
codex exec -m gpt-5           # Regular GPT-5
codex exec -m gpt-5-codex     # Codex variant
```

So the change is straightforward:
```typescript
const model = args.model || "gpt-5-codex";
const cliArgs = ["exec", "--full-auto", "-m", model, ...];
```

**Agent file loading**:
```typescript
let fullPrompt = args.prompt;
if (args.agent_file) {
  const agentInstructions = readFileSync(args.agent_file, 'utf-8');
  fullPrompt = `${agentInstructions}\n\n---\n\n${args.prompt}`;
}
```

## Behavioral Contracts

### MUST

- Support both `gpt-5` and `gpt-5-codex` models
- Default to `gpt-5-codex` for backward compatibility
- Accept optional `review_type` parameter
- Accept optional `agent_file` parameter
- Prepend agent file contents if provided
- Pass model selection to codex CLI correctly

### MUST NOT

- Change behavior for existing calls (backward compatible)
- Require review_type (it's optional)
- Fail if agent_file doesn't exist (just warn)
- Cache agent file contents (read each time)

### INVARIANTS

- Model selection is always passed to codex CLI
- Agent file is always prepended if provided
- Existing API continues to work unchanged

## Testing

### Contract Tests

```typescript
test("MUST support gpt-5 model", async () => {
  const result = await codex_review({
    prompt: "test",
    model: "gpt-5"
  });
  // Verify gpt-5 was used (check CLI args)
});

test("MUST default to gpt-5-codex", async () => {
  const result = await codex_review({
    prompt: "test"
    // No model specified
  });
  // Verify gpt-5-codex was used
});

test("MUST prepend agent_file if provided", async () => {
  const result = await codex_review({
    prompt: "test",
    agent_file: "/path/to/AGENTS.md"
  });
  // Verify AGENTS.md content was prepended
});
```

## Migration Path

**Phase 1**: Add new parameters (optional, backward compatible)
**Phase 2**: Update callers to use new parameters
**Phase 3**: Consider making review_type required (breaking change)

## Questions

1. Should review_type be required or optional?
   - Optional: More flexible, backward compatible
   - Required: Forces explicit declaration of what's being reviewed

2. Should we auto-detect review type from prompt content?
   - Probably not - explicit is better

3. Should agent_file path be relative to current directory or absolute?
   - Probably absolute for clarity
   - Could support both

## Status

**Next Steps**:
- [ ] Decide on spec details
- [ ] Get GPT-5 review of spec
- [ ] Implement in codex-review MCP
- [ ] Test with both models
- [ ] Update documentation
- [ ] Update callers in file-storage-backend workflow
