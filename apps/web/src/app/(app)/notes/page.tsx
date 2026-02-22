"use client";

import { api } from "@zenthor-ai-assist/backend/convex/_generated/api";
import { useMutation } from "convex/react";
import { T } from "gt-next";
import { NotebookText, Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback } from "react";
import { toast } from "sonner";

import { PageWrapper } from "@/components/page-wrapper";
import { Button } from "@/components/ui/button";

export default function NotesPage() {
  const router = useRouter();
  const createNote = useMutation(api.notes.create);

  const handleNewNote = useCallback(async () => {
    try {
      const noteId = await createNote({ title: "Untitled", source: "manual" });
      router.push(`/notes/${noteId}`);
    } catch {
      toast.error("Failed to create note");
    }
  }, [createNote, router]);

  return (
    <PageWrapper
      title={<T>Notes</T>}
      actions={
        <Button size="sm" className="gap-1.5" onClick={() => void handleNewNote()}>
          <Plus className="size-3.5" />
          <T>New note</T>
        </Button>
      }
    >
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <div className="bg-muted flex size-12 items-center justify-center rounded-full">
          <NotebookText className="text-muted-foreground size-6" />
        </div>
        <h2 className="text-foreground mt-4 text-lg font-semibold">
          <T>Your notes</T>
        </h2>
        <p className="text-muted-foreground mt-2 max-w-sm text-sm">
          <T>Select a note from the sidebar or create a new one to get started.</T>
        </p>
      </div>
    </PageWrapper>
  );
}
