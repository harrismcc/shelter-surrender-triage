export const PRIORITIES = [
  "P1 — Immediate",
  "P2 — Urgent",
  "P3 — Standard",
  "P4 — Lower urgency",
] as const;

export type Priority = (typeof PRIORITIES)[number];

export const ISSUE_CATEGORIES = [
  "Housing / landlord / moving",
  "Financial hardship",
  "Animal medical issue",
  "Owner medical issue",
  "Behavior",
  "Bite / aggression / safety",
  "Animal-to-animal conflict",
  "Unable to care for animal",
  "Too many animals / possible hoarding",
  "Lack of time",
  "Family or life change",
  "Rehoming assistance",
  "Temporary foster / boarding need",
  "Veterinary assistance",
  "Food / supply assistance",
  "Behavior assistance",
  "Humane euthanasia request",
  "Other / unclear",
] as const;

export type IssueCategory = (typeof ISSUE_CATEGORIES)[number];

export interface Classification {
  priority: Priority;
  categories: IssueCategory[];
}

export interface MessageIdentity {
  subject?: string | null;
  from?: {
    emailAddress?: {
      address?: string | null;
    } | null;
  } | null;
}

function normalized(value: string | null | undefined): string {
  return value?.trim().toLocaleLowerCase("en-US") ?? "";
}

export function isMatchingSubmission(
  message: MessageIdentity,
  exactSender: string,
  exactSubject: string,
): boolean {
  return (
    normalized(message.from?.emailAddress?.address) === normalized(exactSender) &&
    normalized(message.subject) === normalized(exactSubject)
  );
}

export function categoriesAtThreshold(
  scores: Readonly<Record<IssueCategory, number>>,
): IssueCategory[] {
  const substantive = ISSUE_CATEGORIES.slice(0, -1).filter(
    (category) => scores[category] >= 0.5,
  );
  return substantive.length > 0 ? substantive : ["Other / unclear"];
}

function normalizedCategory(value: string): string {
  return value.trim().toLocaleLowerCase("en-US");
}

const MANAGED_CATEGORIES = new Set<string>(
  [...PRIORITIES, ...ISSUE_CATEGORIES].map(normalizedCategory),
);

export function mergeOutlookCategories(
  existing: readonly string[],
  classification: Classification,
): string[] {
  const unrelated = existing.filter(
    (category) => !MANAGED_CATEGORIES.has(normalizedCategory(category)),
  );
  return [...new Set([...unrelated, classification.priority, ...classification.categories])];
}
