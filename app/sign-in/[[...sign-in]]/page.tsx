import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";

import { SignInPageClient } from "@/components/auth/SignInPageClient";

export default async function SignInPage() {
  const { userId } = await auth();
  if (userId) {
    redirect("/");
  }

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center bg-zinc-50 p-4">
      <SignInPageClient />
    </main>
  );
}
