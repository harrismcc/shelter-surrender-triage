import { describe, expect, it } from "bun:test";

import worker from "./index";

describe("worker", () => {
  it("reports its health without allowing cached results", async () => {
    const response = await worker.fetch(
      new Request("https://example.com/health"),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(await response.text()).toBe('{"status":"ok"}');
  });

  it("returns 404 for an unknown route", async () => {
    const response = await worker.fetch(
      new Request("https://example.com/unknown"),
    );

    expect(response.status).toBe(404);
    expect(await response.text()).toBe('{"error":"Not found"}');
  });
});
