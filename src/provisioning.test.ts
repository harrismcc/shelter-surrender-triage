import { describe, expect, it } from "bun:test";

import type { Config } from "./config";
import type { GraphSubscription, ProvisioningGraphOperations } from "./graph";
import {
  decideSubscription,
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

  it("creates only missing categories without changing an existing category", () => {
    const missing = missingMasterCategories([
      { displayName: "P1 — Immediate" },
      { displayName: "housing / landlord / moving" },
    ]);

    expect(missing.some((category) => category.displayName === "P1 — Immediate")).toBe(false);
    expect(missing.some((category) => category.displayName === "Housing / landlord / moving")).toBe(false);
    expect(missing.find((category) => category.displayName === "P2 — Urgent")?.color).toBe("preset1");
  });

  it("deletes and recreates a changed-endpoint subscription, then becomes idempotent", async () => {
    const operations: string[] = [];
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
        return REQUIRED_MASTER_CATEGORIES.map((category) => ({ ...category }));
      },
      async createMasterCategory() {
        throw new Error("categories should already exist");
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
      destinationFolderName: "Surrender Requests",
      mailbox: "intake@example.org",
      webhookUrl,
      webhookClientState: "client-state",
    } as Config;

    await provisionRuntime(graph, config, now);
    await provisionRuntime(graph, config, now);

    expect(operations).toEqual(["delete", "create"]);
    expect(subscriptions).toHaveLength(1);
    expect(subscriptions[0]?.notificationUrl).toBe(webhookUrl);
    expect(subscriptions[0]?.lifecycleNotificationUrl).toBe(webhookUrl);
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
