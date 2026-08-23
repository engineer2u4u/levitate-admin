import type { Metadata } from "next";
import CoursesView from "@/components/CoursesView";

export const metadata: Metadata = { title: "Courses" };

export default function Page() {
  return <CoursesView />;
}
