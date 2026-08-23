import type { Metadata } from "next";
import SessionsView from "@/components/SessionsView";

export const metadata: Metadata = { title: "Sessions" };

export default function Page() {
  return <SessionsView />;
}
