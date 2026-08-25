import type { Metadata } from "next";
import FacilitatorsView from "@/components/FacilitatorsView";

export const metadata: Metadata = { title: "Facilitators" };

export default function Page() {
  return <FacilitatorsView />;
}
