import { describe, expect, it } from "bun:test";

import { classificationFromAnswers, TRIAGE_QUESTIONS } from "./classifier";
import {
  ISSUE_CATEGORIES,
  type IssueCategory,
  isMatchingSubmission,
  mergeOutlookCategories,
} from "./domain";

function scores(overrides: Partial<Record<IssueCategory, number>> = {}): Record<IssueCategory, number> {
  return Object.fromEntries(
    ISSUE_CATEGORIES.map((category) => [category, overrides[category] ?? 0]),
  ) as Record<IssueCategory, number>;
}

describe("submission matching", () => {
  const message = {
    from: { emailAddress: { address: " Forms@Shelter.Example " } },
    subject: " Pet Surrender Request ",
  };

  it("uses case-insensitive exact sender and subject matches after trimming", () => {
    expect(
      isMatchingSubmission(message, "forms@shelter.example", "pet surrender request"),
    ).toBe(true);
  });

  it("rejects sender and subject near misses", () => {
    expect(
      isMatchingSubmission(message, "other@shelter.example", "pet surrender request"),
    ).toBe(false);
    expect(
      isMatchingSubmission(message, "forms@shelter.example", "pet surrender request #42"),
    ).toBe(false);
    expect(
      isMatchingSubmission(
        { ...message, from: { emailAddress: { address: "xforms@shelter.example" } } },
        "forms@shelter.example",
        "pet surrender request",
      ),
    ).toBe(false);
  });
});

describe("classification mapping", () => {
  it("sends one priority Choice and one Noul per issue category", () => {
    expect(TRIAGE_QUESTIONS.priority.type).toBe("choice");
    const questions = Object.values(
      TRIAGE_QUESTIONS as Record<string, { type: string }>,
    );
    expect(questions.filter((question) => question.type === "noul")).toHaveLength(
      ISSUE_CATEGORIES.length,
    );
  });

  it("includes multiple labels and includes the exact 0.5 boundary", () => {
    const classification = classificationFromAnswers(
      "P2 — Urgent",
      scores({
        "Housing / landlord / moving": 0.5,
        "Temporary foster / boarding need": 0.91,
        "Financial hardship": 0.499,
        "Other / unclear": 0.99,
      }),
    );

    expect(classification).toEqual({
      priority: "P2 — Urgent",
      categories: [
        "Housing / landlord / moving",
        "Temporary foster / boarding need",
      ],
    });
  });

  it("falls back to Other only when no substantive category qualifies", () => {
    expect(
      classificationFromAnswers(
        "P4 — Lower urgency",
        scores({ "Animal medical issue": 0.499, "Other / unclear": 0.02 }),
      ).categories,
    ).toEqual(["Other / unclear"]);
  });

  it("replaces managed labels while preserving unrelated Outlook categories", () => {
    expect(
      mergeOutlookCategories(
        ["Staff follow-up", " p1 — immediate ", "BEHAVIOR", "Staff follow-up"],
        {
          priority: "P3 — Standard",
          categories: ["Financial hardship", "Veterinary assistance"],
        },
      ),
    ).toEqual([
      "Staff follow-up",
      "P3 — Standard",
      "Financial hardship",
      "Veterinary assistance",
    ]);
  });
});
