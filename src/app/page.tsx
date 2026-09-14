"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

/**
 * The admin opens on enrolments — the screen with the day-to-day work on it.
 *
 * A client-side replace, not next/navigation's server `redirect()`. In a
 * static export that redirect is baked into the page as a bare "/enrolments"
 * and followed without the base path, which on this host sends a freshly
 * signed-in admin to levitatepeoplesoft.com/enrolments/ — the main site's 404.
 * The router adds /admin-panel itself; the link is there for the moment before
 * it runs, or if it cannot.
 */
export default function Page() {
  const router = useRouter();

  useEffect(() => {
    router.replace("/enrolments");
  }, [router]);

  return (
    <div style={{ padding: "40px 26px", font: "500 12.5px 'Plus Jakarta Sans',sans-serif", color: "var(--muted)" }}>
      Opening <Link href="/enrolments" style={{ color: "var(--teal)", fontWeight: 700 }}>Enrolments</Link>…
    </div>
  );
}
