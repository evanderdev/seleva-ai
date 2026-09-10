export interface MatcherInput { text: string; locale?: string; }
export interface MatcherResult {
  filters?: Record<string, unknown>;
  consumedSpans: Array<[number, number]>;
  evidence: string[];
  confidence: number;
  unresolved?: boolean;
}
export interface IntentMatcher {
  id: string;
  priority: number;
  match(input: MatcherInput): MatcherResult | null;
}

export function createMatcherRegistry(matchers: readonly IntentMatcher[] = []): IntentMatcher[] {
  return [...matchers].sort((a, b) => b.priority - a.priority || a.id.localeCompare(b.id));
}

export function runMatcherRegistry(matchers: readonly IntentMatcher[], input: MatcherInput): MatcherResult[] {
  return createMatcherRegistry(matchers).flatMap((matcher) => {
    const result = matcher.match(input);
    return result ? [{ ...result, evidence: result.evidence.map((item) => `${matcher.id}:${item}`) }] : [];
  });
}

export const builtinMatchers: IntentMatcher[] = createMatcherRegistry([
  {
    id: 'media-type', priority: 100,
    match: ({ text }) => /\b(photo|photos|foto|fotos|video|videos)\b/i.test(text)
      ? { filters: /\bvideo/i.test(text) ? { mediaTypes: ['video'] } : { mediaTypes: ['photo'] }, consumedSpans: [], evidence: ['media type'], confidence: 0.9 }
      : null,
  },
  {
    id: 'quality', priority: 90,
    match: ({ text }) => /\b(blurry|blurred|borrad|borros|desfoc)/i.test(text)
      ? { filters: { minBlur: 0.55 }, consumedSpans: [], evidence: ['blur'], confidence: 0.86 }
      : null,
  },
  {
    id: 'screenshot', priority: 95,
    match: ({ text }) => /\b(screenshot|print|captura)/i.test(text)
      ? { filters: { screenshot: true }, consumedSpans: [], evidence: ['screenshot'], confidence: 0.95 }
      : null,
  },
]);
