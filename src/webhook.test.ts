import { describe, expect, it } from "bun:test";

import type { TriageQueueMessage } from "./config";
import { handleGraphWebhook } from "./webhook";

function fakeQueue(sent: TriageQueueMessage[]): Queue<TriageQueueMessage> {
  return {
    async send(message: TriageQueueMessage) {
      sent.push(message);
      return {} as QueueSendResponse;
    },
  } as Queue<TriageQueueMessage>;
}

describe("Graph webhook", () => {
  it("echoes Graph's validation token as plain text", async () => {
    const response = await handleGraphWebhook(
      new Request("https://worker.example/webhooks/graph?validationToken=a%2Bb%20c", {
        method: "POST",
      }),
      "expected-state",
      fakeQueue([]),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toContain("text/plain");
    expect(await response.text()).toBe("a+b c");
  });

  it("rejects the entire notification payload when clientState is wrong", async () => {
    const sent: TriageQueueMessage[] = [];
    const response = await handleGraphWebhook(
      new Request("https://worker.example/webhooks/graph", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          value: [
            {
              clientState: "wrong-state",
              changeType: "created",
              resourceData: { id: "message-1" },
            },
          ],
        }),
      }),
      "expected-state",
      fakeQueue(sent),
    );

    expect(response.status).toBe(401);
    expect(sent).toEqual([]);
  });

  it("enqueues created messages and authenticated lifecycle notifications", async () => {
    const sent: TriageQueueMessage[] = [];
    const response = await handleGraphWebhook(
      new Request("https://worker.example/webhooks/graph", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          value: [
            {
              clientState: "expected-state",
              changeType: "created",
              resourceData: { id: "immutable-message-id" },
            },
            {
              clientState: "expected-state",
              subscriptionId: "subscription-id",
              lifecycleEvent: "reauthorizationRequired",
            },
          ],
        }),
      }),
      "expected-state",
      fakeQueue(sent),
    );

    expect(response.status).toBe(202);
    expect(sent).toEqual([
      { kind: "message", messageId: "immutable-message-id", source: "webhook" },
      {
        kind: "lifecycle",
        subscriptionId: "subscription-id",
        lifecycleEvent: "reauthorizationRequired",
      },
    ]);
  });
});
