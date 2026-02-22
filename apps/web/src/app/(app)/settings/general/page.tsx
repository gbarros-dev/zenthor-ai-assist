"use client";

import { T } from "gt-next";

import { ThemeSwitcher } from "@/components/app-sidebar/theme-switcher";
import { PageWrapper } from "@/components/page-wrapper";

export default function GeneralSettingsPage() {
  return (
    <PageWrapper title={<T>General</T>} maxWidth="md">
      <div className="space-y-6">
        <div>
          <h3 className="text-foreground text-sm font-medium">
            <T>Appearance</T>
          </h3>
          <p className="text-muted-foreground mt-1 text-xs">
            <T>Choose your preferred theme.</T>
          </p>
          <div className="mt-3">
            <ThemeSwitcher />
          </div>
        </div>
      </div>
    </PageWrapper>
  );
}
