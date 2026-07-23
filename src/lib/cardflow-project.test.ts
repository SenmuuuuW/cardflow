import { describe, expect, it } from "vitest";
import { cardflowProject } from "@/lib/cardflow-project";

describe("cardflowProject", () => {
  it("defines the project identity and Phase 0 homepage boundary", () => {
    expect(cardflowProject.name).toBe("CardFlow");
    expect(cardflowProject.foundationLabel).toBe("Phase 0 foundation");
    expect(cardflowProject.homepageStatus).toBe(
      "Operational workflows are not implemented in this baseline.",
    );
  });
});
