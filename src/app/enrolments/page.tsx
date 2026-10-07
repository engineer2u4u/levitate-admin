import type { Metadata } from "next";
import { Suspense } from "react";
import EnrolmentsView from "@/components/EnrolmentsView";

export const metadata: Metadata = { title: "Enrolments" };

// A batch's page links here as ?batch=…, read on the client. A static export
// has to wrap that read in Suspense, or the build refuses to prerender.
export default function Page() {
  return (
    <Suspense fallback={null}>
      <EnrolmentsView />
    </Suspense>
  );
}
