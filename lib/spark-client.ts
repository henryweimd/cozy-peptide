import {
  MetaSparkResponseSchema,
  type MetaSparkMessage,
} from "../types/peptide";
import {
  META_SPARK_TIMEOUT_MS,
  getMetaSparkApiUrl,
} from "./spark-config";
import {
  SPARK_MESSAGE_MAX_CHARS,
  SPARK_RESPONSE_MAX_CHARS,
  capText,
  currentRequestId,
  recordSparkFailure,
} from "./spark-trace";

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
 *
 * Every call is logged compactly (one line, Vercel-visible); failures
 * additionally log the full outbound payload and stash it under the
 * ambient trace id for the ledger, so a blocked key or policy fault
 * leaves exact evidence of what was sent.
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

  const reqId = currentRequestId();
  const tag = reqId === null ? "untraced" : `req=${reqId}`;
  const startedAt = Date.now();
  const promptChars = messages.reduce(
    (sum, message) =>
      sum + (typeof message.content === "string" ? message.content.length : 0),
    0
  );
  const fail = (
    error: string,
    httpStatus: number | null,
    finishReason: string | null,
    responseSnippet: string | null
  ): null => {
    const latencyMs = Date.now() - startedAt;
    const capped = messages.map((message) => {
      const content =
        typeof message.content === "string" ? message.content : "";
      const cappedContent = capText(content, SPARK_MESSAGE_MAX_CHARS);
      return {
        role: message.role,
        content: cappedContent.text,
        chars: cappedContent.chars,
      };
    });
    recordSparkFailure({
      at: new Date(startedAt).toISOString(),
      model,
      temperature,
      maxTokens,
      timeoutMs,
      latencyMs,
      messages: capped,
      promptChars,
      httpStatus,
      finishReason,
      error,
      responseSnippet,
    });
    console.warn(
      `[meta-spark] FAIL ${tag} model=${model} temp=${temperature} ` +
        `max_tokens=${maxTokens} prompt_chars=${promptChars} ` +
        `latency_ms=${latencyMs} status=${httpStatus ?? "-"} ` +
        `finish=${finishReason ?? "-"} error=${error}`
    );
    console.warn(
      `[meta-spark] FAIL ${tag} outbound=${JSON.stringify({
        model,
        messages: capped.map((entry) => ({
          role: entry.role,
          content: entry.content,
        })),
        temperature,
        max_tokens: maxTokens,
      })}`
    );
    if (responseSnippet !== null) {
      console.warn(`[meta-spark] FAIL ${tag} response=${responseSnippet}`);
    }
    return null;
  };

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
      let snippet: string | null = null;
      try {
        const text = await response.text();
        snippet = capText(text, SPARK_RESPONSE_MAX_CHARS).text;
      } catch {
        snippet = null;
      }
      return fail(
        `upstream HTTP ${response.status}`,
        response.status,
        null,
        snippet
      );
    }
    const raw: unknown = await response.json().catch(() => null);
    const parsed = MetaSparkResponseSchema.safeParse(raw);
    if (!parsed.success) {
      const envelope =
        typeof raw === "string" ? raw : (JSON.stringify(raw) ?? "");
      return fail(
        "unparseable response envelope",
        response.status,
        null,
        capText(envelope, SPARK_RESPONSE_MAX_CHARS).text
      );
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
      return fail("empty completion", response.status, finish, null);
    }
    console.info(
      `[meta-spark] ok ${tag} model=${model} prompt_chars=${promptChars} ` +
        `completion_chars=${text.length} latency_ms=${Date.now() - startedAt} ` +
        `finish=${finish}`
    );
    return { text, finish };
  } catch (error) {
    const name = error instanceof Error ? error.name : "unknown";
    return fail(`request error: ${name}`, null, null, null);
  } finally {
    clearTimeout(timeout);
  }
}
