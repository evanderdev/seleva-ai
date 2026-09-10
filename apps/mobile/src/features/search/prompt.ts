import type { IntentContext } from './intent-engine/types';

export { promptSchema } from './intent-engine/types';
export { createIntentEngine } from './intent-engine/engine';
export type {
  IntentContext,
  IntentInterpretation,
  SelevaIntent,
} from './intent-engine/types';

/** Shared asynchronous boundary for Home and the results editor. */
export async function planPrompt(text: string, context?: IntentContext) {
  const { mobileIntentEngine } = await import('./intent-engine/mobile');
  return mobileIntentEngine.interpret({ text, context });
}
