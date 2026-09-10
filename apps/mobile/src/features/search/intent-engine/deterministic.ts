import type { QueryPlan } from '@seleva/core';
import { dateParser } from './dates';
import { fold } from './normalizer';
import {
  intentSchema,
  type DeterministicIntentProvider,
  type SelevaIntent,
} from './types';
import { builtinMatchers, runMatcherRegistry } from './matchers';

type Filter = NonNullable<QueryPlan['filters']>;
const aliases: Array<[RegExp, Partial<Filter>]> = [
  [
    /\b(screenshots?|prints?|capturas?(?: de (?:tela|pantalla))?|screen captures?)\b/g,
    { screenshot: true },
  ],
  [/\b(videos?)\b/g, { mediaTypes: ['video'] }],
  [/\b(photos?|fotos?|imagens?|images?)\b/g, { mediaTypes: ['photo'] }],
  [/\b(favou?rites?|favoritas?|favoritos?)\b/g, { favorite: true }],
  [
    /\b(duplicates?|duplicad\w*|duplicat\w*|repetid\w*|iguais|iguales)\b/g,
    { duplicate: true },
  ],
  [/\b(similar\w*|parecid\w*)\b/g, { similar: true }],
  [
    /\b(blurry|blurred|blur|borrad\w*|borros\w*|desfoc\w*)\b/g,
    { minBlur: 0.55 },
  ],
  [/\b(large|big|grandes?|pesad\w*)\b/g, { minFileSize: 500 * 1024 ** 2 }],
  [/\b(beach|praia|playa)\b/g, { labels: ['beach'] }],
  [/\b(work|trabalho|trabajo)\b/g, { labels: ['work'] }],
];
const concepts: Array<[RegExp, SelevaIntent['concepts'][number]]> = [
  [/\b(comprovantes?|bank receipts?)\b/g, 'bank_receipt'],
  [/\b(recibos?|receipts?)\b/g, 'receipt'],
  [/\b(notas? fiscais?|invoices?|facturas?)\b/g, 'invoice'],
  [/\b(documentos?|documents?)\b/g, 'document'],
  [
    /\b(rastreamento|rastreio|entregas?|tracking|delivery)\b/g,
    'delivery_tracking',
  ],
  [/\b(otp|codigos? temporarios?|temporary codes?|expired codes?)\b/g, 'otp'],
  [/\b(qr codes?|codigo qr)\b/g, 'qr_code'],
  [/\b(conversas?|conversaciones?|conversations?)\b/g, 'conversation'],
  [/\b(tickets?|ingressos?|bilhetes?)\b/g, 'ticket'],
];
const actions: Array<[RegExp, SelevaIntent['action']]> = [
  [
    /\b(delete|remove|apague|apagar|apaga|exclua|excluir|borra|borrar|elimina|eliminar)\b/g,
    'delete',
  ],
  [/\b(select|selecione|selecionar|selecciona|seleccionar)\b/g, 'select'],
  [/\b(review|revise|revisar|revis\w*)\b/g, 'review'],
  [/\b(keep|mantenha|manter|conservar|conserva)\b/g, 'keep'],
  [/\b(organize|organizar|organiza)\b/g, 'organize'],
  [/\b(compare|comparar|compara)\b/g, 'compare'],
];
actions.push(
  [/\b(unfavorite|desfavoritar|remover favorito)\b/g, 'unfavorite'],
  [/\b(favorite|favoritar|marcar como favorita)\b/g, 'favorite'],
  [/\b(share|compartilhar|compartir)\b/g, 'share'],
);
const fillers =
  /\b(find|search|show|me|my|the|some|please|from|with|of|in|on|that|are|refine|filter|continue|encontre|encontrar|procura|procure|buscar|busca|mostre|mostrar|mostra|quero|ver|ve|veja|minhas?|meus?|uns?|umas?|os|as|de|do|da|dos|das|na|no|em|com|por|favor|e|y|i|want|to|quiero|muestra|mostrar|mis|las|los|del|con|gallery|galeria|fotos|photos)\b/g;

export const deterministicProvider: DeterministicIntentProvider = {
  async interpret(input, context) {
    let text = fold(input.canonicalText ?? input.originalText);
    const matcherEvidence = runMatcherRegistry(builtinMatchers, { text }).flatMap((result) => result.evidence);
    const filters: Filter = {};
    const ocrTerms: string[] = [];
    text = text.replace(/["“]([^"”]+)["”]/g, (_, term: string) => {
      ocrTerms.push(term);
      return '';
    });
    const exclusions = { favorites: false };
    text = text.replace(
      /\b(without|except|excluding|sem|exceto|menos|sin|nao (?:mexa|toque) nas)\s+(?:as\s+)?(favou?rites?|favoritas?|favoritos?)\b/g,
      () => {
        exclusions.favorites = true;
        return '';
      },
    );
    // Arbitrary negations and unions require clarification, never inverted filters.
    const ambiguous = /\b(not|nao|no|except|without|sem|sin|or|ou|o)\b/.test(
      text,
    );
    const operation = /\b(without|except|excluding|sem|exceto|menos|sin)\b/.test(text)
      ? 'exclude' as const
      : /\b(remove|retire|remova|tirar)\b/.test(text) && /\b(from|da|do|de)\b/.test(text)
        ? 'remove' as const
        : /\b(also|tambem|também|ademas|plus|include)\b/.test(text)
          ? 'broaden' as const
          : /\b(refine|filter|filtro|continue|agora)\b/.test(text)
            ? 'restrict' as const
            : 'new' as const;
    let action: SelevaIntent['action'] = 'find';
    for (const [pattern, value] of actions) {
      if (text.match(pattern)) {
        action = value;
        text = text.replace(pattern, '');
        break;
      }
    }
    const cleanupPattern = /\b(clean\w*|limp\w*|cleanup)\b/g;
    let cleanupCandidate =
      Boolean(text.match(cleanupPattern)) || action === 'delete';
    text = text.replace(cleanupPattern, '');
    const freePattern =
      /\b(free (?:up )?(?:some )?(?:space|storage)|liberar? (?:espaco|espacio)|libere (?:espaco|espacio))\b/g;
    const freeSpace = Boolean(text.match(freePattern));
    cleanupCandidate ||= freeSpace;
    text = text.replace(freePattern, '');
    let target: QueryPlan['target'];
    text = text.replace(
      /\b(\d+(?:[.,]\d+)?)\s*(gb|mb|gib|mib)\b/g,
      (_, amount: string, unit: string) => {
        const bytes = Math.round(
          Number(amount.replace(',', '.')) *
            1024 ** (unit.startsWith('g') ? 3 : 2),
        );
        if (/\b(free|liber\w*)\b/.test(fold(input.originalText))) {
          target = { minSpaceToRecover: bytes };
          cleanupCandidate = true;
        } else filters.minFileSize = bytes;
        return '';
      },
    );
    const dates = dateParser.parse(text, context);
    text = dates.remaining;
    if (dates.before !== undefined) filters.before = dates.before;
    if (dates.after !== undefined) filters.after = dates.after;
    const detectedConcepts: SelevaIntent['concepts'] = [];
    for (const [pattern, concept] of concepts) {
      if (text.match(pattern)) {
        detectedConcepts.push(concept);
        text = text.replace(pattern, '');
      }
    }
    for (const [pattern, patch] of aliases) {
      if (text.match(pattern)) {
        if (patch.mediaTypes && filters.mediaTypes) {
          filters.mediaTypes = [
            ...new Set([...filters.mediaTypes, ...patch.mediaTypes]),
          ];
        } else if (
          patch.minFileSize !== undefined &&
          filters.minFileSize !== undefined
        ) {
          /* explicit size wins */
        } else Object.assign(filters, patch);
        text = text.replace(pattern, '');
      }
    }
    const ranking = /\b(largest|maiores|mais espaco|more space)\b/g;
    const largest = Boolean(text.match(ranking));
    text = text.replace(ranking, '');
    const residual = text
      .replace(fillers, '')
      .replace(/[^\p{L}\p{N}]+/gu, ' ')
      .trim();
    const remainingWords = residual ? residual.split(/\s+/) : [];
    // A short search term remains useful; never turn a conversational sentence into FTS.
    const shortOcr =
      remainingWords.length === 1 && !ambiguous && !dates.ambiguous;
    if (shortOcr) ocrTerms.push(...remainingWords);
    if (ocrTerms.length) filters.ocrTerms = ocrTerms.slice(0, 5);
    if (cleanupCandidate) exclusions.favorites = true;
    const intent = intentSchema.parse({
      action,
      query: {
        filters,
        exclusions,
        target,
        ranking: largest ? { strategy: 'largest' } : undefined,
      },
      concepts: detectedConcepts,
      cleanupCandidate,
      freeSpace: freeSpace || Boolean(target),
      destructive: action === 'delete',
      operation,
    });
    const recognized =
      Object.keys(filters).length > 0 ||
      cleanupCandidate ||
      detectedConcepts.length > 0;
    const unresolved =
      ambiguous ||
      Boolean(dates.ambiguous) ||
      remainingWords.length > 1 ||
      !recognized;
    return {
      intent,
      confidence: unresolved ? 0.35 : shortOcr ? 0.85 : 0.96,
      unresolved,
      residual,
      evidence: matcherEvidence.map((matcher) => ({ matcher, text: matcher })),
    };
  },
};
