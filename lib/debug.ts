const startedAt = () => Date.now()

export function debugLog(scope: string, message: string, details?: Record<string, unknown>) {
  console.log(`[v0][${scope}] ${message}`, details ?? '')
}

export function debugError(scope: string, message: string, error: unknown, details?: Record<string, unknown>) {
  const normalized = error instanceof Error ? { name: error.name, message: error.message, stack: error.stack } : error
  console.error(`[v0][${scope}] ${message}`, { error: normalized, ...details })
}

export function elapsed(since: number) {
  return `${Date.now() - since}ms`
}

export { startedAt }
