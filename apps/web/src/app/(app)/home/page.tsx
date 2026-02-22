"use client";

import { useUser } from "@clerk/nextjs";
import { T } from "gt-next";
import { MessageSquare } from "lucide-react";
import Link from "next/link";

import { PageWrapper } from "@/components/page-wrapper";
import { Button } from "@/components/ui/button";

function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

export default function HomePage() {
  const { user } = useUser();
  const firstName = user?.firstName ?? "there";
  const greeting = getGreeting();

  return (
    <PageWrapper title={<T>Home</T>}>
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <h2 className="text-foreground text-2xl font-semibold tracking-tight">
          {greeting}, {firstName}
        </h2>
        <p className="text-muted-foreground mt-2 max-w-md text-sm">
          <T>Welcome back to Zenthor. Start a conversation, capture a note, or check your tasks.</T>
        </p>
        <Button asChild size="lg" className="mt-8 gap-2">
          <Link href="/chat">
            <MessageSquare className="size-4" />
            <T>Start chatting</T>
          </Link>
        </Button>
      </div>
    </PageWrapper>
  );
}
