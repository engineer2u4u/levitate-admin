import type { Metadata } from "next";
import AdminShell from "@/components/AdminShell";
import AuthGate from "@/components/AuthGate";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "Levitate LMS Admin", template: "%s · Levitate LMS Admin" },
  description: "Create and manage Levitate PeopleSoft courses, sessions and enrolments.",
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>
        <AuthGate>
          <AdminShell>{children}</AdminShell>
        </AuthGate>
      </body>
    </html>
  );
}
