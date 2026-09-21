export const PRIORITIES = [
  "P1 — Immediate",
  "P2 — Urgent",
  "P3 — Standard",
] as const;

export type Priority = (typeof PRIORITIES)[number];

export type OutlookImportance = "high" | "normal" | "low";

const OUTLOOK_IMPORTANCE_BY_PRIORITY: Record<Priority, OutlookImportance> = {
  "P1 — Immediate": "high",
  "P2 — Urgent": "normal",
  "P3 — Standard": "low",
};

export function outlookImportance(priority: Priority): OutlookImportance {
  return OUTLOOK_IMPORTANCE_BY_PRIORITY[priority];
}

export const REASON_CATEGORIES = [
  "Housing / moving",
  "Behavior / energy / lack of time",
  "Financial hardship",
  "Caregiver health / unavailable",
  "Pregnancy / new baby / family change",
  "Too many animals",
  "Animal medical",
] as const;

export const SAFETY_CATEGORIES = [
  "Recent human bite / injury",
  "Serious animal injury / death",
  "Child or vulnerable-person safety",
  "Cannot safely contain or separate",
  "Acute animal suffering",
  "No safe caregiver or placement",
  "Household safety / domestic violence",
  "Abandonment / basic-care risk",
  "Humane euthanasia / end-of-life request",
] as const;

export const SUBSTANTIVE_ISSUE_CATEGORIES = [
  ...REASON_CATEGORIES,
  ...SAFETY_CATEGORIES,
] as const;

export const ISSUE_CATEGORIES = [
  ...SUBSTANTIVE_ISSUE_CATEGORIES,
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
  const substantive = SUBSTANTIVE_ISSUE_CATEGORIES.filter(
    (category) => scores[category] >= 0.5,
  );
  return substantive.length > 0 ? substantive : ["Other / unclear"];
}

function normalizedCategory(value: string): string {
  return value.trim().toLocaleLowerCase("en-US");
}

const LEGACY_MANAGED_CATEGORIES = [
  "P4 — Lower urgency",
  "Housing / landlord / moving",
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
] as const;

const MANAGED_CATEGORIES = new Set<string>(
  [...PRIORITIES, ...ISSUE_CATEGORIES, ...LEGACY_MANAGED_CATEGORIES].map(normalizedCategory),
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
