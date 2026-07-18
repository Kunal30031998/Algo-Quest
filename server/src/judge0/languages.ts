// Server-side allow-list: clients send one of these keys, never a raw
// Judge0 language ID directly. IDs verified against the running instance's
// /languages endpoint (docker-compose judge0-server), not assumed.
export const LANGUAGE_IDS = {
  python: 71, // Python (3.8.1)
  cpp: 54, // C++ (GCC 9.2.0)
  java: 62, // Java (OpenJDK 13.0.1)
  javascript: 63, // JavaScript (Node.js 12.14.0)
} as const;

export type Language = keyof typeof LANGUAGE_IDS;

export function isSupportedLanguage(value: unknown): value is Language {
  return typeof value === "string" && value in LANGUAGE_IDS;
}
