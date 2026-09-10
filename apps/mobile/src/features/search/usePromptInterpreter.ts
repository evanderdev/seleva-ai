import { useCallback, useRef, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { planPrompt, promptSchema } from './prompt';

type IntentError = 'invalidPrompt' | 'intentClarify' | 'intentUnsupported';

export function usePromptInterpreter() {
  const { i18n } = useTranslation();
  const [interpreting, setInterpreting] = useState(false);
  const [intentError, setIntentError] = useState<IntentError>();
  const generation = useRef(0);
  const inFlight = useRef(false);

  useFocusEffect(
    useCallback(
      () => () => {
        generation.current += 1;
        inFlight.current = false;
        setInterpreting(false);
      },
      [],
    ),
  );

  async function interpret(text: string) {
    if (inFlight.current) return;
    setIntentError(undefined);
    const parsed = promptSchema.safeParse(text);
    if (!parsed.success) {
      setIntentError('invalidPrompt');
      return;
    }
    inFlight.current = true;
    setInterpreting(true);
    const request = ++generation.current;
    try {
      const result = await planPrompt(parsed.data, { locale: i18n.language });
      if (generation.current !== request) return;
      if (result.plan.status !== 'ready' || !result.plan.query) {
        setIntentError(
          result.plan.status === 'unsupported'
            ? 'intentUnsupported'
            : 'intentClarify',
        );
        return;
      }
      return {
        query: result.plan.query,
        notice: result.plan.notices.length > 0,
      };
    } catch {
      if (generation.current === request) setIntentError('intentClarify');
    } finally {
      if (generation.current === request) {
        inFlight.current = false;
        setInterpreting(false);
      }
    }
  }

  return {
    interpret,
    interpreting,
    intentError,
    clearIntentError: () => setIntentError(undefined),
  };
}
