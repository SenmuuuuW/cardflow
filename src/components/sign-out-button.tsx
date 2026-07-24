"use client";

import { useState } from "react";

export function SignOutButton() {
  const [error, setError] = useState<string | null>(null);
  const [isSigningOut, setIsSigningOut] = useState(false);

  async function signOut() {
    setError(null);
    setIsSigningOut(true);

    const response = await fetch("/api/auth/sign-out", {
      method: "POST",
      credentials: "same-origin",
    });

    if (!response.ok) {
      setError("Unable to sign out. Please try again.");
      setIsSigningOut(false);
      return;
    }

    window.location.assign("/login");
  }

  return (
    <div className="space-y-2">
      <button
        className="border border-[#19715c] px-4 py-2 text-sm font-semibold text-[#19715c] disabled:cursor-not-allowed disabled:opacity-60"
        disabled={isSigningOut}
        onClick={signOut}
        type="button"
      >
        {isSigningOut ? "Signing out" : "Sign out"}
      </button>
      {error ? <p className="text-sm text-[#a33c32]">{error}</p> : null}
    </div>
  );
}
