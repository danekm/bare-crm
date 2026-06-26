export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

export function safeErrorMessage(error: unknown): string {
  return redactSensitiveText(errorMessage(error))
}

export function redactSensitiveText(value: string): string {
  return value
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[redacted-email]")
    .replace(/\b(?:sk|pk)_(?:live|test)_[A-Za-z0-9_-]+\b/g, "[redacted-token]")
    .replace(
      /\b((?:api[_-]?key|access[_-]?token|refresh[_-]?token|secret|password)=)[^&\s]+/gi,
      "$1[redacted]",
    )
    .replace(/\b(postgres(?:ql)?:\/\/)[^\s]+/gi, "$1[redacted]")
}
