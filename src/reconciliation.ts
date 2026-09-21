import * as Sentry from "@sentry/cloudflare";

import type { Config, TriageQueueMessage } from "./config";
import { isMatchingSubmission } from "./domain";
import type { GraphClient } from "./graph";

export async function reconcileInbox(
  graph: GraphClient,
  queue: Queue<TriageQueueMessage>,
  config: Config,
  now = new Date(),
): Promise<number> {
  return Sentry.startSpan(
    {
      name: "Reconcile recent inbox",
      op: "triage.reconcile",
      attributes: {
        "triage.reconciliation.lookback_minutes": config.reconciliationLookbackMinutes,
        "triage.reconciliation.max_messages": config.reconciliationMaxMessages,
      },
    },
    async (span) => {
      const since = new Date(now.getTime() - config.reconciliationLookbackMinutes * 60_000);
      const messages = await graph.listRecentInboxMessages(
        since,
        config.reconciliationMaxMessages,
      );
      const matching = messages.filter((message) =>
        isMatchingSubmission(message, config.exactSender, config.exactSubject),
      );
      for (const message of matching) {
        await queue.send({
          kind: "message",
          messageId: message.id,
          source: "reconciliation",
        });
      }
      span.setAttributes({
        "triage.reconciliation.scanned": messages.length,
        "triage.reconciliation.enqueued": matching.length,
      });
      Sentry.metrics.distribution("triage.reconciliation.scanned", messages.length);
      Sentry.metrics.distribution("triage.reconciliation.enqueued", matching.length);
      return matching.length;
    },
  );
}
