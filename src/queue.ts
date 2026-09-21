import * as Sentry from "@sentry/cloudflare";

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

function jobAttributes(job: TriageQueueMessage): Record<string, string> {
  return job.kind === "message"
    ? { "triage.job.kind": job.kind, "triage.job.source": job.source }
    : { "triage.job.kind": job.kind, "triage.lifecycle.event": job.lifecycleEvent };
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
      Sentry.captureMessage("Invalid triage queue message", {
        level: "error",
        tags: { component: "queue", reason: "invalid-message" },
      });
      Sentry.metrics.count("triage.queue.jobs", 1, {
        attributes: { outcome: "invalid" },
      });
      queueMessage.ack();
      continue;
    }

    const id = job.kind === "message" ? job.messageId : job.subscriptionId;
    const attributes = jobAttributes(job);
    await Sentry.startSpan(
      {
        name: job.kind === "message" ? "Process triage message" : "Process Graph lifecycle event",
        op: "triage.queue.process",
        attributes: {
          ...attributes,
          "messaging.message.retry.count": Math.max((queueMessage.attempts ?? 1) - 1, 0),
        },
      },
      async (span) => {
        try {
          const result = await process(job);
          span.setAttribute("triage.job.result", result);
          Sentry.metrics.count("triage.queue.jobs", 1, {
            attributes: { ...attributes, outcome: result },
          });
          console.log(JSON.stringify({ jobId: id, stage: result }));
          queueMessage.ack();
        } catch (error) {
          span.setStatus(Sentry.getSpanStatusFromHttpCode(500));
          Sentry.captureException(error, {
            tags: { component: "queue", ...attributes },
          });
          Sentry.metrics.count("triage.queue.jobs", 1, {
            attributes: { ...attributes, outcome: "processing-failed" },
          });
          console.error(
            JSON.stringify({ jobId: id, stage: "processing-failed", error: safeError(error) }),
          );
          queueMessage.retry({ delaySeconds: 60 });
        }
      },
    );
  }
}
