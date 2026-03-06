import { redirect } from "next/navigation";

export default async function ChallengeExecuteDayRedirectPage({
  params,
}: {
  params: Promise<{ enrollmentId: string }>;
}) {
  const { enrollmentId } = await params;
  redirect(`/challenge/session/${enrollmentId}/progress`);
}
