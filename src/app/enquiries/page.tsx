import type { Metadata } from "next";
import EnquiriesView from "@/components/EnquiriesView";

export const metadata: Metadata = { title: "Enquiries" };

export default function Page() {
  return <EnquiriesView />;
}
