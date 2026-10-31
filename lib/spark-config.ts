/**
 * Shared Meta Model API connection details. Lives in its own module so
 * both the proposal engine and the specificity reviewer can reach the
 * upstream without an import cycle.
 */
export const META_SPARK_MODEL = "muse-spark-1.3-contributor";
export const META_SPARK_DEFAULT_URL = "https://api.meta.ai/v1/chat/completions";
export const META_SPARK_TIMEOUT_MS = 30000;

export function getMetaSparkApiUrl(): string {
  const override = process.env.META_SPARK_API_URL;
  if (override !== undefined && override.trim().length > 0) return override.trim();
  return META_SPARK_DEFAULT_URL;
}
