import { describe, expect, it } from "bun:test";

import type { Config } from "./config";
import type { GraphSubscription, ProvisioningGraphOperations } from "./graph";
import {
  decideSubscription,
  masterCategoryColorUpdates,
  missingMasterCategories,
  provisionRuntime,
  reauthorizeSubscription,
  REQUIRED_MASTER_CATEGORIES,
} from "./provisioning";

const now = new Date("2026-09-21T12:00:00.000Z");
const resource = "users/intake@example.org/mailFolders('inbox')/messages";
const webhookUrl = "https://worker.example/webhooks/graph";

function subscription(expirationDateTime: string) {
  return {
    id: "subscription-id",
    resource,
    changeType: "created",
    notificationUrl: webhookUrl,
    lifecycleNotificationUrl: webhookUrl,
    expirationDateTime,
  };
}

describe("runtime provisioning decisions", () => {
  it("does nothing for a matching subscription with more than a day remaining", () => {
    expect(
      decideSubscription(
        [subscription("2026-09-23T12:00:01.000Z")],
        resource,
        webhookUrl,
        now,
      ).action,
    ).toBe("none");
  });

  it("renews a matching expiring subscription and replaces when endpoints do not match", () => {
    expect(
      decideSubscription(
        [subscription("2026-09-22T11:59:59.000Z")],
        resource,
        webhookUrl,
        now,
      ).action,
    ).toBe("renew");
    expect(
      decideSubscription(
        [{ ...subscription("2026-09-23T12:00:01.000Z"), notificationUrl: "https://old.example/hook" }],
        resource,
        webhookUrl,
        now,
      ).action,
    ).toBe("replace");
  });

  it("creates only missing categories", () => {
    const missing = missingMasterCategories([
      { displayName: "P1 — Immediate" },
      { displayName: "housing / landlord / moving" },
    ]);

    expect(missing.some((category) => category.displayName === "P1 — Immediate")).toBe(false);
    expect(missing.some((category) => category.displayName === "Housing / landlord / moving")).toBe(false);
    expect(missing.find((category) => category.displayName === "P2 — Urgent")?.color).toBe("preset1");
  });

  it("recolors managed categories without changing unrelated or matching categories", () => {
    expect(masterCategoryColorUpdates([
      { id: "p1", displayName: "P1 — Immediate", color: "preset12" },
      { id: "housing", displayName: " housing / landlord / moving ", color: "preset7" },
      { id: "staff", displayName: "Staff follow-up", color: "preset12" },
    ])).toEqual([{ id: "p1", color: "preset0" }]);
  });

  it("deletes and recreates a changed-endpoint subscription, then becomes idempotent", async () => {
    const operations: string[] = [];
    const categories = REQUIRED_MASTER_CATEGORIES.map((category, index) => ({
      id: `category-${index}`,
      ...category,
      color: index === 0 ? "preset12" : category.color,
    }));
    const subscriptions: GraphSubscription[] = [
      { ...subscription("2026-09-23T12:00:01.000Z"), notificationUrl: "https://old.example/hook" },
    ];
    const graph: ProvisioningGraphOperations = {
      async listMailFolders() {
        return [{ id: "folder-id", displayName: "Surrender Requests" }];
      },
      async createMailFolder() {
        throw new Error("folder should already exist");
      },
      async listMasterCategories() {
        return categories;
      },
      async createMasterCategory() {
        throw new Error("categories should already exist");
      },
      async updateMasterCategoryColor(id, color) {
        operations.push("recolor");
        const category = categories.find((item) => item.id === id);
        if (category) category.color = color;
      },
      async listSubscriptions() {
        return [...subscriptions];
      },
      async createSubscription(created) {
        operations.push("create");
        subscriptions.push({ id: "new-subscription-id", ...created });
      },
      async renewSubscription() {
        operations.push("renew");
      },
      async deleteSubscription(id) {
        operations.push("delete");
        subscriptions.splice(subscriptions.findIndex((item) => item.id === id), 1);
      },
    };
    const config = {
      microsoftAuthMode: "application",
      destinationFolderName: "Surrender Requests",
      mailbox: "intake@example.org",
      webhookUrl,
      webhookClientState: "client-state",
    } as Config;

    await provisionRuntime(graph, config, now);
    await provisionRuntime(graph, config, now);

    expect(operations).toEqual(["recolor", "delete", "create"]);
    expect(subscriptions).toHaveLength(1);
    expect(subscriptions[0]?.notificationUrl).toBe(webhookUrl);
    expect(subscriptions[0]?.lifecycleNotificationUrl).toBe(webhookUrl);
  });

  it("subscribes to the signed-in user's Inbox in delegated mode", async () => {
    let createdResource: string | undefined;
    const graph: ProvisioningGraphOperations = {
      async listMailFolders() {
        return [{ id: "folder-id", displayName: "Surrender Requests" }];
      },
      async createMailFolder() {
        throw new Error("folder should already exist");
      },
      async listMasterCategories() {
        return REQUIRED_MASTER_CATEGORIES.map((category) => ({ ...category }));
      },
      async createMasterCategory() {
        throw new Error("categories should already exist");
      },
      async updateMasterCategoryColor() {
        throw new Error("category colors should already match");
      },
      async listSubscriptions() {
        return [];
      },
      async createSubscription(created) {
        createdResource = created.resource;
      },
      async renewSubscription() {
        throw new Error("new subscription should not renew");
      },
      async deleteSubscription() {
        throw new Error("new subscription should not delete");
      },
    };
    const config = {
      microsoftAuthMode: "delegated",
      destinationFolderName: "Surrender Requests",
      webhookUrl,
      webhookClientState: "client-state",
    } as Config;

    await provisionRuntime(graph, config, now);

    expect(createdResource).toBe("me/mailFolders('inbox')/messages");
  });

  it("reauthorizes immediately even when the subscription has more than a day remaining", async () => {
    const renewals: Array<{ id: string; expiration: string }> = [];
    await reauthorizeSubscription(
      {
        async renewSubscription(id, expiration) {
          renewals.push({ id, expiration });
        },
      },
      "subscription-id",
      now,
    );

    expect(renewals).toEqual([{
      id: "subscription-id",
      expiration: "2026-09-24T12:00:00.000Z",
    }]);
  });
});
