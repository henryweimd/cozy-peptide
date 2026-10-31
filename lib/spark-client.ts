import {
  MetaSparkResponseSchema,
  type MetaSparkMessage,
} from "../types/peptide";
import {
  META_SPARK_TIMEOUT_MS,
  getMetaSparkApiUrl,
} from "./spark-config";

/**
 * Shared Meta Model API text client. Lives in its own module so both the
 * neurosymbolic proposal engine and the literature research agents can
 * reach the upstream without an import cycle.
 */

export interface SparkCompletionOptions {
  maxTokens?: number;
  timeoutMs?: number;
  temperature?: number;
  model?: string;
}

export interface SparkCompletion {
  text: string;
  finish: string;
}

/**
 * Sends one chat completion and returns the raw text, or null on any
 * failure (missing key, HTTP error, unparseable envelope, empty
 * completion, timeout). Never throws.
 */
export async function requestSparkCompletion(
  messages: MetaSparkMessage[],
  options: SparkCompletionOptions = {}
): Promise<SparkCompletion | null> {
  const apiKey = process.env.META_API_KEY;
  if (apiKey === undefined || apiKey.length === 0) return null;

  const {
    maxTokens = 2048,
    timeoutMs = META_SPARK_TIMEOUT_MS,
    temperature = 0.3,
    model = "muse-spark-1.3-contributor",
  } = options;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(getMetaSparkApiUrl(), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages,
        temperature,
        max_tokens: maxTokens,
        reasoning_effort: "minimal",
      }),
      signal: controller.signal,
    });
    if (!response.ok) {
      console.warn(`[meta-spark] upstream HTTP ${response.status}`);
      return null;
    }
    const parsed = MetaSparkResponseSchema.safeParse(
      (await response.json()) as unknown
    );
    if (!parsed.success) {
      console.warn("[meta-spark] unparseable response envelope");
      return null;
    }
    const data = parsed.data;
    const finish = data.choices?.[0]?.finish_reason ?? "unknown";
    const content =
      data.choices
        ?.map((choice) => choice.message?.content ?? choice.text ?? "")
        .filter((text) => text.length > 0)
        .join("\n") ?? "";
    const text = `${content}\n${data.output_text ?? ""}`.trim();
    if (text.length === 0) {
      console.warn(`[meta-spark] empty completion (finish=${finish})`);
      return null;
    }
    return { text, finish };
  } catch (error) {
    const name = error instanceof Error ? error.name : "unknown";
    console.warn(`[meta-spark] request error: ${name}`);
    return null;
  } finally {
    clearTimeout(timeout);
  }
}
