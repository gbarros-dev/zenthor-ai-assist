"use client";

import { T } from "gt-next";
import { MessageCircle, CheckSquare } from "lucide-react";

import { PageWrapper } from "@/components/page-wrapper";

function IntegrationCard({
  icon,
  name,
  description,
  status,
}: {
  icon: React.ReactNode;
  name: string;
  description: string;
  status: "coming-soon" | "connected" | "disconnected";
}) {
  return (
    <div className="border-border flex items-start gap-4 rounded-lg border p-4">
      <div className="bg-muted flex size-10 shrink-0 items-center justify-center rounded-lg">
        {icon}
      </div>
      <div className="flex-1">
        <div className="flex items-center gap-2">
          <h3 className="text-foreground text-sm font-medium">{name}</h3>
          {status === "coming-soon" && (
            <span className="bg-muted text-muted-foreground rounded-full px-2 py-0.5 text-[10px] font-medium">
              <T>Coming soon</T>
            </span>
          )}
        </div>
        <p className="text-muted-foreground mt-1 text-xs">{description}</p>
      </div>
    </div>
  );
}

export default function IntegrationsSettingsPage() {
  return (
    <PageWrapper title={<T>Integrations</T>} maxWidth="md">
      <div className="space-y-3">
        <IntegrationCard
          icon={<MessageCircle className="text-muted-foreground size-5" />}
          name="WhatsApp"
          description="Connect your WhatsApp account to chat with your AI assistant."
          status="coming-soon"
        />
        <IntegrationCard
          icon={<CheckSquare className="text-muted-foreground size-5" />}
          name="Todoist"
          description="Sync tasks and reminders with your Todoist account."
          status="coming-soon"
        />
      </div>
    </PageWrapper>
  );
}
