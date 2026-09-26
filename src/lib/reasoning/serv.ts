import OpenAI from "openai";
import type { ReasoningProvider, ReasonRequest, ReasonResult } from "./provider";

/**
 * SERV Reasoning is OpenAI-compatible, so the official SDK works with a base URL swap.
 * https://docs.openserv.ai/serv-reasoning/why
 */
export const SERV_BASE_URL = process.env.SERV_BASE_URL || "https://inference-api.openserv.ai/v1";
export const SERV_MODEL = process.env.SERV_MODEL || "gpt-5.4-mini";
/** Far above any stage's output (the claim list, the largest, is a few thousand tokens). */
const MAX_OUTPUT_TOKENS = 16_000;

/**
 * SERV Tools are intercepted server-side. The prompt guard matters here because every
 * stage is fed excerpts from arbitrary web pages. The shadow agent re-checks each
 * stage's output against its input; it costs extra calls, so it is opt-in.
 */
function servTools(step: string): OpenAI.Chat.Completions.ChatCompletionTool[] {
  const tools: OpenAI.Chat.Completions.ChatCompletionTool[] = [
    { type: "function", function: { name: "serv_prompt_guard", parameters: { type: "object", properties: {} } } },
  ];
  if (process.env.SERV_SHADOW_AGENT === "1") {
    tools.push({
      type: "function",
      function: {
        name: "serv_shadow_agent",
        parameters: {
          type: "object",
          properties: {
            hint: {
              type: "string",
              default: `Stage "${step}": check every cited ID exists in the input, every claim is grounded in the supplied evidence rather than prior knowledge, and nothing is overstated.`,
            },
            max_iterations: { type: "integer", default: 2 },
          },
        },
      },
    });
  }
  return tools;
}

export class ServProvider implements ReasoningProvider {
  readonly mode = "live" as const;
  private client: OpenAI;

  constructor(apiKey: string, private model = SERV_MODEL) {
    this.client = new OpenAI({ apiKey, baseURL: SERV_BASE_URL });
  }

  async reason<T>(req: ReasonRequest): Promise<ReasonResult<T>> {
    // One retry on malformed output: strict schemas make this rare, but a truncated response would sink the whole run.
    let lastError: unknown;
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const res = await this.client.chat.completions.create({
          model: this.model,
          messages: [
            { role: "system", content: req.system },
            { role: "user", content: req.user },
          ],
          tools: servTools(req.step),
          response_format: { type: "json_schema", json_schema: req.schema },
          temperature: 0.2,
          // Left unset, SERV sometimes picks a limit above the model's 128k cap and rejects its own request.
          max_completion_tokens: MAX_OUTPUT_TOKENS,
        });
        const message = res.choices[0]?.message;
        if (message?.refusal) throw new Error(`SERV refused the ${req.step} step: ${message.refusal}`);
        const content = message?.content;
        if (!content) throw new Error(`SERV returned no content for the ${req.step} step.`);
        return { output: JSON.parse(content) as T, model: res.model || this.model };
      } catch (err) {
        lastError = err;
        if (!(err instanceof SyntaxError)) break;
      }
    }
    throw lastError instanceof SyntaxError
      ? new Error(`SERV returned invalid JSON for the ${req.step} step.`)
      : lastError;
  }
}
