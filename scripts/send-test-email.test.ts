import { describe, expect, it } from "bun:test";

import { readTestEmailConfig, sendTestEmail } from "./send-test-email";

describe("test email sender", () => {
  it("uses delegated repo configuration and requires a local refresh token", () => {
    const config = readTestEmailConfig(
      { MICROSOFT_REFRESH_TOKEN: "refresh-token" },
      {
        vars: {
          MICROSOFT_AUTH_MODE: "delegated",
          MICROSOFT_TENANT_ID: "consumers",
          MICROSOFT_CLIENT_ID: "client-id",
          TRIAGE_EXACT_SENDER: "developer@example.org",
          TRIAGE_EXACT_SUBJECT: "Pet Surrender Request",
        },
      },
    );

    expect(config).toEqual({
      tenantId: "consumers",
      clientId: "client-id",
      refreshToken: "refresh-token",
      recipient: "developer@example.org",
      subject: "Pet Surrender Request",
    });
    expect(() => readTestEmailConfig({}, { vars: { MICROSOFT_AUTH_MODE: "application" } })).toThrow(
      "requires MICROSOFT_AUTH_MODE=delegated",
    );
  });

  it("requests Mail.Send and sends the exact triage subject and arbitrary body to the test account", async () => {
    const requests: Array<{ url: string; init?: RequestInit }> = [];
    const fetcher = async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
      requests.push({ url: input.toString(), init });
      return requests.length === 1
        ? Response.json({ access_token: "access-token" })
        : new Response(null, { status: 202 });
    };

    await sendTestEmail(
      {
        tenantId: "consumers",
        clientId: "client-id",
        refreshToken: "refresh-token",
        recipient: "developer@example.org",
        subject: "Pet Surrender Request",
      },
      "  Custom body\nwith details\n",
      fetcher as typeof fetch,
    );

    const tokenBody = requests[0]?.init?.body as URLSearchParams;
    expect(tokenBody.get("scope")).toContain("https://graph.microsoft.com/Mail.Send");
    expect(requests[1]?.url).toBe("https://graph.microsoft.com/v1.0/me/sendMail");
    expect(JSON.parse(requests[1]?.init?.body as string)).toEqual({
      message: {
        subject: "Pet Surrender Request",
        body: { contentType: "Text", content: "  Custom body\nwith details\n" },
        from: { emailAddress: { address: "developer@example.org" } },
        toRecipients: [{ emailAddress: { address: "developer@example.org" } }],
      },
      saveToSentItems: true,
    });
  });
});
