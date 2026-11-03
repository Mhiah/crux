/** A safe authenticated Reppo connectivity check: GET only, never submits evaluation jobs. */
const key = process.env.REPPO_API_KEY?.trim();
if (!key) {
  console.error("Missing REPPO_API_KEY. Configure it privately in .env.local or your deployment environment.");
  process.exitCode = 2;
} else {
  try {
    const response = await fetch("https://eval.reppo.xyz/api/v1/agents/eval-requests/pending", {
      method: "GET",
      headers: { Authorization: "Bearer " + key, Accept: "application/json" },
      signal: AbortSignal.timeout(15_000),
      cache: "no-store",
    });
    if (response.ok) console.log("Reppo API authentication succeeded (HTTP " + response.status + "). No evaluation submitted.");
    else {
      console.error("Reppo API check returned HTTP " + response.status + ". No evaluation submitted.");
      process.exitCode = 1;
    }
  } catch {
    console.error("Could not contact Reppo API (network or timeout). No evaluation submitted.");
    process.exitCode = 1;
  }
}
