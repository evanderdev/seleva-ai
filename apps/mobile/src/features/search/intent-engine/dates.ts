import * as chrono from 'chrono-node';
import { fold } from './normalizer';
import type { NaturalDateParser } from './types';

const translations: Array<[RegExp, string]> = [
  [/\b(hoje|hoy)\b/g, 'today'],
  [/\b(ontem|ayer)\b/g, 'yesterday'],
  [/\b(ultimos?|ultimas?)\b/g, 'last'],
  [/\b(tres)\b/g, 'three'],
  [/\b(dois|duas|dos)\b/g, 'two'],
  [/\b(um|uma|un|uno)\b/g, 'one'],
  [/\b(dias?)\b/g, 'days'],
  [/\b(semanas?)\b/g, 'weeks'],
  [/\b(meses|mes)\b/g, 'months'],
  [/\b(anos?)\b/g, 'years'],
  [/\b(atras)\b/g, 'ago'],
  [/\b(antes de|antes del)\b/g, 'before'],
  [/\b(depois de|despues de|despues del)\b/g, 'after'],
  [/\b(entre)\b/g, 'between'],
  [/\b(janeiro|enero)\b/g, 'January'],
  [/\b(fevereiro|febrero)\b/g, 'February'],
  [/\b(marco|marzo)\b/g, 'March'],
  [/\b(abril)\b/g, 'April'],
  [/\b(maio|mayo)\b/g, 'May'],
  [/\b(junho|junio)\b/g, 'June'],
  [/\b(julho|julio)\b/g, 'July'],
  [/\b(agosto)\b/g, 'August'],
  [/\b(setembro|septiembre)\b/g, 'September'],
  [/\b(outubro|octubre)\b/g, 'October'],
  [/\b(novembro|noviembre)\b/g, 'November'],
  [/\b(dezembro|diciembre)\b/g, 'December'],
];
function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}
function nextDay(date: Date): number {
  const result = startOfDay(date);
  result.setDate(result.getDate() + 1);
  return result.getTime();
}
export const dateParser: NaturalDateParser = {
  parse(original, context) {
    const now = context.now ?? new Date();
    let text = fold(original);
    text = text
      .replace(/\b(semana passada|semana pasada)\b/g, 'last week')
      .replace(/\b(mes passado|mes pasado)\b/g, 'last month')
      .replace(/\b(ano passado|ano pasado)\b/g, 'last year')
      .replace(/\b(este ano|esse ano)\b/g, 'this year')
      .replace(/\bhace\s+(.+?)\s+(dias?|semanas?|meses|anos?)\b/g, '$1 $2 ago');
    for (const [pattern, value] of translations)
      text = text.replace(pattern, value);
    const explicitYear = /\b(before|after)\s+(\d{4})\b/.exec(text);
    if (explicitYear) {
      const yearStart = new Date(Number(explicitYear[2]), 0, 1).getTime();
      return explicitYear[1] === 'before'
        ? { before: yearStart, remaining: text.replace(explicitYear[0], '') }
        : { after: new Date(Number(explicitYear[2]), 11, 31, 23, 59, 59, 999).getTime(), remaining: text.replace(explicitYear[0], '') };
    }
    const calendar = /\b(last week|last month|last year|this year)\b/.exec(
      text,
    );
    if (calendar) {
      const end = startOfDay(now);
      const start = startOfDay(now);
      if (calendar[0] === 'last week') {
        end.setDate(end.getDate() - ((end.getDay() + 6) % 7));
        start.setTime(end.getTime());
        start.setDate(start.getDate() - 7);
      } else if (calendar[0] === 'last month') {
        end.setDate(1);
        start.setDate(1);
        start.setMonth(start.getMonth() - 1);
      } else {
        start.setMonth(0, 1);
        if (calendar[0] === 'last year') {
          end.setMonth(0, 1);
          start.setFullYear(start.getFullYear() - 1);
        } else end.setTime(now.getTime() + 1);
      }
      return {
        after: start.getTime() - 1,
        before: end.getTime(),
        remaining: text.replace(calendar[0], ''),
      };
    }
    // Chrono handles amounts, named months, explicit dates and ranges.
    const rolling =
      /\blast\s+(\d+|one|two|three|four|five|six|seven|thirty)\s+(days?|weeks?|months?|years?)\b/.exec(
        text,
      );
    if (rolling)
      text = text.replace(rolling[0], `${rolling[1]} ${rolling[2]} ago`);
    const parsed = chrono.en.casual.parse(text, now);
    const first = parsed[0];
    if (!first) {
      const old = /\b(old|older|antig\w*|velh\w*|viejos?|antigu\w*)\b/.exec(
        text,
      );
      if (old) {
        const before = new Date(now);
        before.setFullYear(before.getFullYear() - 1);
        return {
          before: before.getTime(),
          remaining: text.replace(old[0], ''),
        };
      }
      return {
        remaining: text,
        ambiguous: /\b(before|after|between|last|ago)\b/.test(text),
      };
    }
    let remaining = text;
    for (const item of parsed) remaining = remaining.replace(item.text, '');
    const prefix = text.slice(0, first.index);
    const start = startOfDay(first.start.date());
    if (/\bbefore\s*$/.test(prefix))
      return {
        before: start.getTime(),
        remaining: remaining.replace(/\bbefore\b/, ''),
      };
    if (/\bafter\s*$/.test(prefix))
      return {
        after: nextDay(start) - 1,
        remaining: remaining.replace(/\bafter\b/, ''),
      };
    if (rolling)
      return {
        after: start.getTime() - 1,
        before: now.getTime() + 1,
        remaining,
      };
    const end = first.end?.date() ?? parsed[1]?.start.date();
    if (parsed.length > 2) return { remaining, ambiguous: true };
    return {
      after: start.getTime() - 1,
      before: nextDay(end ?? start),
      remaining: remaining.replace(/\b(between|and|e|y)\b/g, ''),
    };
  },
};
