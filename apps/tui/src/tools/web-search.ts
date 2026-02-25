import { Type } from "@sinclair/typebox";
import type { ToolDefinition } from "@mariozechner/pi-coding-agent";

const DEFAULT_MAX_RESULTS = 5;
const MAX_RESULTS_CAP = 20;
const TIMEOUT_MS = 15_000;

const params = Type.Object({
  query: Type.String({ description: "The search query" }),
  maxResults: Type.Optional(
    Type.Number({
      description: "Maximum number of results to return (default: 5, max: 20)",
    }),
  ),
  offset: Type.Optional(
    Type.Number({ description: "Result offset for pagination (default: 0)" }),
  ),
});

interface BraveSearchResult {
  title: string;
  url: string;
  description: string;
}

interface BraveWebResults {
  web?: {
    results?: Array<{
      title?: string;
      url?: string;
      description?: string;
    }>;
  };
  query?: {
    altered?: string;
    original?: string;
  };
}

function getApiKey(): string | undefined {
  return process.env.BRAVE_API_KEY?.trim() || undefined;
}

function formatResults(results: BraveSearchResult[], query: string, altered?: string): string {
  const lines: string[] = [];

  if (altered) {
    lines.push(`[Showing results for: "${altered}"]\n`);
  }

  if (results.length === 0) {
    lines.push(`No results found for "${query}".`);
    return lines.join("\n");
  }

  for (const [i, r] of results.entries()) {
    lines.push(`${i + 1}. ${r.title}`);
    lines.push(`   ${r.url}`);
    if (r.description) {
      lines.push(`   ${r.description}`);
    }
    lines.push("");
  }

  return lines.join("\n").trim();
}

export const webSearchTool: ToolDefinition<typeof params> = {
  name: "web_search",
  label: "Web Search",
  description:
    "Search the web using Brave Search API. Returns titles, URLs, and descriptions. Requires BRAVE_API_KEY env var. Use web_fetch to read the full content of any result URL.",
  parameters: params,

  async execute(_toolCallId, args, signal) {
    const apiKey = getApiKey();

    if (!apiKey) {
      return {
        content: [
          {
            type: "text",
            text: [
              "web_search requires a Brave Search API key.",
              "",
              "To set it up:",
              "1. Get a free API key at https://brave.com/search/api/ (2,000 queries/month free)",
              '2. Add BRAVE_API_KEY=your-key to apps/tui/.env.local (or export it)',
              "3. Restart the TUI",
              "",
              "In the meantime, you can use web_fetch to read specific URLs directly.",
            ].join("\n"),
          },
        ],
        details: undefined,
      };
    }

    try {
      const count = Math.min(args.maxResults ?? DEFAULT_MAX_RESULTS, MAX_RESULTS_CAP);
      const offset = args.offset ?? 0;

      const searchParams = new URLSearchParams({
        q: args.query,
        count: String(count),
        offset: String(offset),
        text_decorations: "false",
        search_lang: "en",
      });

      const response = await fetch(
        `https://api.search.brave.com/res/v1/web/search?${searchParams}`,
        {
          headers: {
            Accept: "application/json",
            "Accept-Encoding": "gzip",
            "X-Subscription-Token": apiKey,
          },
          signal: signal ?? AbortSignal.timeout(TIMEOUT_MS),
        },
      );

      if (!response.ok) {
        const errorText = await response.text();
        return {
          content: [
            {
              type: "text",
              text: `Brave Search API error: HTTP ${response.status} — ${errorText.slice(0, 200)}`,
            },
          ],
          details: undefined,
        };
      }

      const data = (await response.json()) as BraveWebResults;

      const rawResults = data.web?.results ?? [];
      const results: BraveSearchResult[] = [];
      for (const r of rawResults) {
        if (r && r.title && r.url) {
          results.push({ title: r.title, url: r.url, description: r.description ?? "" });
        }
      }

      const formatted = formatResults(results, args.query, data.query?.altered);

      return {
        content: [{ type: "text", text: formatted }],
        details: undefined,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return {
        content: [{ type: "text", text: `web_search error: ${message}` }],
        details: undefined,
      };
    }
  },
};
