"use client";

import { AlertCircleIcon, BotIcon, Loader2Icon } from "lucide-react";

import {
  Conversation,
  ConversationContent,
  ConversationEmptyState,
  ConversationScrollButton,
} from "@/components/ai-elements/conversation";
import { Message, MessageContent, MessageResponse } from "@/components/ai-elements/message";
import {
  PromptInput,
  PromptInputSubmit,
  PromptInputTextarea,
} from "@/components/ai-elements/prompt-input";
import { useConvexChat } from "@/hooks/use-convex-chat";

function TypingIndicator() {
  return (
    <Message from="assistant">
      <MessageContent>
        <div className="flex items-center gap-1.5 py-1">
          <span className="bg-muted-foreground/60 size-1.5 animate-bounce rounded-full [animation-delay:0ms]" />
          <span className="bg-muted-foreground/60 size-1.5 animate-bounce rounded-full [animation-delay:150ms]" />
          <span className="bg-muted-foreground/60 size-1.5 animate-bounce rounded-full [animation-delay:300ms]" />
        </div>
      </MessageContent>
    </Message>
  );
}

export default function ChatPage() {
  const { messages, isProcessing, sendMessage, initializing, error } = useConvexChat();

  const hasStreamingMessage = messages?.some((m) => m.streaming) ?? false;
  const showTypingIndicator = isProcessing && !hasStreamingMessage;

  if (initializing) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2Icon className="text-muted-foreground size-6 animate-spin" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 text-center">
        <AlertCircleIcon className="text-destructive size-8" />
        <p className="text-muted-foreground text-sm">{error}</p>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <Conversation>
        <ConversationContent>
          {messages === null ? (
            <div className="flex h-full items-center justify-center">
              <Loader2Icon className="text-muted-foreground size-6 animate-spin" />
            </div>
          ) : messages.length === 0 ? (
            <ConversationEmptyState
              title="Start a conversation"
              description="Send a message to chat with Zenthor"
              icon={<BotIcon className="size-8" />}
            />
          ) : (
            messages.map((msg) => (
              <Message key={msg.id} from={msg.role}>
                <MessageContent>
                  {msg.role === "user" ? (
                    <p className="whitespace-pre-wrap">{msg.content}</p>
                  ) : (
                    <MessageResponse>{msg.content}</MessageResponse>
                  )}
                </MessageContent>
              </Message>
            ))
          )}
          {showTypingIndicator && <TypingIndicator />}
        </ConversationContent>
        <ConversationScrollButton />
      </Conversation>

      <div className="border-t p-4">
        <PromptInput
          onSubmit={({ text }) => {
            if (text.trim()) {
              sendMessage(text);
            }
          }}
        >
          <PromptInputTextarea placeholder="Message Zenthor..." disabled={isProcessing} />
          <PromptInputSubmit disabled={isProcessing} />
        </PromptInput>
      </div>
    </div>
  );
}
