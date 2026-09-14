import type { Metadata } from "next";
import { Suspense } from "react";
import BatchesView from "@/components/BatchesView";

export const metadata: Metadata = { title: "Batches" };

// The course filter arrives as ?course=…, read on the client. A static export
// has to wrap that read in Suspense, or the build refuses to prerender the page.
export default function Page() {
  return (
    <Suspense fallback={null}>
      <BatchesView />
    </Suspense>
  );
}
