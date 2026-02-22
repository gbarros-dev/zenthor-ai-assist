"use client";

import { UserProfile } from "@clerk/nextjs";
import { T } from "gt-next";

import { PageWrapper } from "@/components/page-wrapper";

export default function ProfileSettingsPage() {
  return (
    <PageWrapper title={<T>Profile</T>} maxWidth="md">
      <UserProfile
        routing="hash"
        appearance={{
          elements: {
            rootBox: "w-full",
            cardBox: "w-full shadow-none",
            card: "w-full shadow-none border-0 bg-transparent",
          },
        }}
      />
    </PageWrapper>
  );
}
