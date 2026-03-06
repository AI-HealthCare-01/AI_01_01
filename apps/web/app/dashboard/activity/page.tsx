import { redirect } from "next/navigation";

export default function DashboardActivityRedirectPage() {
  redirect("/mypage/activity-log");
}
