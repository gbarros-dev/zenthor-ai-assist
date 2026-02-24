/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as agent from "../agent.js";
import type * as agentInternal from "../agentInternal.js";
import type * as agentStatus from "../agentStatus.js";
import type * as agentWorker from "../agentWorker.js";
import type * as auth from "../auth.js";
import type * as conversations from "../conversations.js";
import type * as http from "../http.js";
import type * as messages from "../messages.js";
import type * as noteFolders from "../noteFolders.js";
import type * as notes from "../notes.js";
import type * as schemas_agent_queue from "../schemas/agent_queue.js";
import type * as schemas_conversations from "../schemas/conversations.js";
import type * as schemas_messages from "../schemas/messages.js";
import type * as schemas_note_folders from "../schemas/note_folders.js";
import type * as schemas_notes from "../schemas/notes.js";
import type * as schemas_organization_members from "../schemas/organization_members.js";
import type * as schemas_organizations from "../schemas/organizations.js";
import type * as schemas_users from "../schemas/users.js";
import type * as types_auth from "../types/auth.js";
import type * as users from "../users.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  agent: typeof agent;
  agentInternal: typeof agentInternal;
  agentStatus: typeof agentStatus;
  agentWorker: typeof agentWorker;
  auth: typeof auth;
  conversations: typeof conversations;
  http: typeof http;
  messages: typeof messages;
  noteFolders: typeof noteFolders;
  notes: typeof notes;
  "schemas/agent_queue": typeof schemas_agent_queue;
  "schemas/conversations": typeof schemas_conversations;
  "schemas/messages": typeof schemas_messages;
  "schemas/note_folders": typeof schemas_note_folders;
  "schemas/notes": typeof schemas_notes;
  "schemas/organization_members": typeof schemas_organization_members;
  "schemas/organizations": typeof schemas_organizations;
  "schemas/users": typeof schemas_users;
  "types/auth": typeof types_auth;
  users: typeof users;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {};
