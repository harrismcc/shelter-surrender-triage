import { describe, expect, it } from "bun:test";

import { classificationFromAnswers, TRIAGE_QUESTIONS } from "./classifier";
import {
  ISSUE_CATEGORIES,
  type IssueCategory,
  isMatchingSubmission,
  mergeOutlookCategories,
  outlookImportance,
  SUBSTANTIVE_ISSUE_CATEGORIES,
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
  it("maps the three priority bands to Outlook importance in priority order", () => {
    expect([
      outlookImportance("P1 — Immediate"),
      outlookImportance("P2 — Urgent"),
      outlookImportance("P3 — Standard"),
    ]).toEqual(["high", "normal", "low"]);
  });

  it("sends one three-band priority Choice and one Noul per substantive category", () => {
    expect(TRIAGE_QUESTIONS.priority.type).toBe("choice");
    expect(Object.keys(TRIAGE_QUESTIONS.priority.criteria)).toEqual([
      "P1 — Immediate",
      "P2 — Urgent",
      "P3 — Standard",
    ]);
    const questions = Object.values(
      TRIAGE_QUESTIONS as Record<string, { type: string }>,
    );
    expect(questions.some((question) => question.type === "score")).toBe(false);
    expect(questions.filter((question) => question.type === "noul")).toHaveLength(
      SUBSTANTIVE_ISSUE_CATEGORIES.length,
    );
  });

  it("includes multiple labels and includes the exact 0.5 boundary", () => {
    const classification = classificationFromAnswers(
      "P2 — Urgent",
      scores({
        "Housing / moving": 0.5,
        "Household safety / domestic violence": 0.91,
        "Financial hardship": 0.499,
        "Other / unclear": 0.99,
      }),
    );

    expect(classification).toEqual({
      priority: "P2 — Urgent",
      categories: [
        "Housing / moving",
        "Household safety / domestic violence",
      ],
    });
  });

  it("falls back to Other only when no substantive category qualifies", () => {
    expect(
      classificationFromAnswers(
        "P3 — Standard",
        scores({ "Animal medical": 0.499, "Other / unclear": 0.02 }),
      ).categories,
    ).toEqual(["Other / unclear"]);
  });

  it("rejects the removed P4 priority", () => {
    expect(() => classificationFromAnswers("P4 — Lower urgency", scores())).toThrow(
      "TypeSafe returned an invalid priority",
    );
  });

  it("replaces current and legacy managed labels while preserving unrelated categories", () => {
    expect(
      mergeOutlookCategories(
        [
          "Staff follow-up",
          " p1 — immediate ",
          "BEHAVIOR",
          "P4 — Lower urgency",
          "Staff follow-up",
        ],
        {
          priority: "P3 — Standard",
          categories: ["Financial hardship", "Animal medical"],
        },
      ),
    ).toEqual([
      "Staff follow-up",
      "P3 — Standard",
      "Financial hardship",
      "Animal medical",
    ]);
  });
});
