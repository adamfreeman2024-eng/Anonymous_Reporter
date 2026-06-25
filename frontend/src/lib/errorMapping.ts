/**
 * Backend error → i18n key mapping.
 * Maps raw server error messages and HTTP status codes to localized message keys.
 */
export type ErrorKey = keyof typeof ERROR_KEY_MAP[keyof typeof ERROR_KEY_MAP];

const ERROR_KEY_MAP = {
  // HTTP status codes
  status: {
    400: "errors.invalidPayload",
    429: "errors.tooManyRequests",
    500: "errors.serverError",
    502: "errors.serverError",
    503: "errors.serverError",
  } as Record<number, string>,

  // Server error message patterns → i18n keys
  messagePatterns: [
    { pattern: /too many/i, key: "errors.tooManyRequests" },
    { pattern: /rate limit/i, key: "errors.tooManyRequests" },
    { pattern: /invalid encrypted payload/i, key: "errors.invalidPayload" },
    { pattern: /invalid destination/i, key: "errors.invalidDestination" },
    { pattern: /internal network rejected/i, key: "errors.internalRejected" },
    { pattern: /server error/i, key: "errors.serverError" },
    { pattern: /ECONNREFUSED|ENOTFOUND|ETIMEDOUT|network|unreachable/i, key: "errors.networkError" },
    { pattern: /failed to submit hash/i, key: "errors.serverError" },
    { pattern: /key limit exceeded/i, key: "errors.serverError" },
  ] as { pattern: RegExp; key: string }[],
};

/**
 * Resolve a server error to an i18n key.
 * @param message - The error message from the server or fetch error
 * @param status - Optional HTTP status code
 * @returns The i18n key string (e.g., "errors.serverError")
 */
export function resolveErrorKey(message: string, status?: number): string {
  // 1. HTTP status code match
  if (status && ERROR_KEY_MAP.status[status]) {
    return ERROR_KEY_MAP.status[status];
  }

  // 2. Message pattern match
  for (const { pattern, key } of ERROR_KEY_MAP.messagePatterns) {
    if (pattern.test(message)) {
      return key;
    }
  }

  // 3. Fallback
  return "errors.generic";
}
