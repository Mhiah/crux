import { describe, expect, it } from "vitest";
import { ServProvider } from "../src/lib/reasoning/serv";
import { QUERY_PLAN_SCHEMA } from "../src/lib/reasoning/schemas";

const REQ = { step: "query_plan", system: "s", user: "u", schema: QUERY_PLAN_SCHEMA };

const guardBlock = { model: "gpt-5.4-mini", choices: [{ message: { content: null, refusal: "I can't share that." } }], usage: { total_tokens: 0 } };
const modelRefusal = { model: "gpt-5.4-mini", choices: [{ message: { content: null, refusal: "I can't help with that." } }], usage: { total_tokens: 120 } };
const ok = { model: "gpt-5.4-mini-2026-03-17", choices: [{ message: { content: '{"queries":["q"]}', refusal: null } }], usage: { total_tokens: 90 } };
const badJson = { model: "gpt-5.4-mini", choices: [{ message: { content: '{"queries":', refusal: null } }], usage: { total_tokens: 90 } };

/** A SERV stand-in that returns the given responses in order and counts calls. */
function serv(...responses: unknown[]) {
  const client = { calls: 0, chat: { completions: { create: async () => responses[client.calls++] } } };
  return { client, provider: new ServProvider("test", "gpt-5.4-mini", client as never) };
}

describe("ServProvider", () => {
  it("retries when the prompt guard blocks, then returns the answer", async () => {
    const { client, provider } = serv(guardBlock, guardBlock, ok);
    await expect(provider.reason(REQ)).resolves.toEqual({ output: { queries: ["q"] }, model: ok.model });
    expect(client.calls).toBe(3);
  });

  it("gives up after three guard blocks with a clear error", async () => {
    const { client, provider } = serv(guardBlock, guardBlock, guardBlock, ok);
    await expect(provider.reason(REQ)).rejects.toThrow("SERV's prompt guard blocked the query_plan step 3 times");
    expect(client.calls).toBe(3);
  });

  it("does not retry a refusal from the model itself", async () => {
    const { client, provider } = serv(modelRefusal, ok);
    await expect(provider.reason(REQ)).rejects.toThrow("SERV refused the query_plan step");
    expect(client.calls).toBe(1);
  });

  it("retries invalid JSON once, separately from guard retries", async () => {
    const { client, provider } = serv(guardBlock, badJson, ok);
    await expect(provider.reason(REQ)).resolves.toMatchObject({ output: { queries: ["q"] } });
    expect(client.calls).toBe(3);
    const second = serv(badJson, badJson, ok);
    await expect(second.provider.reason(REQ)).rejects.toThrow("SERV returned invalid JSON");
  });
});
