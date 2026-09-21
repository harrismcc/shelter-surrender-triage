import type { Config, TriageQueueMessage } from "./config";
import { isMatchingSubmission } from "./domain";
import type { GraphClient } from "./graph";

export async function reconcileInbox(
  graph: GraphClient,
  queue: Queue<TriageQueueMessage>,
  config: Config,
  now = new Date(),
): Promise<number> {
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
  return matching.length;
}
