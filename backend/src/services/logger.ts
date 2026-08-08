/**
 * Structured JSON logger — stdout only.
 *
 * Zero-trust rule: log fields must NEVER contain identity — no IP, no
 * user-agent, no cookies, no request bodies. Only hashes, tracking seeds,
 * destinations, and operational counters.
 */
export type LogLevel = "info" | "warn" | "error";

export function log(
  level: LogLevel,
  event: string,
  fields: Record<string, unknown> = {},
): void {
  const line = JSON.stringify({
    ts: new Date().toISOString(),
    level,
    event,
    ...fields,
  });

  if (level === "error") {
    console.error(line);
  } else if (level === "warn") {
    console.warn(line);
  } else {
    console.info(line);
  }
}
