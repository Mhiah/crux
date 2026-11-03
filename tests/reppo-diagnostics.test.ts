import { describe, expect, it } from "vitest";
import { checkReppoConnection } from "../src/lib/reppo/diagnostics";

describe("non-billable Reppo connection check", () => {
  it("reports missing keys without any network calls", async () => {
    const transport = (async () => { throw new Error("should not be called"); }) as typeof fetch;
    await expect(checkReppoConnection(undefined, transport)).resolves.toEqual({ state: "missing" });
  });

  it("performs a GET with the bearer token and no submission", async () => {
    const transport = (async (url: RequestInfo | URL, options?: RequestInit) => {
      expect(url).toBe("https://eval.reppo.xyz/api/v1/agents/eval-requests/pending");
      expect(options?.method).toBe("GET");
      expect(options?.body).toBeUndefined();
      expect((options?.headers as Record<string, string>).Authorization).toBe("Bearer sample");
      return new Response(JSON.stringify({ items: [] }), { status: 200 });
    }) as typeof fetch;
    await expect(checkReppoConnection("sample", transport)).resolves.toEqual({
      state: "connected", http_status: 200,
    });
  });

  it("distinguishes revoked keys and unreachable services", async () => {
    const rejected = (async () => new Response(null, { status: 401 })) as typeof fetch;
    const down = (async () => { throw new Error("offline"); }) as typeof fetch;
    await expect(checkReppoConnection("sample", rejected)).resolves.toEqual({
      state: "unauthorized", http_status: 401,
    });
    await expect(checkReppoConnection("sample", down)).resolves.toEqual({ state: "unreachable" });
  });
});
