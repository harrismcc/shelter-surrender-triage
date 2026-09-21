import type { TriageQueueMessage } from "./config";

interface GraphNotification {
  subscriptionId?: string;
  clientState?: string;
  changeType?: string;
  lifecycleEvent?: string;
  resource?: string;
  resourceData?: { id?: string };
}

const LIFECYCLE_EVENTS = new Set([
  "reauthorizationRequired",
  "subscriptionRemoved",
  "missed",
] as const);

interface GraphNotificationPayload {
  value?: GraphNotification[];
}

function messageId(notification: GraphNotification): string | null {
  if (notification.resourceData?.id) return notification.resourceData.id;
  const match = notification.resource?.match(/\/messages\/([^/?]+)$/i);
  return match?.[1] ? decodeURIComponent(match[1]) : null;
}

export async function handleGraphWebhook(
  request: Request,
  expectedClientState: string,
  queue: Queue<TriageQueueMessage>,
): Promise<Response> {
  const validationToken = new URL(request.url).searchParams.get("validationToken");
  if (validationToken !== null) {
    return new Response(validationToken, {
      status: 200,
      headers: { "Content-Type": "text/plain" },
    });
  }

  let payload: GraphNotificationPayload;
  try {
    payload = (await request.json()) as GraphNotificationPayload;
  } catch {
    return Response.json({ error: "Invalid notification payload" }, { status: 400 });
  }
  if (!Array.isArray(payload.value)) {
    return Response.json({ error: "Invalid notification payload" }, { status: 400 });
  }
  if (payload.value.some((notification) => notification.clientState !== expectedClientState)) {
    return Response.json({ error: "Invalid client state" }, { status: 401 });
  }

  const messageJobs: TriageQueueMessage[] = payload.value
    .filter(
      (notification) =>
        notification.changeType === "created" && notification.lifecycleEvent === undefined,
    )
    .map(messageId)
    .filter((id): id is string => id !== null)
    .map((id) => ({ kind: "message", messageId: id, source: "webhook" }));
  const lifecycleJobs: TriageQueueMessage[] = payload.value.flatMap((notification) => {
    if (
      !notification.subscriptionId ||
      !notification.lifecycleEvent ||
      !LIFECYCLE_EVENTS.has(
        notification.lifecycleEvent as "reauthorizationRequired" | "subscriptionRemoved" | "missed",
      )
    ) {
      return [];
    }
    return [{
      kind: "lifecycle" as const,
      subscriptionId: notification.subscriptionId,
      lifecycleEvent: notification.lifecycleEvent as
        | "reauthorizationRequired"
        | "subscriptionRemoved"
        | "missed",
    }];
  });
  await Promise.all(
    [...messageJobs, ...lifecycleJobs].map((job) => queue.send(job)),
  );
  return new Response(null, { status: 202 });
}
