import type { ReactNode } from "react";

// This panel is Chinese-only (single local device, single operator). There is
// no bilingual dictionary or language preference; the call sites (`useI18n()`,
// `tl()`) are kept as a trivial identity shim so the UI components don't each
// need editing.
export type Language = "en" | "zh";

export function tl(text: string): string {
  return text;
}

export function tf(pattern: string, vars: Record<string, unknown>): string {
  let text = pattern;
  for (const [key, value] of Object.entries(vars)) {
    text = text.replaceAll(`{${key}}`, String(value));
  }
  return text;
}

export function LanguageProvider({ children }: { children: ReactNode }) {
  return children;
}

export function useI18n() {
  return { lang: "zh" as Language, setLanguage: () => {}, t: tl };
}
