"use client";

import { SignIn } from "@clerk/nextjs";
import Image from "next/image";

export default function SignInPage() {
  return (
    <div className="relative flex min-h-svh items-center justify-center">
      {/* Background layers */}
      <div className="landing-grid-pattern pointer-events-none absolute inset-0" />
      <div className="landing-crosshair-pattern pointer-events-none absolute inset-0 opacity-60" />
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse 70% 60% at 50% 45%, transparent 0%, var(--background) 100%)",
        }}
      />

      <div className="relative z-10 flex flex-col items-center gap-8">
        <div className="flex items-center gap-2.5">
          <Image
            src="/zenthor-logo-text.svg"
            alt="Zenthor"
            width={130}
            height={30}
            priority
            className="dark:hidden"
          />
          <Image
            src="/zenthor-logo-text-dark.svg"
            alt="Zenthor"
            width={130}
            height={30}
            priority
            className="hidden dark:block"
          />
        </div>
        <SignIn />
      </div>
    </div>
  );
}
