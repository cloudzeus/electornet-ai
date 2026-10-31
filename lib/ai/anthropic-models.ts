/** Τα μοντέλα του Claude API που προσφέρονται στις ρυθμίσεις (χωρίς το SDK — το διαβάζει και η φόρμα). */
export const CLAUDE_MODELS = [
  { value: "claude-opus-5-5", label: "Claude Opus 5.5 — προεπιλογή" },
  { value: "claude-sonnet-5-5", label: "Claude Sonnet 5.5 — ταχύτερο" },
  { value: "claude-haiku-5-5", label: "Claude Haiku 5.5 — φθηνότερο" },
  { value: "claude-fable-5-1", label: "Claude Fable 5.1 — το πιο ικανό" },
] as const;
export const CLAUDE_DEFAULT = "claude-opus-5-5";
