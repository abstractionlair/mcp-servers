#!/usr/bin/env node

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { spawn } from "child_process";
import { writeFileSync, mkdirSync } from "fs";
import { dirname } from "path";

interface CodexReviewArgs {
  prompt: string;
  reasoning_effort?: "low" | "medium" | "high";
  output_file?: string;
  model?: string;
}

class CodexMCPServer {
  private server: Server;
  private apiKey: string;

  constructor() {
    this.apiKey = process.env.OPENAI_API_KEY || "";

    if (!this.apiKey) {
      console.error("Warning: OPENAI_API_KEY not set in environment");
    }

    this.server = new Server(
      {
        name: "codex-review",
        version: "1.0.0",
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );

    this.setupHandlers();
  }

  private setupHandlers() {
    // List available tools
    this.server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: [
        {
          name: "codex_review",
          description: "Request a methodology review from GPT-5 Codex. Returns Codex's analysis and recommendations.",
          inputSchema: {
            type: "object",
            properties: {
              prompt: {
                type: "string",
                description: "The review request prompt. Should include context, current state, proposed approach, and specific questions.",
              },
              reasoning_effort: {
                type: "string",
                enum: ["low", "medium", "high"],
                description: "Reasoning effort level (default: high). Use 'high' for important methodology decisions.",
                default: "high",
              },
              output_file: {
                type: "string",
                description: "Optional: Path to save the review response. Parent directories will be created if needed.",
              },
              model: {
                type: "string",
                description: "Codex model to use (default: gpt-5-codex)",
                default: "gpt-5-codex",
              },
            },
            required: ["prompt"],
          },
        },
      ],
    }));

    // Handle tool calls
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      if (request.params.name === "codex_review") {
        const args = request.params.arguments as unknown as CodexReviewArgs;
        return await this.handleCodexReview(args);
      }
      throw new Error(`Unknown tool: ${request.params.name}`);
    });
  }

  private async handleCodexReview(args: CodexReviewArgs) {
    const {
      prompt,
      reasoning_effort = "high",
      output_file,
      model = "gpt-5-codex",
    } = args;

    if (!this.apiKey) {
      return {
        content: [
          {
            type: "text",
            text: "Error: OPENAI_API_KEY not set. Please configure the API key in your MCP server settings.",
          },
        ],
      };
    }

    try {
      // Call codex exec with the prompt
      const response = await this.callCodex(prompt, model, reasoning_effort);

      // Optionally save to file
      if (output_file) {
        mkdirSync(dirname(output_file), { recursive: true });
        writeFileSync(output_file, response, "utf-8");
      }

      return {
        content: [
          {
            type: "text",
            text: response,
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text",
            text: `Error calling Codex: ${error instanceof Error ? error.message : String(error)}`,
          },
        ],
        isError: true,
      };
    }
  }

  private async callCodex(
    prompt: string,
    model: string,
    reasoning_effort: string
  ): Promise<string> {
    return new Promise((resolve, reject) => {
      // Timeout protection: kill process if it hangs (per Codex review)
      const TIMEOUT_MS = 300000; // 5 minutes
      let timeoutId: NodeJS.Timeout | null = null;

      // Don't pass prompt as argv - use stdin instead to avoid:
      // 1. Exposing sensitive content in process list
      // 2. Hitting OS argv size limits (~128KB)
      const args = [
        "exec",
        "--full-auto",
        "-m",
        model,
        "-c",
        `model_reasoning_effort=${reasoning_effort}`, // Remove quotes per Codex review
      ];

      const codex = spawn("codex", args, {
        env: {
          ...process.env,
          OPENAI_API_KEY: this.apiKey,
        },
      });

      // Set timeout to kill hung processes
      timeoutId = setTimeout(() => {
        codex.kill("SIGTERM");
        reject(new Error(`Codex process timed out after ${TIMEOUT_MS}ms`));
      }, TIMEOUT_MS);

      // Write prompt to stdin instead of passing as argument
      codex.stdin.write(prompt);
      codex.stdin.end();

      let stdout = "";
      let stderr = "";

      codex.stdout.on("data", (data) => {
        stdout += data.toString();
      });

      codex.stderr.on("data", (data) => {
        stderr += data.toString();
      });

      codex.on("close", (code) => {
        if (timeoutId) clearTimeout(timeoutId);

        if (code === 0) {
          // Log stderr even on success for debugging (per Codex review)
          if (stderr) {
            console.error("Codex stderr:", stderr);
          }
          resolve(stdout);
        } else {
          reject(new Error(`Codex exited with code ${code}:\n${stderr}`));
        }
      });

      codex.on("error", (err) => {
        if (timeoutId) clearTimeout(timeoutId);
        reject(new Error(`Failed to spawn codex: ${err.message}`));
      });
    });
  }

  async run() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error("Codex MCP server running on stdio");
  }
}

const server = new CodexMCPServer();
server.run().catch(console.error);
