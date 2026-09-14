import type { Metadata } from "next";
import { Suspense } from "react";
import BatchDetailView from "@/components/BatchDetailView";

export const metadata: Metadata = { title: "Batch" };

// The batch id arrives as ?id=…, read on the client. A static export has to
// wrap that read in Suspense, or the build refuses to prerender the page.
export default function Page() {
  return (
    <Suspense fallback={null}>
      <BatchDetailView />
    </Suspense>
  );
}
