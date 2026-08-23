import { redirect } from "next/navigation";

/** The admin opens on enrolments — the screen with the day-to-day work on it. */
export default function Page() {
  redirect("/enrolments");
}
