"use client";

import { api } from "@zenthor-ai-assist/backend/convex/_generated/api";
import type { Id } from "@zenthor-ai-assist/backend/convex/_generated/dataModel";
import { useMutation, useQuery } from "convex/react";
import { T } from "gt-next";
import { Loader2 } from "lucide-react";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

import { PageWrapper } from "@/components/page-wrapper";

export default function NoteEditorPage() {
  const params = useParams<{ noteId: string }>();
  const noteId = params.noteId as Id<"notes">;

  const note = useQuery(api.notes.get, { id: noteId });
  const updateNote = useMutation(api.notes.update);

  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [saving, setSaving] = useState(false);
  const initialized = useRef(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Initialize local state from note data
  useEffect(() => {
    if (note && !initialized.current) {
      setTitle(note.title ?? "");
      setContent(note.content ?? "");
      initialized.current = true;
    }
  }, [note]);

  // Reset initialization when noteId changes
  useEffect(() => {
    initialized.current = false;
  }, [noteId]);

  const save = useCallback(
    async (fields: { title?: string; content?: string }) => {
      setSaving(true);
      try {
        await updateNote({ id: noteId, ...fields });
      } finally {
        setSaving(false);
      }
    },
    [updateNote, noteId],
  );

  const debouncedSave = useCallback(
    (fields: { title?: string; content?: string }) => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(() => {
        void save(fields);
      }, 800);
    },
    [save],
  );

  function handleTitleChange(newTitle: string) {
    setTitle(newTitle);
    debouncedSave({ title: newTitle });
  }

  function handleContentChange(newContent: string) {
    setContent(newContent);
    debouncedSave({ content: newContent });
  }

  if (note === undefined) {
    return (
      <PageWrapper title={<T>Loading…</T>}>
        <div className="flex items-center justify-center py-20">
          <Loader2 className="text-muted-foreground size-6 animate-spin" />
        </div>
      </PageWrapper>
    );
  }

  if (note === null) {
    return (
      <PageWrapper title={<T>Note not found</T>}>
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <h2 className="text-foreground text-lg font-semibold">
            <T>Note not found</T>
          </h2>
          <p className="text-muted-foreground mt-2 text-sm">
            <T>This note may have been deleted or you don&apos;t have access to it.</T>
          </p>
        </div>
      </PageWrapper>
    );
  }

  return (
    <PageWrapper
      title={title || "Untitled"}
      actions={
        saving ? (
          <span className="text-muted-foreground flex items-center gap-1.5 text-xs">
            <Loader2 className="size-3 animate-spin" />
            <T>Saving…</T>
          </span>
        ) : (
          <span className="text-muted-foreground text-xs">
            <T>Saved</T>
          </span>
        )
      }
      fillHeight
    >
      <div className="flex min-h-0 flex-1 flex-col gap-4">
        <input
          type="text"
          value={title}
          onChange={(e) => handleTitleChange(e.target.value)}
          placeholder="Untitled"
          className="text-foreground placeholder:text-muted-foreground bg-transparent text-2xl font-bold outline-none"
        />
        <textarea
          value={content}
          onChange={(e) => handleContentChange(e.target.value)}
          placeholder="Start writing…"
          className="text-foreground placeholder:text-muted-foreground min-h-0 flex-1 resize-none bg-transparent text-sm leading-relaxed outline-none"
        />
      </div>
    </PageWrapper>
  );
}
