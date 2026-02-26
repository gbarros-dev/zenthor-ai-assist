import type { Static, TSchema } from "@sinclair/typebox";

/**
 * Tool result returned by all custom tools.
 * Structurally compatible with both pi-coding-agent ToolDefinition
 * and pi-agent-core AgentTool result types.
 */
export interface ToolResult {
  content: Array<{ type: "text"; text: string }>;
  details: undefined;
}

/**
 * Custom tool interface compatible with both:
 * - ToolDefinition from @mariozechner/pi-coding-agent (TUI)
 * - AgentTool from @mariozechner/pi-agent-core (agent-worker)
 *
 * The optional `onUpdate` param in AgentTool is simply omitted here;
 * since it's optional in AgentTool, our execute signature is assignable to it.
 */
export interface CustomTool<TParameters extends TSchema = TSchema> {
  name: string;
  label: string;
  description: string;
  parameters: TParameters;
  execute: (
    toolCallId: string,
    args: Static<TParameters>,
    signal?: AbortSignal,
  ) => Promise<ToolResult>;
}
