import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { homedir } from "node:os";
import { basename, join } from "node:path";

import type { ToolDefinition } from "@mariozechner/pi-coding-agent";
import { Type } from "@sinclair/typebox";

const MEMORY_DIR = join(homedir(), ".zenthor", "memory");

function ensureMemoryDir(): void {
  if (!existsSync(MEMORY_DIR)) {
    mkdirSync(MEMORY_DIR, { recursive: true });
  }
}

function topicPath(topic: string): string {
  const safe = topic
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  return join(MEMORY_DIR, `${safe}.md`);
}

function textResult(text: string) {
  return {
    content: [{ type: "text" as const, text }],
    details: undefined,
  };
}

function errorResult(message: string) {
  return {
    content: [{ type: "text" as const, text: `memory error: ${message}` }],
    details: undefined,
  };
}

const params = Type.Object({
  action: Type.Union(
    [
      Type.Literal("save"),
      Type.Literal("recall"),
      Type.Literal("list"),
      Type.Literal("search"),
      Type.Literal("delete"),
    ],
    { description: "Memory action to perform" },
  ),
  topic: Type.Optional(
    Type.String({ description: "Memory topic name (e.g., 'preferences', 'project-notes')" }),
  ),
  content: Type.Optional(Type.String({ description: "Content to save (for save action)" })),
  query: Type.Optional(Type.String({ description: "Search query (for search action)" })),
  mode: Type.Optional(
    Type.Union([Type.Literal("overwrite"), Type.Literal("append")], {
      description:
        "Save mode: 'overwrite' replaces content, 'append' adds to existing (default: overwrite)",
    }),
  ),
});

export const memoryTool: ToolDefinition<typeof params> = {
  name: "memory",
  label: "Memory",
  description: [
    "Persistent memory that survives across sessions. Use this to remember important information.",
    "",
    "Actions:",
    "- save: Save content to a topic (topic + content required, mode: overwrite|append)",
    "- recall: Read a specific memory topic (topic required)",
    "- list: List all saved memory topics with previews",
    "- search: Search across all memories for a keyword (query required)",
    "- delete: Remove a memory topic (topic required)",
    "",
    "Use descriptive topic names: 'preferences', 'project-notes', 'todoist-filters', 'contacts'.",
  ].join("\n"),
  parameters: params,

  async execute(_toolCallId, args) {
    ensureMemoryDir();

    switch (args.action) {
      case "save": {
        if (!args.topic) return errorResult("topic is required for save");
        if (!args.content) return errorResult("content is required for save");

        const filePath = topicPath(args.topic);
        const mode = args.mode ?? "overwrite";

        if (mode === "append" && existsSync(filePath)) {
          const existing = readFileSync(filePath, "utf-8");
          writeFileSync(filePath, `${existing}\n\n${args.content}`, "utf-8");
        } else {
          writeFileSync(filePath, args.content, "utf-8");
        }

        return textResult(`Saved to memory topic '${args.topic}'.`);
      }

      case "recall": {
        if (!args.topic) return errorResult("topic is required for recall");

        const filePath = topicPath(args.topic);
        if (!existsSync(filePath)) {
          return textResult(`No memory found for topic '${args.topic}'.`);
        }

        const content = readFileSync(filePath, "utf-8");
        return textResult(`## ${args.topic}\n\n${content}`);
      }

      case "list": {
        const files = readdirSync(MEMORY_DIR).filter((f) => f.endsWith(".md"));
        if (files.length === 0) {
          return textResult("No memories saved yet.");
        }

        const topics = files.map((f) => {
          const name = basename(f, ".md");
          const content = readFileSync(join(MEMORY_DIR, f), "utf-8");
          const firstLine = content.split("\n").find((l) => l.trim().length > 0) ?? "";
          return `- **${name}**: ${firstLine.slice(0, 100)}`;
        });

        return textResult(`${files.length} memory topic(s):\n\n${topics.join("\n")}`);
      }

      case "search": {
        if (!args.query) return errorResult("query is required for search");

        const files = readdirSync(MEMORY_DIR).filter((f) => f.endsWith(".md"));
        const query = args.query.toLowerCase();
        const matches: string[] = [];

        for (const f of files) {
          const content = readFileSync(join(MEMORY_DIR, f), "utf-8");
          if (content.toLowerCase().includes(query)) {
            const name = basename(f, ".md");
            const matchingLines = content
              .split("\n")
              .filter((line) => line.toLowerCase().includes(query))
              .slice(0, 3)
              .map((line) => `  > ${line.trim()}`);
            matches.push(`**${name}:**\n${matchingLines.join("\n")}`);
          }
        }

        if (matches.length === 0) {
          return textResult(`No memories matching '${args.query}'.`);
        }

        return textResult(
          `Found matches in ${matches.length} topic(s):\n\n${matches.join("\n\n")}`,
        );
      }

      case "delete": {
        if (!args.topic) return errorResult("topic is required for delete");

        const filePath = topicPath(args.topic);
        if (!existsSync(filePath)) {
          return textResult(`No memory found for topic '${args.topic}'.`);
        }

        unlinkSync(filePath);
        return textResult(`Deleted memory topic '${args.topic}'.`);
      }

      default:
        return errorResult(`Unknown action: ${args.action}`);
    }
  },
};
