import type { Metadata } from "next";
import CertificatesView from "@/components/CertificatesView";

export const metadata: Metadata = { title: "Certificates" };

export default function Page() {
  return <CertificatesView />;
}
