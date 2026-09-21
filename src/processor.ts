import type { Classifier } from "./classifier";
import type { Config } from "./config";
import {
  isMatchingSubmission,
  mergeOutlookCategories,
  outlookImportance,
} from "./domain";
import type { GraphOperations } from "./graph";

export type ProcessResult = "processed" | "not-matching" | "already-moved-or-missing";

export async function processMessage(
  messageId: string,
  config: Pick<Config, "exactSender" | "exactSubject" | "destinationFolderName">,
  graph: GraphOperations,
  classifier: Classifier,
): Promise<ProcessResult> {
  const [inboxId, message] = await Promise.all([
    graph.getInboxId(),
    graph.getMessage(messageId),
  ]);

  if (!message || message.parentFolderId !== inboxId) {
    return "already-moved-or-missing";
  }
  if (!isMatchingSubmission(message, config.exactSender, config.exactSubject)) {
    return "not-matching";
  }

  const destinationFolderId = await graph.findMailFolderId(config.destinationFolderName);
  if (!destinationFolderId) {
    throw new Error("Destination folder has not been provisioned");
  }

  const classification = await classifier.classify(
    message.subject ?? "",
    message.body?.content ?? "",
  );
  const latestMessage = await graph.getMessage(message.id);
  if (!latestMessage || latestMessage.parentFolderId !== inboxId) {
    return "already-moved-or-missing";
  }
  const categories = mergeOutlookCategories(latestMessage.categories ?? [], classification);
  await graph.updateMessageTriage(
    latestMessage.id,
    categories,
    outlookImportance(classification.priority),
  );
  await graph.moveMessage(latestMessage.id, destinationFolderId);
  return "processed";
}
