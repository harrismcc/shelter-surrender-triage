import { JevClassifier } from "./classifier";
import { readConfig, type TriageQueueMessage, type WorkerEnv } from "./config";
import { GraphClient } from "./graph";
import { processMessage } from "./processor";
import { provisionRuntime, reauthorizeSubscription } from "./provisioning";
import { consumeQueueBatch } from "./queue";
import { reconcileInbox } from "./reconciliation";
import { handleGraphWebhook } from "./webhook";

const worker = {
  async fetch(request: Request, env?: WorkerEnv): Promise<Response> {
    const url = new URL(request.url);

    if (request.method === "GET" && url.pathname === "/health") {
      return Response.json(
        { status: "ok" },
        { headers: { "Cache-Control": "no-store" } },
      );
    }

    if (request.method === "GET" && url.pathname === "/") {
      return Response.json({
        name: "shelter-surrender-triage",
        status: "ready",
      });
    }

    if (request.method === "POST" && url.pathname === "/webhooks/graph") {
      if (!env) return Response.json({ error: "Worker environment unavailable" }, { status: 500 });
      return handleGraphWebhook(
        request,
        env.GRAPH_WEBHOOK_CLIENT_STATE,
        env.TRIAGE_QUEUE,
      );
    }

    return Response.json({ error: "Not found" }, { status: 404 });
  },

  async scheduled(_controller: ScheduledController, env: WorkerEnv): Promise<void> {
    const config = readConfig(env);
    const graph = new GraphClient(config);
    await provisionRuntime(graph, config);
    const enqueued = await reconcileInbox(graph, env.TRIAGE_QUEUE, config);
    console.log(JSON.stringify({ stage: "reconciliation-complete", enqueued }));
  },

  async queue(batch: MessageBatch<TriageQueueMessage>, env: WorkerEnv): Promise<void> {
    const config = readConfig(env);
    await consumeQueueBatch(batch, async (job) => {
      const graph = new GraphClient(config);
      if (job.kind === "message") {
        return processMessage(
          job.messageId,
          config,
          graph,
          new JevClassifier(config.typeSafeApiKey, config.typeSafeModel),
        );
      }
      if (job.lifecycleEvent === "reauthorizationRequired") {
        await reauthorizeSubscription(graph, job.subscriptionId);
        return "subscription-reauthorized";
      }
      if (job.lifecycleEvent === "subscriptionRemoved") {
        await provisionRuntime(graph, config);
        await reconcileInbox(graph, env.TRIAGE_QUEUE, config);
        return "subscription-reprovisioned";
      }
      await reconcileInbox(graph, env.TRIAGE_QUEUE, config);
      return "missed-notifications-reconciled";
    });
  },
} satisfies ExportedHandler<WorkerEnv, TriageQueueMessage>;

export default worker;
