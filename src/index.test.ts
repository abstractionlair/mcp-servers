import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { EventEmitter } from "events";
import { CodexMCPServer } from "./index.js";

vi.mock("child_process", () => ({
  spawn: vi.fn(),
}));

import { spawn as mockedSpawn } from "child_process";

describe("codex_review tool contract", () => {
  let server: CodexMCPServer;
  let mockCodexProc: EventEmitter & { stdin: EventEmitter; stdout: EventEmitter; stderr: EventEmitter };

  beforeEach(() => {
    process.env.OPENAI_API_KEY = "sk-test-key";
    vi.mocked(mockedSpawn).mockReset();

    mockCodexProc = new EventEmitter() as EventEmitter & { stdin: EventEmitter & { write: ReturnType<typeof vi.fn>; end: ReturnType<typeof vi.fn>; on: EventEmitter["on"] }; stdout: EventEmitter; stderr: EventEmitter };
    mockCodexProc.stdin = Object.assign(new EventEmitter(), { write: vi.fn(), end: vi.fn() });
    mockCodexProc.stdout = new EventEmitter();
    mockCodexProc.stderr = new EventEmitter();
    (mockCodexProc as any).kill = vi.fn();

    vi.mocked(mockedSpawn).mockReturnValue(mockCodexProc as any);
  });

  afterEach(() => {
    delete process.env.OPENAI_API_KEY;
    vi.restoreAllMocks();
  });

  it("registers the codex_review tool with correct schema", async () => {
    server = new CodexMCPServer();

    const internalServer = (server as any).server;
    const handlers = internalServer._requestHandlers;

    const listToolsHandler = handlers.get("tools/list");
    expect(listToolsHandler).toBeDefined();

    const result = await listToolsHandler({ method: "tools/list" } as any, {} as any);
    expect(result.tools).toHaveLength(1);

    const tool = result.tools[0];
    expect(tool.name).toBe("codex_review");
    expect(tool.inputSchema.required).toContain("prompt");
    expect(tool.inputSchema.properties.reasoning_effort.enum).toEqual(["low", "medium", "high"]);
    expect(tool.inputSchema.properties.output_file.type).toBe("string");
    expect(tool.inputSchema.properties.model.type).toBe("string");
  });

  it("validates params and returns expected response shape", async () => {
    server = new CodexMCPServer();

    const internalServer = (server as any).server;
    const handlers = internalServer._requestHandlers;
    const callToolHandler = handlers.get("tools/call");
    expect(callToolHandler).toBeDefined();

    const fakeResponse = "APPROVED: No blocking issues found\n\nReview looks good.";

    setImmediate(() => {
      mockCodexProc.stdout.emit("data", Buffer.from(fakeResponse));
      mockCodexProc.emit("close", 0);
    });

    const result = await callToolHandler(
      { method: "tools/call", params: { name: "codex_review", arguments: { prompt: "test prompt" } } } as any,
      {} as any
    );

    expect(result.content).toHaveLength(1);
    expect(result.content[0].type).toBe("text");
    expect(result.content[0].text).toBe(fakeResponse);
    expect(result.isError).toBeUndefined();

    expect(mockedSpawn).toHaveBeenCalledWith(
      "codex",
      ["exec", "--full-auto", "-m", "gpt-5-codex", "-c", "model_reasoning_effort=high"],
      expect.objectContaining({
        env: expect.objectContaining({
          OPENAI_API_KEY: "sk-test-key",
        }),
      })
    );
  });

  it("returns error shape when codex fails", async () => {
    server = new CodexMCPServer();

    const internalServer = (server as any).server;
    const handlers = internalServer._requestHandlers;
    const callToolHandler = handlers.get("tools/call");

    setImmediate(() => {
      mockCodexProc.stderr.emit("data", Buffer.from("API key invalid"));
      mockCodexProc.emit("close", 1);
    });

    const result = await callToolHandler(
      { method: "tools/call", params: { name: "codex_review", arguments: { prompt: "test prompt" } } } as any,
      {} as any
    );

    expect(result.isError).toBe(true);
    expect(result.content).toHaveLength(1);
    expect(result.content[0].type).toBe("text");
    expect(result.content[0].text).toContain("Error calling Codex");
  });
});
