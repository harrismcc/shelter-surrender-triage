import { describe, expect, it } from "bun:test";

import { readConfig, type WorkerEnv } from "./config";

const shared = {
  MICROSOFT_TENANT_ID: "tenant-id",
  MICROSOFT_CLIENT_ID: "client-id",
  TRIAGE_EXACT_SENDER: "forms@example.org",
  TRIAGE_EXACT_SUBJECT: "Surrender form",
  PUBLIC_BASE_URL: "https://worker.example",
  GRAPH_WEBHOOK_CLIENT_STATE: "client-state",
  TYPESAFE_API_KEY: "typesafe-key",
  TRIAGE_QUEUE: {} as Queue,
};

describe("Microsoft authentication configuration", () => {
  it("defaults to application auth and requires its mailbox credentials", () => {
    expect(() => readConfig(shared as WorkerEnv)).toThrow(
      "Missing required configuration: MICROSOFT_CLIENT_SECRET",
    );

    const config = readConfig({
      ...shared,
      MICROSOFT_CLIENT_SECRET: "client-secret",
      OUTLOOK_SHARED_MAILBOX: "intake@example.org",
    });
    expect(config.microsoftAuthMode).toBe("application");
    expect(config.mailbox).toBe("intake@example.org");
    expect(config.microsoftRefreshToken).toBeUndefined();
  });

  it("accepts delegated auth without an application secret or shared mailbox", () => {
    const config = readConfig({
      ...shared,
      MICROSOFT_AUTH_MODE: "delegated",
      MICROSOFT_REFRESH_TOKEN: "refresh-token",
    });

    expect(config.microsoftAuthMode).toBe("delegated");
    expect(config.microsoftRefreshToken).toBe("refresh-token");
    expect(config.microsoftClientSecret).toBeUndefined();
    expect(config.mailbox).toBeUndefined();
  });

  it("rejects an unknown authentication mode", () => {
    expect(() => readConfig({
      ...shared,
      MICROSOFT_AUTH_MODE: "password",
    })).toThrow("MICROSOFT_AUTH_MODE must be application or delegated");
  });
});
