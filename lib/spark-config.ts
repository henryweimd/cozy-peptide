/**
 * Shared Meta Model API connection details. Lives in its own module so
 * both the proposal engine and the specificity reviewer can reach the
 * upstream without an import cycle.
 */
export const META_SPARK_MODEL = "muse-spark-1.3-contributor";
export const META_WONDER_MODEL = "muse-wonder-1.0";
/** Cheapest model; the default when callers select none. */
export const DEFAULT_MODEL = META_SPARK_MODEL;
/** Model ids known to exist; the API accepts other strings and lets the upstream validate. */
export const KNOWN_MODELS: string[] = [META_SPARK_MODEL, META_WONDER_MODEL];
export const META_SPARK_DEFAULT_URL = "https://api.meta.ai/v1/chat/completions";
export const META_SPARK_TIMEOUT_MS = 30000;

export function getMetaSparkApiUrl(): string {
  const override = process.env.META_SPARK_API_URL;
  if (override !== undefined && override.trim().length > 0) return override.trim();
  return META_SPARK_DEFAULT_URL;
}

/** Display name for provenance. Unknown ids pass through unchanged. */
export function displayNameForModel(model: string): string {
  if (model === META_SPARK_MODEL) return "Meta-Spark-1.3-Contributor";
  if (model === META_WONDER_MODEL) return "Muse-Wonder-1.0";
  return model;
}

/** Short label for prompts and telemetry. Unknown ids pass through unchanged. */
export function shortLabelForModel(model: string): string {
  if (model === META_SPARK_MODEL) return "Muse Spark 1.3";
  if (model === META_WONDER_MODEL) return "Muse Wonder 1.0";
  return model;
}
