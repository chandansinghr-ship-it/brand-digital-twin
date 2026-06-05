"use client";

/**
 * Auth guard for all product screens. Unauthenticated users are bounced to
 * /login. In MOCK mode `isAuthed()` is always true so the demo is open.
 * Route groups are URL-transparent — paths stay /connect, /dashboard, etc.
 */
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { isAuthed } from "@/lib/api";
import { useStream } from "@/lib/useStream";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [ready, setReady] = useState(false);

  // Live updates for every product screen (no-op in MOCK mode).
  useStream();

  useEffect(() => {
    if (!isAuthed()) {
      router.replace("/login");
      return;
    }
    setReady(true);
  }, [router]);

  if (!ready) {
    // Avoid flashing protected content before the auth check resolves.
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-border border-t-accent" />
      </div>
    );
  }

  return <>{children}</>;
}
