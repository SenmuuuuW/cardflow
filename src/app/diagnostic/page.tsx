import { redirect } from "next/navigation";

import { getAuthenticatedUser } from "@/auth/server-session";
import { SignOutButton } from "@/components/sign-out-button";

export default async function DiagnosticPage() {
  const user = await getAuthenticatedUser();

  if (!user) {
    redirect("/login");
  }

  return (
    <main className="min-h-screen bg-[#f4f6f4] px-6 py-10 text-[#18231f] sm:px-10 lg:px-16">
      <section className="mx-auto flex min-h-[calc(100vh-5rem)] max-w-3xl items-center">
        <div className="w-full border-l-4 border-[#19715c] pl-6 sm:pl-8">
          <p className="text-sm font-semibold text-[#19715c]">PHASE 0 DIAGNOSTIC</p>
          <h1 className="mt-4 text-3xl font-semibold">Authenticated operator</h1>
          <dl className="mt-8 grid gap-5 border-y border-[#cfd8d2] py-6 sm:grid-cols-2">
            <div>
              <dt className="text-sm text-[#50605a]">Display name</dt>
              <dd className="mt-1 text-lg font-medium">{user.displayName}</dd>
            </div>
            <div>
              <dt className="text-sm text-[#50605a]">Role</dt>
              <dd className="mt-1 text-lg font-medium">{user.role}</dd>
            </div>
          </dl>
          <p className="mt-6 text-base leading-7 text-[#50605a]">
            Operational workflows are not implemented in this Phase 0 diagnostic surface.
          </p>
          <div className="mt-8">
            <SignOutButton />
          </div>
        </div>
      </section>
    </main>
  );
}
