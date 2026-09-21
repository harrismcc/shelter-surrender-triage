export interface WorkerEnv {
  MICROSOFT_AUTH_MODE?: string;
  MICROSOFT_TENANT_ID: string;
  MICROSOFT_CLIENT_ID: string;
  MICROSOFT_CLIENT_SECRET?: string;
  MICROSOFT_REFRESH_TOKEN?: string;
  OUTLOOK_SHARED_MAILBOX?: string;
  TRIAGE_EXACT_SENDER: string;
  TRIAGE_EXACT_SUBJECT: string;
  SURRENDER_FOLDER_NAME?: string;
  PUBLIC_BASE_URL: string;
  GRAPH_WEBHOOK_CLIENT_STATE: string;
  TYPESAFE_API_KEY: string;
  TYPESAFE_MODEL?: string;
  RECONCILIATION_LOOKBACK_MINUTES?: string;
  RECONCILIATION_MAX_MESSAGES?: string;
  SENTRY_RELEASE?: string;
  TRIAGE_QUEUE: Queue<TriageQueueMessage>;
}

export interface MessageQueueJob {
  kind: "message";
  messageId: string;
  source: "webhook" | "reconciliation";
}

export interface LifecycleQueueJob {
  kind: "lifecycle";
  subscriptionId: string;
  lifecycleEvent: "reauthorizationRequired" | "subscriptionRemoved" | "missed";
}

export type TriageQueueMessage = MessageQueueJob | LifecycleQueueJob;

export type MicrosoftAuthMode = "application" | "delegated";

export interface Config {
  microsoftAuthMode: MicrosoftAuthMode;
  microsoftTenantId: string;
  microsoftClientId: string;
  microsoftClientSecret?: string;
  microsoftRefreshToken?: string;
  mailbox?: string;
  exactSender: string;
  exactSubject: string;
  destinationFolderName: string;
  webhookUrl: string;
  webhookClientState: string;
  typeSafeApiKey: string;
  typeSafeModel: string;
  reconciliationLookbackMinutes: number;
  reconciliationMaxMessages: number;
}

function required(env: WorkerEnv, name: keyof WorkerEnv): string {
  const value = env[name];
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`Missing required configuration: ${name}`);
  }
  return value.trim();
}

function positiveInteger(value: string | undefined, fallback: number, name: string): number {
  if (value === undefined || value.trim() === "") return fallback;
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    throw new Error(`${name} must be a positive integer`);
  }
  return parsed;
}

export function readConfig(env: WorkerEnv): Config {
  const publicBaseUrl = required(env, "PUBLIC_BASE_URL").replace(/\/+$/, "");
  const microsoftAuthMode = env.MICROSOFT_AUTH_MODE?.trim() || "application";
  if (microsoftAuthMode !== "application" && microsoftAuthMode !== "delegated") {
    throw new Error("MICROSOFT_AUTH_MODE must be application or delegated");
  }
  return {
    microsoftAuthMode,
    microsoftTenantId: required(env, "MICROSOFT_TENANT_ID"),
    microsoftClientId: required(env, "MICROSOFT_CLIENT_ID"),
    microsoftClientSecret:
      microsoftAuthMode === "application"
        ? required(env, "MICROSOFT_CLIENT_SECRET")
        : undefined,
    microsoftRefreshToken:
      microsoftAuthMode === "delegated"
        ? required(env, "MICROSOFT_REFRESH_TOKEN")
        : undefined,
    mailbox:
      microsoftAuthMode === "application"
        ? required(env, "OUTLOOK_SHARED_MAILBOX")
        : undefined,
    exactSender: required(env, "TRIAGE_EXACT_SENDER"),
    exactSubject: required(env, "TRIAGE_EXACT_SUBJECT"),
    destinationFolderName: env.SURRENDER_FOLDER_NAME?.trim() || "Surrender Requests",
    webhookUrl: `${publicBaseUrl}/webhooks/graph`,
    webhookClientState: required(env, "GRAPH_WEBHOOK_CLIENT_STATE"),
    typeSafeApiKey: required(env, "TYPESAFE_API_KEY"),
    typeSafeModel: env.TYPESAFE_MODEL?.trim() || "jev-1.13.0",
    reconciliationLookbackMinutes: positiveInteger(
      env.RECONCILIATION_LOOKBACK_MINUTES,
      180,
      "RECONCILIATION_LOOKBACK_MINUTES",
    ),
    reconciliationMaxMessages: positiveInteger(
      env.RECONCILIATION_MAX_MESSAGES,
      250,
      "RECONCILIATION_MAX_MESSAGES",
    ),
  };
}
