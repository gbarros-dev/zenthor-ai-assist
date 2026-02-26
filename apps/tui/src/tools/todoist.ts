import type { ToolDefinition } from "@mariozechner/pi-coding-agent";
import { Type } from "@sinclair/typebox";

const BASE_URL = "https://api.todoist.com/api/v1";
const TIMEOUT_MS = 15_000;

function getApiToken(): string | undefined {
  return process.env.TODOIST_API_TOKEN?.trim() || undefined;
}

function headers(token: string): Record<string, string> {
  return {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  };
}

function noTokenResult() {
  return {
    content: [
      {
        type: "text" as const,
        text: [
          "Todoist integration requires an API token.",
          "",
          "To set it up:",
          "1. Go to https://todoist.com/help/articles/find-your-api-token-938fac5",
          "2. Copy your API token",
          "3. Add TODOIST_API_TOKEN=your-token to apps/tui/.env.local",
          "4. Restart the TUI",
        ].join("\n"),
      },
    ],
    details: undefined,
  };
}

function errorResult(message: string) {
  return {
    content: [{ type: "text" as const, text: `todoist error: ${message}` }],
    details: undefined,
  };
}

async function todoistFetch(
  token: string,
  method: string,
  path: string,
  body?: Record<string, unknown>,
  signal?: AbortSignal,
): Promise<{ ok: boolean; status: number; data?: unknown; error?: string }> {
  try {
    const response = await fetch(`${BASE_URL}${path}`, {
      method,
      headers: headers(token),
      body: body ? JSON.stringify(body) : undefined,
      signal: signal ?? AbortSignal.timeout(TIMEOUT_MS),
    });

    if (response.status === 204) {
      return { ok: true, status: 204 };
    }

    if (!response.ok) {
      const errorText = await response.text();
      return { ok: false, status: response.status, error: errorText.slice(0, 300) };
    }

    const data = await response.json();
    return { ok: true, status: response.status, data };
  } catch (err) {
    return { ok: false, status: 0, error: err instanceof Error ? err.message : String(err) };
  }
}

// --- Formatting helpers ---

interface TodoistTask {
  id: string;
  content: string;
  description: string;
  project_id: string;
  labels: string[];
  priority: number;
  due: { string: string; date: string; is_recurring: boolean; datetime?: string } | null;
  checked: boolean;
}

interface TodoistProject {
  id: string;
  name: string;
  is_favorite: boolean;
  color: string;
}

interface TodoistListResponse<T> {
  results: T[];
}

// API priority 4 = UI P1 (urgent), API 1 = UI P4 (no priority)
function formatPriority(apiPriority: number): string {
  const uiPriority = 5 - apiPriority;
  if (uiPriority === 1) return "P1 (urgent)";
  if (uiPriority === 2) return "P2 (high)";
  if (uiPriority === 3) return "P3 (medium)";
  return "P4";
}

function formatTask(t: TodoistTask): string {
  const parts = [`- [${t.id}] ${t.content}`];
  if (t.due)
    parts.push(`  Due: ${t.due.string || t.due.date}${t.due.is_recurring ? " (recurring)" : ""}`);
  if (t.priority > 1) parts.push(`  Priority: ${formatPriority(t.priority)}`);
  if (t.labels.length > 0) parts.push(`  Labels: ${t.labels.join(", ")}`);
  if (t.description) parts.push(`  Description: ${t.description.slice(0, 100)}`);
  return parts.join("\n");
}

function formatProject(p: TodoistProject): string {
  const suffix = p.is_favorite ? " (favorite)" : "";
  return `- [${p.id}] ${p.name}${suffix}`;
}

// --- Tool: todoist ---

const params = Type.Object({
  action: Type.Union(
    [
      Type.Literal("create_task"),
      Type.Literal("list_tasks"),
      Type.Literal("get_task"),
      Type.Literal("update_task"),
      Type.Literal("complete_task"),
      Type.Literal("reopen_task"),
      Type.Literal("delete_task"),
      Type.Literal("list_projects"),
      Type.Literal("list_labels"),
    ],
    { description: "The Todoist action to perform" },
  ),
  // create / update fields
  content: Type.Optional(Type.String({ description: "Task text (required for create_task)" })),
  description: Type.Optional(Type.String({ description: "Extended task description" })),
  project_id: Type.Optional(Type.String({ description: "Project ID" })),
  labels: Type.Optional(Type.Array(Type.String(), { description: "Label names" })),
  priority: Type.Optional(
    Type.Number({
      description: "Priority: 1 (urgent/P1) to 4 (no priority/P4). Maps to Todoist UI priorities.",
    }),
  ),
  due_string: Type.Optional(
    Type.String({
      description: 'Natural language due date, e.g. "tomorrow at 3pm", "every monday"',
    }),
  ),
  due_date: Type.Optional(Type.String({ description: "Due date in YYYY-MM-DD format" })),
  // get / update / complete / delete
  task_id: Type.Optional(
    Type.String({ description: "Task ID (required for get/update/complete/reopen/delete)" }),
  ),
  // list_tasks filter
  filter: Type.Optional(
    Type.String({
      description: 'Todoist filter expression, e.g. "today", "overdue", "p1", "#Work"',
    }),
  ),
});

function mapUiPriorityToApi(uiPriority: number): number {
  // User says P1 (urgent) = 1, we send API priority 4
  return Math.max(1, Math.min(4, 5 - uiPriority));
}

export const todoistTool: ToolDefinition<typeof params> = {
  name: "todoist",
  label: "Todoist",
  description: [
    "Manage tasks and projects in Todoist. Available actions:",
    "- create_task: Create a new task (content required, optional: description, due_string, due_date, priority 1-4, project_id, labels)",
    "- list_tasks: List active tasks (optional: filter, project_id)",
    "- get_task: Get task details (task_id required)",
    "- update_task: Update a task (task_id required, plus fields to update)",
    "- complete_task: Mark task as done (task_id required)",
    "- reopen_task: Reopen a completed task (task_id required)",
    "- delete_task: Delete a task (task_id required)",
    "- list_projects: List all projects",
    "- list_labels: List all labels",
    "",
    "Priority mapping: 1 = P1 urgent, 2 = P2 high, 3 = P3 medium, 4 = P4 no priority.",
    "Due dates accept natural language: 'tomorrow', 'next friday at 2pm', 'every monday'.",
  ].join("\n"),
  parameters: params,

  async execute(_toolCallId, args, signal) {
    const token = getApiToken();
    if (!token) return noTokenResult();

    switch (args.action) {
      case "create_task": {
        if (!args.content) {
          return errorResult("content is required for create_task");
        }
        const body: Record<string, unknown> = { content: args.content };
        if (args.description) body.description = args.description;
        if (args.project_id) body.project_id = args.project_id;
        if (args.labels) body.labels = args.labels;
        if (args.priority) body.priority = mapUiPriorityToApi(args.priority);
        if (args.due_string) body.due_string = args.due_string;
        else if (args.due_date) body.due_date = args.due_date;

        const result = await todoistFetch(token, "POST", "/tasks", body, signal);
        if (!result.ok) return errorResult(`Failed to create task: ${result.error}`);

        const task = result.data as TodoistTask;
        return {
          content: [{ type: "text", text: `Task created:\n${formatTask(task)}` }],
          details: undefined,
        };
      }

      case "list_tasks": {
        const searchParams = new URLSearchParams();
        if (args.filter) searchParams.set("filter", args.filter);
        else if (args.project_id) searchParams.set("project_id", args.project_id);

        const query = searchParams.toString();
        const path = query ? `/tasks?${query}` : "/tasks";
        const result = await todoistFetch(token, "GET", path, undefined, signal);
        if (!result.ok) return errorResult(`Failed to list tasks: ${result.error}`);

        const data = result.data as TodoistListResponse<TodoistTask> | TodoistTask[];
        const tasks = Array.isArray(data) ? data : data.results;
        if (tasks.length === 0) {
          return {
            content: [{ type: "text", text: "No tasks found." }],
            details: undefined,
          };
        }

        const formatted = tasks.map(formatTask).join("\n\n");
        return {
          content: [{ type: "text", text: `${tasks.length} task(s):\n\n${formatted}` }],
          details: undefined,
        };
      }

      case "get_task": {
        if (!args.task_id) return errorResult("task_id is required for get_task");

        const result = await todoistFetch(
          token,
          "GET",
          `/tasks/${args.task_id}`,
          undefined,
          signal,
        );
        if (!result.ok) return errorResult(`Failed to get task: ${result.error}`);

        const task = result.data as TodoistTask;
        return {
          content: [{ type: "text", text: formatTask(task) }],
          details: undefined,
        };
      }

      case "update_task": {
        if (!args.task_id) return errorResult("task_id is required for update_task");

        const body: Record<string, unknown> = {};
        if (args.content) body.content = args.content;
        if (args.description) body.description = args.description;
        if (args.labels) body.labels = args.labels;
        if (args.priority) body.priority = mapUiPriorityToApi(args.priority);
        if (args.due_string) body.due_string = args.due_string;
        else if (args.due_date) body.due_date = args.due_date;

        if (Object.keys(body).length === 0) {
          return errorResult(
            "No fields to update. Provide content, description, labels, priority, or due_string.",
          );
        }

        const result = await todoistFetch(token, "POST", `/tasks/${args.task_id}`, body, signal);
        if (!result.ok) return errorResult(`Failed to update task: ${result.error}`);

        const task = result.data as TodoistTask;
        return {
          content: [{ type: "text", text: `Task updated:\n${formatTask(task)}` }],
          details: undefined,
        };
      }

      case "complete_task": {
        if (!args.task_id) return errorResult("task_id is required for complete_task");

        const result = await todoistFetch(
          token,
          "POST",
          `/tasks/${args.task_id}/close`,
          undefined,
          signal,
        );
        if (!result.ok) return errorResult(`Failed to complete task: ${result.error}`);

        return {
          content: [{ type: "text", text: `Task ${args.task_id} marked as complete.` }],
          details: undefined,
        };
      }

      case "reopen_task": {
        if (!args.task_id) return errorResult("task_id is required for reopen_task");

        const result = await todoistFetch(
          token,
          "POST",
          `/tasks/${args.task_id}/reopen`,
          undefined,
          signal,
        );
        if (!result.ok) return errorResult(`Failed to reopen task: ${result.error}`);

        return {
          content: [{ type: "text", text: `Task ${args.task_id} reopened.` }],
          details: undefined,
        };
      }

      case "delete_task": {
        if (!args.task_id) return errorResult("task_id is required for delete_task");

        const result = await todoistFetch(
          token,
          "DELETE",
          `/tasks/${args.task_id}`,
          undefined,
          signal,
        );
        if (!result.ok) return errorResult(`Failed to delete task: ${result.error}`);

        return {
          content: [{ type: "text", text: `Task ${args.task_id} deleted.` }],
          details: undefined,
        };
      }

      case "list_projects": {
        const result = await todoistFetch(token, "GET", "/projects", undefined, signal);
        if (!result.ok) return errorResult(`Failed to list projects: ${result.error}`);

        const projData = result.data as TodoistListResponse<TodoistProject> | TodoistProject[];
        const projects = Array.isArray(projData) ? projData : projData.results;
        const formatted = projects.map(formatProject).join("\n");
        return {
          content: [{ type: "text", text: `${projects.length} project(s):\n\n${formatted}` }],
          details: undefined,
        };
      }

      case "list_labels": {
        const result = await todoistFetch(token, "GET", "/labels", undefined, signal);
        if (!result.ok) return errorResult(`Failed to list labels: ${result.error}`);

        const labelData = result.data as
          | TodoistListResponse<{ id: string; name: string; color: string }>
          | Array<{ id: string; name: string; color: string }>;
        const labels = Array.isArray(labelData) ? labelData : labelData.results;
        if (labels.length === 0) {
          return {
            content: [{ type: "text", text: "No labels found." }],
            details: undefined,
          };
        }

        const formatted = labels.map((l) => `- [${l.id}] ${l.name}`).join("\n");
        return {
          content: [{ type: "text", text: `${labels.length} label(s):\n\n${formatted}` }],
          details: undefined,
        };
      }

      default:
        return errorResult(`Unknown action: ${args.action}`);
    }
  },
};
