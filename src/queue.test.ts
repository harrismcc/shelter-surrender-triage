import { describe, expect, it, spyOn } from "bun:test";

import type { TriageQueueMessage } from "./config";
import { consumeQueueBatch } from "./queue";

function queueBatch(body: TriageQueueMessage) {
  const calls: string[] = [];
  let retryOptions: QueueRetryOptions | undefined;
  const message = {
    body,
    ack() {
      calls.push("ack");
    },
    retry(options?: QueueRetryOptions) {
      calls.push("retry");
      retryOptions = options;
    },
  } as Message<TriageQueueMessage>;
  return {
    batch: { messages: [message] } as unknown as MessageBatch<TriageQueueMessage>,
    calls,
    retryOptions: () => retryOptions,
  };
}

describe("Queue failure handling", () => {
  it("requests a delayed retry instead of acknowledging a transient processing failure", async () => {
    const item = queueBatch({
      kind: "message",
      messageId: "immutable-id",
      source: "webhook",
    });
    const errorLog = spyOn(console, "error").mockImplementation(() => {});
    try {
      await consumeQueueBatch(item.batch, async () => {
        throw new Error("message body must never be logged");
      });
    } finally {
      errorLog.mockRestore();
    }

    expect(item.calls).toEqual(["retry"]);
    expect(item.retryOptions()).toEqual({ delaySeconds: 60 });
    expect(errorLog.mock.calls.flat().join(" ")).not.toContain("message body must never be logged");
  });
});
