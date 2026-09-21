export const MICROSOFT_GRAPH_SCOPES = [
  "offline_access",
  "https://graph.microsoft.com/Mail.ReadWrite",
  "https://graph.microsoft.com/MailboxSettings.ReadWrite",
  "https://graph.microsoft.com/Mail.Send",
].join(" ");

interface DeviceAuthorizationPrompt {
  verificationUri: string;
  userCode: string;
  message?: string;
}

interface DeviceAuthorizationOptions {
  tenantId: string;
  clientId: string;
  fetcher?: typeof fetch;
  sleep?: (milliseconds: number) => Promise<void>;
  onPrompt: (prompt: DeviceAuthorizationPrompt) => void;
}

interface OAuthError {
  error?: string;
}

export async function authorizeMicrosoftDevice(
  options: DeviceAuthorizationOptions,
): Promise<string> {
  const fetcher = options.fetcher ?? fetch;
  const sleep = options.sleep ?? ((milliseconds) => Bun.sleep(milliseconds));
  const oauthRoot = `https://login.microsoftonline.com/${encodeURIComponent(options.tenantId)}/oauth2/v2.0`;
  const deviceResponse = await fetcher(`${oauthRoot}/devicecode`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: options.clientId,
      scope: MICROSOFT_GRAPH_SCOPES,
    }),
  });
  if (!deviceResponse.ok) {
    throw new Error(`Microsoft device authorization failed (${deviceResponse.status})`);
  }

  const device = (await deviceResponse.json()) as {
    device_code?: string;
    user_code?: string;
    verification_uri?: string;
    message?: string;
    expires_in?: number;
    interval?: number;
  };
  if (!device.device_code || !device.user_code || !device.verification_uri) {
    throw new Error("Microsoft device authorization returned an invalid response");
  }
  options.onPrompt({
    verificationUri: device.verification_uri,
    userCode: device.user_code,
    message: device.message,
  });

  const expiresAt = Date.now() + (device.expires_in ?? 900) * 1_000;
  let interval = (device.interval ?? 5) * 1_000;
  while (Date.now() < expiresAt) {
    await sleep(interval);
    const tokenResponse = await fetcher(`${oauthRoot}/token`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "urn:ietf:params:oauth:grant-type:device_code",
        client_id: options.clientId,
        device_code: device.device_code,
      }),
    });
    const token = (await tokenResponse.json()) as OAuthError & { refresh_token?: string };
    if (tokenResponse.ok) {
      if (!token.refresh_token) throw new Error("Microsoft authorization returned no refresh token");
      return token.refresh_token;
    }
    if (token.error === "authorization_pending") continue;
    if (token.error === "slow_down") {
      interval += 5_000;
      continue;
    }
    if (token.error === "access_denied") throw new Error("Microsoft authorization was declined");
    if (token.error === "expired_token") break;
    throw new Error(`Microsoft authorization failed (${token.error ?? tokenResponse.status})`);
  }
  throw new Error("Microsoft device authorization expired; run the command again");
}
