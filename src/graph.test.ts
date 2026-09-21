import { describe, expect, it } from "bun:test";

import type { Config } from "./config";
import { GraphClient } from "./graph";

const config: Config = {
  microsoftAuthMode: "application",
  microsoftTenantId: "tenant-id",
  microsoftClientId: "client-id",
  microsoftClientSecret: "client-secret",
  mailbox: "intake@example.org",
  exactSender: "forms@example.org",
  exactSubject: "Surrender form",
  destinationFolderName: "Surrender Requests",
  webhookUrl: "https://worker.example/webhooks/graph",
  webhookClientState: "client-state",
  typeSafeApiKey: "typesafe-key",
  typeSafeModel: "jev-1.13.0",
  reconciliationLookbackMinutes: 180,
  reconciliationMaxMessages: 250,
};

describe("Microsoft Graph client", () => {
  it("uses app-only credentials and requests immutable IDs plus a text message body", async () => {
    const requests: Array<{ url: string; init?: RequestInit }> = [];
    const receivers: unknown[] = [];
    const fetcher = async function (
      this: unknown,
      input: string | URL | Request,
      init?: RequestInit,
    ): Promise<Response> {
      receivers.push(this);
      const url = input.toString();
      requests.push({ url, init });
      if (url.startsWith("https://login.microsoftonline.com/")) {
        return Response.json({ access_token: "access-token", expires_in: 3600 });
      }
      return Response.json({
        id: "immutable-id",
        parentFolderId: "inbox-id",
        subject: "Surrender form",
        body: { content: "plain text" },
      });
    };

    const message = await new GraphClient(config, fetcher as typeof fetch).getMessage("id/with+symbols");

    expect(message?.id).toBe("immutable-id");
    expect(receivers).toEqual([undefined, undefined]);
    const tokenBody = requests[0]?.init?.body as URLSearchParams;
    expect(tokenBody.get("grant_type")).toBe("client_credentials");
    expect(tokenBody.get("scope")).toBe("https://graph.microsoft.com/.default");
    expect(requests[1]?.url).toContain("/users/intake%40example.org/messages/id%2Fwith%2Bsymbols");
    const prefer = new Headers(requests[1]?.init?.headers).get("Prefer");
    expect(prefer).toContain('IdType="ImmutableId"');
    expect(prefer).toContain('outlook.body-content-type="text"');
  });

  it("uses a delegated refresh token and the signed-in user's mailbox", async () => {
    const requests: Array<{ url: string; init?: RequestInit }> = [];
    const fetcher = async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
      const url = input.toString();
      requests.push({ url, init });
      if (url.startsWith("https://login.microsoftonline.com/")) {
        return Response.json({
          access_token: "access-token",
          refresh_token: "rotated-refresh-token",
          expires_in: 3600,
        });
      }
      return Response.json({
        id: "immutable-id",
        parentFolderId: "inbox-id",
        subject: "Surrender form",
        body: { content: "plain text" },
      });
    };
    const delegatedConfig: Config = {
      ...config,
      microsoftAuthMode: "delegated",
      microsoftTenantId: "consumers",
      microsoftClientSecret: undefined,
      microsoftRefreshToken: "refresh-token",
      mailbox: undefined,
    };

    await new GraphClient(delegatedConfig, fetcher as typeof fetch).getMessage("message-id");

    expect(requests[0]?.url).toContain("login.microsoftonline.com/consumers/");
    const tokenBody = requests[0]?.init?.body as URLSearchParams;
    expect(tokenBody.get("grant_type")).toBe("refresh_token");
    expect(tokenBody.get("refresh_token")).toBe("refresh-token");
    expect(tokenBody.has("client_secret")).toBe(false);
    expect(requests[1]?.url).toContain("graph.microsoft.com/v1.0/me/messages/message-id");
  });

  it("lists subscriptions without unsupported query parameters and follows pagination", async () => {
    const requestedUrls: string[] = [];
    const secondPage = "https://graph.microsoft.com/v1.0/subscriptions?page=2";
    const fetcher = async (input: string | URL | Request): Promise<Response> => {
      const url = input.toString();
      requestedUrls.push(url);
      if (url.startsWith("https://login.microsoftonline.com/")) {
        return Response.json({ access_token: "access-token", expires_in: 3600 });
      }
      if (url === "https://graph.microsoft.com/v1.0/subscriptions") {
        return Response.json({
          value: [{ id: "first" }],
          "@odata.nextLink": secondPage,
        });
      }
      if (url === secondPage) return Response.json({ value: [{ id: "second" }] });
      return new Response(null, { status: 404 });
    };

    const subscriptions = await new GraphClient(
      config,
      fetcher as typeof fetch,
    ).listSubscriptions();

    expect(subscriptions.map((item) => item.id)).toEqual(["first", "second"]);
    expect(requestedUrls).toContain("https://graph.microsoft.com/v1.0/subscriptions");
    expect(requestedUrls.some((url) => url.includes("subscriptions?$top"))).toBe(false);
  });

  it("finds folders and categories that appear only on later pages", async () => {
    const folderPage2 = "https://graph.microsoft.com/v1.0/folders?page=2";
    const categoryPage2 = "https://graph.microsoft.com/v1.0/categories?page=2";
    const fetcher = async (input: string | URL | Request): Promise<Response> => {
      const url = input.toString();
      if (url.startsWith("https://login.microsoftonline.com/")) {
        return Response.json({ access_token: "access-token", expires_in: 3600 });
      }
      if (url.includes("/mailFolders?")) {
        return Response.json({
          value: [{ id: "other", displayName: "Other" }],
          "@odata.nextLink": folderPage2,
        });
      }
      if (url === folderPage2) {
        return Response.json({
          value: [{ id: "destination", displayName: "Surrender Requests" }],
        });
      }
      if (url.includes("/outlook/masterCategories?")) {
        return Response.json({
          value: [{ displayName: "Staff", color: "preset4" }],
          "@odata.nextLink": categoryPage2,
        });
      }
      if (url === categoryPage2) {
        return Response.json({
          value: [{ displayName: "P1 — Immediate", color: "preset0" }],
        });
      }
      return new Response(null, { status: 404 });
    };
    const graph = new GraphClient(config, fetcher as typeof fetch);

    expect(await graph.findMailFolderId("Surrender Requests")).toBe("destination");
    expect((await graph.listMasterCategories()).map((item) => item.displayName)).toEqual([
      "Staff",
      "P1 — Immediate",
    ]);
  });
});
