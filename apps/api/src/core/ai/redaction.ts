// AI safety: "tenant + user context injection, PII redaction policy" is a
// named Gateway responsibility (Charter §9.1), applied before anything
// reaches a provider or an audit log. Deliberately simple pattern matching —
// not a claim of exhaustive PII detection, but real enough to catch the
// obvious cases and to prove the plumbing exists and runs on every call.
const PATTERNS: RegExp[] = [
  /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, // email
  /\b(?:\d[ -]?){13,19}\b/g, // card-like number sequence
  /\b[A-CEGHJ-PR-TW-Z]{2}\d{6}[A-D]\b/gi, // UK National Insurance number
];

export function redact(text: string): { text: string; redacted: boolean } {
  let redacted = false;
  let out = text;
  for (const pattern of PATTERNS) {
    const before = out;
    out = out.replace(pattern, '[REDACTED]');
    if (out !== before) redacted = true;
  }
  return { text: out, redacted };
}
