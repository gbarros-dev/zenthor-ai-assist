"use client";

import { T } from "gt-next";
import { CheckSquare } from "lucide-react";

import { PageWrapper } from "@/components/page-wrapper";

export default function TasksPage() {
  return (
    <PageWrapper title={<T>Tasks</T>}>
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <div className="bg-muted flex size-12 items-center justify-center rounded-full">
          <CheckSquare className="text-muted-foreground size-6" />
        </div>
        <h2 className="text-foreground mt-4 text-lg font-semibold">
          <T>Tasks coming soon</T>
        </h2>
        <p className="text-muted-foreground mt-2 max-w-sm text-sm">
          <T>Connect Todoist in Settings to manage your tasks here.</T>
        </p>
      </div>
    </PageWrapper>
  );
}
