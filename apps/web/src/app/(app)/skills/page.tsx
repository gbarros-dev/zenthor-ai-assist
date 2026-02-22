"use client";

import { T } from "gt-next";
import { Sparkles } from "lucide-react";

import { PageWrapper } from "@/components/page-wrapper";

export default function SkillsPage() {
  return (
    <PageWrapper title={<T>Skills</T>}>
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <div className="bg-muted flex size-12 items-center justify-center rounded-full">
          <Sparkles className="text-muted-foreground size-6" />
        </div>
        <h2 className="text-foreground mt-4 text-lg font-semibold">
          <T>Skills coming soon</T>
        </h2>
        <p className="text-muted-foreground mt-2 max-w-sm text-sm">
          <T>Skills configuration and management will be available here.</T>
        </p>
      </div>
    </PageWrapper>
  );
}
