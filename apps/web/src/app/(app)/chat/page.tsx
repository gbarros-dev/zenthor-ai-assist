"use client";

import { T } from "gt-next";
import { MessageSquare } from "lucide-react";

import { PageWrapper } from "@/components/page-wrapper";

export default function ChatPage() {
  return (
    <PageWrapper title={<T>Chat</T>}>
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <div className="bg-muted flex size-12 items-center justify-center rounded-full">
          <MessageSquare className="text-muted-foreground size-6" />
        </div>
        <h2 className="text-foreground mt-4 text-lg font-semibold">
          <T>Chat coming soon</T>
        </h2>
        <p className="text-muted-foreground mt-2 max-w-sm text-sm">
          <T>The AI chat interface is under development. Stay tuned.</T>
        </p>
      </div>
    </PageWrapper>
  );
}
