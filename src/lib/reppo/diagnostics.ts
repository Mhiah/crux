/** Non-billable Reppo authentication check. A GET never submits an evaluation. */
export type ReppoConnectionStatus = {
  state: "connected" | "missing" | "unauthorized" | "unreachable" | "error";
  http_status?: number;
};

export async function checkReppoConnection(
  apiKey: string | undefined,
  transport: typeof fetch = fetch,
): Promise<ReppoConnectionStatus> {
  if (!apiKey?.trim()) return { state: "missing" };

  try {
    const response = await transport("https://eval.reppo.xyz/api/v1/agents/eval-requests/pending", {
      method: "GET",
      headers: { Authorization: "Bearer " + apiKey.trim(), Accept: "application/json" },
      signal: AbortSignal.timeout(15000),
      cache: "no-store",
    });
    if (response.ok) return { state: "connected", http_status: response.status };
    return {
      state: response.status === 401 || response.status === 403 ? "unauthorized" : "error",
      http_status: response.status,
    };
  } catch {
    return { state: "unreachable" };
  }
}
