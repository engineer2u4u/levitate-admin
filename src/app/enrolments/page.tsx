import type { Metadata } from "next";
import EnrolmentsView from "@/components/EnrolmentsView";

export const metadata: Metadata = { title: "Enrolments" };

export default function Page() {
  return <EnrolmentsView />;
}
