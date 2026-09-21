import type { TriageQueueMessage } from "./config";
import { GraphError } from "./graph";
import type { ProcessResult } from "./processor";

export type QueueProcessResult =
  | ProcessResult
  | "subscription-reauthorized"
  | "subscription-reprovisioned"
  | "missed-notifications-reconciled";

function safeError(error: unknown): Record<string, unknown> {
  if (error instanceof GraphError) {
    return { name: error.name, stage: error.stage, status: error.status };
  }
  return { name: error instanceof Error ? error.name : "UnknownError" };
}

export async function consumeQueueBatch(
  batch: MessageBatch<TriageQueueMessage>,
  process: (job: TriageQueueMessage) => Promise<QueueProcessResult>,
): Promise<void> {
  for (const queueMessage of batch.messages) {
    const job = queueMessage.body;
    const validMessage =
      job?.kind === "message" &&
      typeof job.messageId === "string" &&
      job.messageId.length > 0;
    const validLifecycle =
      job?.kind === "lifecycle" &&
      typeof job.subscriptionId === "string" &&
      job.subscriptionId.length > 0 &&
      ["reauthorizationRequired", "subscriptionRemoved", "missed"].includes(
        job.lifecycleEvent,
      );
    if (!validMessage && !validLifecycle) {
      console.error(JSON.stringify({ stage: "invalid-queue-message" }));
      queueMessage.ack();
      continue;
    }

    const id = job.kind === "message" ? job.messageId : job.subscriptionId;
    try {
      const result = await process(job);
      console.log(JSON.stringify({ jobId: id, stage: result }));
      queueMessage.ack();
    } catch (error) {
      console.error(
        JSON.stringify({ jobId: id, stage: "processing-failed", error: safeError(error) }),
      );
      queueMessage.retry({ delaySeconds: 60 });
    }
  }
}
