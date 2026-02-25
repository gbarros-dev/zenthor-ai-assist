"use client";

import { api } from "@zenthor-ai-assist/backend/convex/_generated/api";
import type { Id } from "@zenthor-ai-assist/backend/convex/_generated/dataModel";
import { useMutation, useQuery } from "convex/react";
import { useCallback, useEffect, useMemo, useState } from "react";

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  streaming?: boolean;
  createdAt: Date;
}

export function useConvexChat() {
  const [conversationId, setConversationId] = useState<Id<"conversations"> | null>(null);
  const [initializing, setInitializing] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const getOrCreate = useMutation(api.conversations.getOrCreate);
  const sendMutation = useMutation(api.messages.send);

  // Initialize conversation on mount
  useEffect(() => {
    let cancelled = false;
    getOrCreate({ channel: "web" })
      .then((id) => {
        if (!cancelled) {
          setConversationId(id);
          setInitializing(false);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          console.error("Failed to initialize conversation:", err);
          setError("Failed to start conversation");
          setInitializing(false);
        }
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only run on mount
  }, []);

  const rawMessages = useQuery(
    api.messages.list,
    conversationId ? { conversationId, limit: 200 } : "skip",
  );

  const isProcessing = useQuery(
    api.agentStatus.isProcessing,
    conversationId ? { conversationId } : "skip",
  );

  const messages = useMemo<ChatMessage[] | null>(() => {
    if (!rawMessages) return null;
    return rawMessages.map((m) => ({
      id: m._id,
      role: m.role as "user" | "assistant",
      content: m.content,
      streaming: m.streaming ?? false,
      createdAt: new Date(m.createdAt),
    }));
  }, [rawMessages]);

  const sendMessage = useCallback(
    async (content: string) => {
      if (!conversationId || !content.trim()) return;
      await sendMutation({ conversationId, content: content.trim() });
    },
    [conversationId, sendMutation],
  );

  return {
    messages,
    isProcessing: isProcessing ?? false,
    sendMessage,
    conversationId,
    initializing,
    error,
  };
}
