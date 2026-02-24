import { defineSchema } from "convex/server";

import { agentQueueTable } from "./schemas/agent_queue";
import { conversationsTable } from "./schemas/conversations";
import { messagesTable } from "./schemas/messages";
import { noteFoldersTable } from "./schemas/note_folders";
import { notesTable } from "./schemas/notes";
import { organizationMembersTable } from "./schemas/organization_members";
import { organizationsTable } from "./schemas/organizations";
import { usersTable } from "./schemas/users";

export default defineSchema({
  users: usersTable,

  organizations: organizationsTable,
  organization_members: organizationMembersTable,

  notes: notesTable,
  noteFolders: noteFoldersTable,

  conversations: conversationsTable,
  messages: messagesTable,
  agentQueue: agentQueueTable,
});
