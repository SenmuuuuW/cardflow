import { redirect } from "next/navigation";

import { getAuthenticatedUser } from "@/auth/server-session";
import { LoginForm } from "@/components/login-form";

export default async function LoginPage() {
  const user = await getAuthenticatedUser();

  if (user) {
    redirect("/diagnostic");
  }

  return (
    <main className="min-h-screen bg-[#f4f6f4] px-6 py-10 text-[#18231f] sm:px-10">
      <section className="mx-auto flex min-h-[calc(100vh-5rem)] max-w-md items-center">
        <div className="w-full border-l-4 border-[#19715c] pl-6 sm:pl-8">
          <p className="text-sm font-semibold text-[#19715c]">CARDFLOW</p>
          <h1 className="mt-4 text-3xl font-semibold">Sign in</h1>
          <p className="mt-3 text-base leading-7 text-[#50605a]">
            Access is limited to provisioned CardFlow accounts.
          </p>
          <LoginForm />
        </div>
      </section>
    </main>
  );
}
