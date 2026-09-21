import { MICROSOFT_GRAPH_SCOPES } from "./microsoft-device-auth";

interface TestEmailConfig {
  tenantId: string;
  clientId: string;
  refreshToken: string;
  recipient: string;
  subject: string;
}

interface WranglerConfig {
  vars?: Record<string, unknown>;
}

function required(name: string, value: unknown): string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`Missing ${name}`);
  }
  return value.trim();
}

function emailBody(value: string): string {
  if (value.trim() === "") throw new Error("Missing email body");
  return value;
}

export function readTestEmailConfig(
  env: Record<string, string | undefined>,
  wrangler: WranglerConfig,
): TestEmailConfig {
  const vars = wrangler.vars ?? {};
  const authMode = env.MICROSOFT_AUTH_MODE ?? vars.MICROSOFT_AUTH_MODE;
  if (authMode !== "delegated") {
    throw new Error("Test email sending requires MICROSOFT_AUTH_MODE=delegated");
  }

  return {
    tenantId: required("MICROSOFT_TENANT_ID", env.MICROSOFT_TENANT_ID ?? vars.MICROSOFT_TENANT_ID),
    clientId: required("MICROSOFT_CLIENT_ID", env.MICROSOFT_CLIENT_ID ?? vars.MICROSOFT_CLIENT_ID),
    refreshToken: required("MICROSOFT_REFRESH_TOKEN", env.MICROSOFT_REFRESH_TOKEN),
    recipient: required("TRIAGE_EXACT_SENDER", env.TRIAGE_EXACT_SENDER ?? vars.TRIAGE_EXACT_SENDER),
    subject: required("TRIAGE_EXACT_SUBJECT", env.TRIAGE_EXACT_SUBJECT ?? vars.TRIAGE_EXACT_SUBJECT),
  };
}

export async function sendTestEmail(
  config: TestEmailConfig,
  body: string,
  fetcher: typeof fetch = fetch,
): Promise<void> {
  const tokenResponse = await fetcher(
    `https://login.microsoftonline.com/${encodeURIComponent(config.tenantId)}/oauth2/v2.0/token`,
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: config.clientId,
        refresh_token: config.refreshToken,
        scope: MICROSOFT_GRAPH_SCOPES,
        grant_type: "refresh_token",
      }),
    },
  );
  if (!tokenResponse.ok) {
    throw new Error(
      `Microsoft authentication failed (${tokenResponse.status}). Reauthorize the delegated account with Mail.Send consent.`,
    );
  }

  const token = (await tokenResponse.json()) as { access_token?: string };
  if (!token.access_token) throw new Error("Microsoft authentication returned no access token");

  const sendResponse = await fetcher("https://graph.microsoft.com/v1.0/me/sendMail", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token.access_token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      message: {
        subject: config.subject,
        body: { contentType: "Text", content: body },
        from: { emailAddress: { address: config.recipient } },
        toRecipients: [{ emailAddress: { address: config.recipient } }],
      },
      saveToSentItems: true,
    }),
  });
  if (!sendResponse.ok) {
    throw new Error(`Microsoft Graph sendMail failed (${sendResponse.status})`);
  }
}

async function bodyFromArgs(args: string[]): Promise<string> {
  if (args[0] === "--body" && args.length === 2) return emailBody(args[1] ?? "");
  if (args[0] === "--body-file" && args.length === 2) {
    const path = required("body file", args[1]);
    return emailBody(path === "-" ? await Bun.stdin.text() : await Bun.file(path).text());
  }
  if (args.length === 0 && !process.stdin.isTTY) return emailBody(await Bun.stdin.text());
  throw new Error(
    "Usage: bun run send-test-email --body 'text'\n" +
      "   or: bun run send-test-email --body-file path\n" +
      "   or: printf 'text' | bun run send-test-email",
  );
}

async function main(): Promise<void> {
  const wrangler = Bun.JSONC.parse(await Bun.file(`${import.meta.dir}/../wrangler.jsonc`).text()) as WranglerConfig;
  if (!process.env.MICROSOFT_REFRESH_TOKEN) {
    throw new Error("Missing MICROSOFT_REFRESH_TOKEN. Run `bun run authorize-microsoft` once.");
  }
  const config = readTestEmailConfig(process.env, wrangler);
  const body = await bodyFromArgs(process.argv.slice(2));
  await sendTestEmail(config, body);
  console.log(`Sent test email to ${config.recipient} with subject ${JSON.stringify(config.subject)}.`);
}

if (import.meta.main) {
  await main();
}
