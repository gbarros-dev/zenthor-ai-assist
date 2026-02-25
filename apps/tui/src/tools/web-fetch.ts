import { Type } from "@sinclair/typebox";
import type { ToolDefinition } from "@mariozechner/pi-coding-agent";

const MAX_CONTENT_CHARS = 50_000;
const MAX_RESPONSE_BYTES = 2_000_000;
const MAX_REDIRECTS = 5;

const USER_AGENT =
  "Mozilla/5.0 (compatible; ZenthorBot/1.0; +https://github.com/zenthor-hub)";

const params = Type.Object({
  url: Type.String({ description: "The URL to fetch" }),
  maxChars: Type.Optional(
    Type.Number({
      description: "Maximum characters to return (default: 50000)",
    }),
  ),
  raw: Type.Optional(
    Type.Boolean({
      description: "Return raw HTML instead of extracted readable content (default: false)",
    }),
  ),
});

async function fetchWithRedirects(
  url: string,
  signal: AbortSignal | undefined,
): Promise<Response> {
  let currentUrl = url;
  for (let i = 0; i < MAX_REDIRECTS; i++) {
    const response = await fetch(currentUrl, {
      headers: { "User-Agent": USER_AGENT, Accept: "text/html, application/json, text/plain, */*" },
      redirect: "manual",
      signal,
    });

    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");
      if (!location) throw new Error(`Redirect ${response.status} without Location header`);
      currentUrl = new URL(location, currentUrl).href;
      continue;
    }

    return response;
  }
  throw new Error(`Too many redirects (max ${MAX_REDIRECTS})`);
}

function extractReadableContent(html: string, _url: string): string {
  // Dynamic imports to avoid top-level load cost
  const { parseHTML } = require("linkedom");
  const { Readability } = require("@mozilla/readability");

  const { document } = parseHTML(html);
  const reader = new Readability(document, { charThreshold: 50 });
  const article = reader.parse();

  if (!article?.textContent) {
    return html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  }

  const parts: string[] = [];
  if (article.title) parts.push(`# ${article.title}\n`);
  if (article.byline) parts.push(`*${article.byline}*\n`);
  parts.push(article.textContent.trim());

  return parts.join("\n");
}

export const webFetchTool: ToolDefinition<typeof params> = {
  name: "web_fetch",
  label: "Web Fetch",
  description:
    "Fetch a web page and extract its readable content. Returns clean text by default, or raw HTML with raw=true. Useful for reading documentation, articles, and web pages.",
  parameters: params,

  async execute(_toolCallId, args, signal) {
    const maxChars = args.maxChars ?? MAX_CONTENT_CHARS;

    try {
      const url = args.url.startsWith("http") ? args.url : `https://${args.url}`;
      new URL(url); // validate

      const response = await fetchWithRedirects(url, signal);

      if (!response.ok) {
        return {
          content: [{ type: "text", text: `HTTP ${response.status} ${response.statusText} for ${url}` }],
          details: undefined,
        };
      }

      const contentType = response.headers.get("content-type") ?? "";
      const contentLength = parseInt(response.headers.get("content-length") ?? "0", 10);

      if (contentLength > MAX_RESPONSE_BYTES) {
        return {
          content: [
            {
              type: "text",
              text: `Response too large: ${contentLength} bytes (max ${MAX_RESPONSE_BYTES}). Try a more specific URL.`,
            },
          ],
          details: undefined,
        };
      }

      const body = await response.text();

      // JSON — return as-is (truncated)
      if (contentType.includes("application/json")) {
        return {
          content: [{ type: "text", text: body.slice(0, maxChars) }],
          details: undefined,
        };
      }

      // Plain text
      if (contentType.includes("text/plain")) {
        return {
          content: [{ type: "text", text: body.slice(0, maxChars) }],
          details: undefined,
        };
      }

      // HTML — extract readable content unless raw requested
      if (args.raw) {
        return {
          content: [{ type: "text", text: body.slice(0, maxChars) }],
          details: undefined,
        };
      }

      const readable = extractReadableContent(body, url);
      return {
        content: [{ type: "text", text: readable.slice(0, maxChars) }],
        details: undefined,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return {
        content: [{ type: "text", text: `web_fetch error: ${message}` }],
        details: undefined,
      };
    }
  },
};
