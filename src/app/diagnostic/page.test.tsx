import { beforeEach, describe, expect, it, vi } from "vitest";

const mockedDependencies = vi.hoisted(() => ({
  getAuthenticatedUser: vi.fn(),
  redirect: vi.fn(),
}));

vi.mock("@/auth/server-session", () => ({
  getAuthenticatedUser: mockedDependencies.getAuthenticatedUser,
}));

vi.mock("next/navigation", () => ({
  redirect: mockedDependencies.redirect,
}));

import DiagnosticPage from "./page";

describe("DiagnosticPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("redirects an unauthenticated request to login", async () => {
    mockedDependencies.getAuthenticatedUser.mockResolvedValue(null);
    mockedDependencies.redirect.mockImplementation(() => {
      throw new Error("redirected to login");
    });

    await expect(DiagnosticPage()).rejects.toThrow("redirected to login");
    expect(mockedDependencies.redirect).toHaveBeenCalledWith("/login");
  });
});
