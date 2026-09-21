import * as Sentry from "@sentry/cloudflare";

import type { Config } from "./config";
import { ISSUE_CATEGORIES, PRIORITIES } from "./domain";
import type { IssueCategory, Priority } from "./domain";
import type {
  GraphSubscription,
  MailFolder,
  MasterCategory,
  ProvisioningGraphOperations,
} from "./graph";

const CATEGORY_COLORS: Record<Priority | IssueCategory, string> = {
  "P1 — Immediate": "preset0",
  "P2 — Urgent": "preset1",
  "P3 — Standard": "preset7",
  "Housing / moving": "preset7",
  "Behavior / energy / lack of time": "preset1",
  "Financial hardship": "preset3",
  "Caregiver health / unavailable": "preset9",
  "Pregnancy / new baby / family change": "preset24",
  "Too many animals": "preset8",
  "Animal medical": "preset0",
  "Recent human bite / injury": "preset15",
  "Serious animal injury / death": "preset16",
  "Child or vulnerable-person safety": "preset14",
  "Cannot safely contain or separate": "preset17",
  "Acute animal suffering": "preset11",
  "No safe caregiver or placement": "preset6",
  "Household safety / domestic violence": "preset23",
  "Abandonment / basic-care risk": "preset18",
  "Humane euthanasia / end-of-life request": "preset20",
  "Other / unclear": "preset12",
};

export const REQUIRED_MASTER_CATEGORIES = [...PRIORITIES, ...ISSUE_CATEGORIES].map(
  (displayName) => ({
    displayName,
    color: CATEGORY_COLORS[displayName],
  }),
);

export function missingMasterCategories(
  existing: readonly Pick<MasterCategory, "displayName">[],
): typeof REQUIRED_MASTER_CATEGORIES {
  const names = new Set(
    existing.map((category) => category.displayName.trim().toLocaleLowerCase("en-US")),
  );
  return REQUIRED_MASTER_CATEGORIES.filter(
    (category) => !names.has(category.displayName.toLocaleLowerCase("en-US")),
  );
}

export function masterCategoryColorUpdates(
  existing: readonly MasterCategory[],
): Array<{ id: string; color: string }> {
  const requiredByName = new Map(
    REQUIRED_MASTER_CATEGORIES.map((category) => [
      category.displayName.toLocaleLowerCase("en-US"),
      category,
    ]),
  );
  const updates: Array<{ id: string; color: string }> = [];
  for (const category of existing) {
    const required = requiredByName.get(
      category.displayName.trim().toLocaleLowerCase("en-US"),
    );
    if (
      category.id &&
      required &&
      category.color.toLocaleLowerCase("en-US") !== required.color
    ) {
      updates.push({ id: category.id, color: required.color });
    }
  }
  return updates;
}

export function findFolder(
  folders: readonly MailFolder[],
  displayName: string,
): MailFolder | undefined {
  const target = displayName.trim().toLocaleLowerCase("en-US");
  return folders.find(
    (folder) => folder.displayName.trim().toLocaleLowerCase("en-US") === target,
  );
}

export interface SubscriptionDecision {
  action: "create" | "replace" | "renew" | "none";
  subscription?: GraphSubscription;
}

export function decideSubscription(
  subscriptions: readonly GraphSubscription[],
  resource: string,
  webhookUrl: string,
  now: Date,
): SubscriptionDecision {
  const normalizedResource = resource.replace(/^\//, "").toLocaleLowerCase("en-US");
  const existing = subscriptions.find(
    (subscription) =>
      subscription.resource.replace(/^\//, "").toLocaleLowerCase("en-US") === normalizedResource &&
      subscription.changeType.split(",").map((value) => value.trim()).includes("created"),
  );
  if (!existing) return { action: "create" };
  const normalizedWebhookUrl = webhookUrl.replace(/\/+$/, "");
  if (
    existing.notificationUrl.replace(/\/+$/, "") !== normalizedWebhookUrl ||
    existing.lifecycleNotificationUrl?.replace(/\/+$/, "") !== normalizedWebhookUrl
  ) {
    return { action: "replace", subscription: existing };
  }
  const renewBefore = now.getTime() + 24 * 60 * 60 * 1_000;
  if (new Date(existing.expirationDateTime).getTime() <= renewBefore) {
    return { action: "renew", subscription: existing };
  }
  return { action: "none", subscription: existing };
}

export function subscriptionExpiration(now: Date): string {
  return new Date(now.getTime() + 3 * 24 * 60 * 60 * 1_000).toISOString();
}

export async function reauthorizeSubscription(
  graph: Pick<ProvisioningGraphOperations, "renewSubscription">,
  subscriptionId: string,
  now = new Date(),
): Promise<void> {
  await graph.renewSubscription(subscriptionId, subscriptionExpiration(now));
}

export async function provisionRuntime(
  graph: ProvisioningGraphOperations,
  config: Config,
  now = new Date(),
): Promise<void> {
  let folder = findFolder(await graph.listMailFolders(), config.destinationFolderName);
  const folderCreated = !folder;
  if (folderCreated) folder = await graph.createMailFolder(config.destinationFolderName);

  const existingCategories = await graph.listMasterCategories();
  const missingCategories = missingMasterCategories(existingCategories);
  const colorUpdates = masterCategoryColorUpdates(existingCategories);
  for (const category of missingCategories) {
    await graph.createMasterCategory(category.displayName, category.color);
  }
  for (const category of colorUpdates) {
    await graph.updateMasterCategoryColor(category.id, category.color);
  }

  const resource = config.microsoftAuthMode === "delegated"
    ? "me/mailFolders('inbox')/messages"
    : `users/${config.mailbox}/mailFolders('inbox')/messages`;
  const decision = decideSubscription(
    await graph.listSubscriptions(),
    resource,
    config.webhookUrl,
    now,
  );
  const expirationDateTime = subscriptionExpiration(now);
  if (decision.action === "replace" && decision.subscription) {
    await graph.deleteSubscription(decision.subscription.id);
  }
  if (decision.action === "create" || decision.action === "replace") {
    await graph.createSubscription({
      resource,
      changeType: "created",
      notificationUrl: config.webhookUrl,
      lifecycleNotificationUrl: config.webhookUrl,
      expirationDateTime,
      clientState: config.webhookClientState,
    });
  } else if (decision.action === "renew" && decision.subscription) {
    await graph.renewSubscription(decision.subscription.id, expirationDateTime);
  }

  Sentry.getActiveSpan()?.setAttributes({
    "triage.provisioning.folder_created": folderCreated,
    "triage.provisioning.categories_created": missingCategories.length,
    "triage.provisioning.category_colors_updated": colorUpdates.length,
    "triage.provisioning.subscription_action": decision.action,
  });
  Sentry.metrics.count("triage.provisioning.runs", 1, {
    attributes: {
      folder_created: folderCreated,
      categories_created: missingCategories.length,
      category_colors_updated: colorUpdates.length,
      subscription_action: decision.action,
    },
  });
}
