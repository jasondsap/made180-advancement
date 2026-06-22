import { redirect } from "next/navigation";

/**
 * Root of the dashboard subdomain (dashboard.almonry.com). Marketing lives on
 * almonry.com; this domain's only job is to get people into the app. Forward to
 * /app — signed-in users land on their dashboard, everyone else is bounced to
 * /auth/signin by middleware.
 */
export default function HomePage() {
  redirect("/app");
}
