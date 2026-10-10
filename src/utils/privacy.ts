const sensitiveKey = /^(?:password|passwd|authCode|authKey|connectionCode|api[_-]?key|access[_-]?key|secret[_-]?key|privateKey|key|iv|access[_-]?token|refresh[_-]?token|token|secret|cookie|authorization|clientId|deviceName|userName|headers)$/i

/** Best-effort log redaction, not encryption or a replacement for HTTPS. */
export const redactLogText = (text: string): string => text
  .replace(/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----[\s\S]*?-----END (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/g, '[private-key]')
  .replace(/\b(?:https?|wss?):\/\/[^\s"'<>]+/gi, '[url]')
  .replace(/\b(?:Bearer|Basic)\s+[A-Za-z0-9._~+/=-]+/gi, '[credential]')
  .replace(/(["']?(?:password|passwd|authCode|authKey|connectionCode|api[_-]?key|access[_-]?key|secret[_-]?key|privateKey|key|iv|access[_-]?token|refresh[_-]?token|token|secret|cookie|authorization|clientId|deviceName|userName)["']?\s*[:=]\s*)(?:"[^"]*"|'[^']*'|[^\s,;}]+)/gi, '$1[redacted]')
  .replace(/\b(?:ghp_[A-Za-z0-9]+|github_pat_[A-Za-z0-9_]+|dckr_pat_[A-Za-z0-9_-]+)\b/g, '[credential]')
  .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '[email]')
  .replace(/(^|[^\d])(?:\+?86[- ]?)?1[3-9]\d{9}(?!\d)/g, '$1[phone]')
  .replace(/(?:\/Users\/|\/home\/)[^\s"'<>]+/g, '[local-path]')
  .replace(/[A-Z]:\\Users\\[^\s"'<>]+/gi, '[local-path]')
  .replace(/(\/data\/(?:data\/)?users\/)[^/\s"'<>]+/g, '$1[user]')
  .replace(/\b(?:10(?:\.\d{1,3}){3}|192\.168(?:\.\d{1,3}){2}|172\.(?:1[6-9]|2\d|3[01])(?:\.\d{1,3}){2})\b/g, '[private-ip]')

export const formatLogValue = (value: unknown): string => {
  if (typeof value == 'string') return redactLogText(value)
  if (value instanceof Error) return redactLogText(value.stack ?? value.message)
  try {
    return JSON.stringify(value, (key, item: unknown) => sensitiveKey.test(key)
      ? '[redacted]'
      : typeof item == 'string' ? redactLogText(item) : item) ?? redactLogText(String(value))
  } catch {
    return '[unserializable log data]'
  }
}
