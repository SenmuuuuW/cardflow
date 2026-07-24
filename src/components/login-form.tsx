"use client";

import { type FormEvent, useState } from "react";

function getErrorMessage(payload: unknown): string {
  if (
    payload &&
    typeof payload === "object" &&
    "message" in payload &&
    typeof payload.message === "string"
  ) {
    return payload.message;
  }

  return "Unable to sign in with those credentials.";
}

export function LoginForm() {
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);

    const formData = new FormData(event.currentTarget);
    const response = await fetch("/api/auth/sign-in/email", {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: formData.get("email"),
        password: formData.get("password"),
      }),
    });

    if (!response.ok) {
      const payload: unknown = await response.json().catch(() => null);
      setError(getErrorMessage(payload));
      setIsSubmitting(false);
      return;
    }

    window.location.assign("/diagnostic");
  }

  return (
    <form className="mt-8 space-y-5" onSubmit={handleSubmit}>
      <label className="block text-sm font-medium text-[#18231f]" htmlFor="email">
        Email
        <input
          autoComplete="email"
          className="mt-2 w-full border border-[#b7c3bc] bg-white px-3 py-2.5 text-base text-[#18231f] outline-none focus:border-[#19715c] focus:ring-2 focus:ring-[#19715c]/20"
          id="email"
          name="email"
          required
          type="email"
        />
      </label>
      <label className="block text-sm font-medium text-[#18231f]" htmlFor="password">
        Password
        <input
          autoComplete="current-password"
          className="mt-2 w-full border border-[#b7c3bc] bg-white px-3 py-2.5 text-base text-[#18231f] outline-none focus:border-[#19715c] focus:ring-2 focus:ring-[#19715c]/20"
          id="password"
          name="password"
          required
          type="password"
        />
      </label>
      {error ? <p className="text-sm text-[#a33c32]">{error}</p> : null}
      <button
        className="w-full bg-[#19715c] px-4 py-2.5 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60"
        disabled={isSubmitting}
        type="submit"
      >
        {isSubmitting ? "Signing in" : "Sign in"}
      </button>
    </form>
  );
}
