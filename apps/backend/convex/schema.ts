import { defineSchema } from "convex/server";

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
});
