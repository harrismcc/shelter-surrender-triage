import { describe, expect, it } from "bun:test";

import { authorizeMicrosoftDevice } from "./microsoft-device-auth";

describe("Microsoft device authorization", () => {
  it("shows the user code, waits for approval, and returns the refresh token", async () => {
    const requests: Array<{ url: string; init?: RequestInit }> = [];
    const responses = [
      Response.json({
        device_code: "device-code",
        user_code: "ABCD-EFGH",
        verification_uri: "https://microsoft.com/devicelogin",
        expires_in: 900,
        interval: 1,
      }),
      Response.json({ error: "authorization_pending" }, { status: 400 }),
      Response.json({ access_token: "access-token", refresh_token: "refresh-token" }),
    ];
    const prompts: unknown[] = [];

    const refreshToken = await authorizeMicrosoftDevice({
      tenantId: "consumers",
      clientId: "client-id",
      fetcher: (async (input: string | URL | Request, init?: RequestInit) => {
        requests.push({ url: input.toString(), init });
        return responses.shift() ?? new Response(null, { status: 500 });
      }) as typeof fetch,
      sleep: async () => {},
      onPrompt: (prompt) => prompts.push(prompt),
    });

    expect(refreshToken).toBe("refresh-token");
    expect(prompts).toEqual([{
      verificationUri: "https://microsoft.com/devicelogin",
      userCode: "ABCD-EFGH",
      message: undefined,
    }]);
    const deviceBody = requests[0]?.init?.body as URLSearchParams;
    expect(deviceBody.get("scope")).toContain("https://graph.microsoft.com/Mail.Send");
    const tokenBody = requests[1]?.init?.body as URLSearchParams;
    expect(tokenBody.get("device_code")).toBe("device-code");
    expect(requests).toHaveLength(3);
  });
});
