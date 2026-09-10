import { z } from 'zod';
import { searchRequestSchema, type SearchExpression, type SearchRequest } from './search-expression';
import { capabilityAvailabilitySchema, type Analyzer, type AnalysisBatch, type AnalysisContext, type CandidateIndex, type CandidateSet, CapabilityResolver, type Metric, type QueryProcessor, type RankingEngine, type SearchContext, type SearchEngine } from './capabilities';
import type { AssetPage, PageRequest } from './index';

export const predicateExecutionSchema = z.strictObject({ capability: z.string(), operator: z.string(), availability: capabilityAvailabilitySchema });
export const searchReportSchema = z.strictObject({ status: z.enum(['complete', 'degraded', 'unavailable']), executed: z.array(predicateExecutionSchema), unavailable: z.array(predicateExecutionSchema) });
export type SearchReport = z.infer<typeof searchReportSchema>;
export interface ComposedSearchResult extends AssetPage { report: SearchReport; }
const costs = { cheap: 1, medium: 10, expensive: 100 };
export class SearchComposition {
  constructor(private readonly resolver: CapabilityResolver, private readonly index: CandidateIndex, private readonly metric: Metric = () => {}) {}
  async execute(input: SearchRequest, page: PageRequest, context: SearchContext): Promise<ComposedSearchResult> {
    const request = searchRequestSchema.parse(input);
    const report: SearchReport = { status: 'complete', executed: [], unavailable: [] };
    const start = Date.now();
    const cost = (expression: SearchExpression): number => expression.type === 'predicate' ? costs[this.resolver.registry.getCapability(expression.capability)?.manifest.cost ?? 'expensive'] : expression.type === 'not' ? cost(expression.child) : Math.min(...expression.children.map(cost), 1000);
    const run = async (expression: SearchExpression, candidates: CandidateSet): Promise<CandidateSet | undefined> => {
      context.signal?.throwIfAborted();
      if (expression.type === 'predicate') {
        const resolutionStart = Date.now();
        const resolved = this.resolver.resolve(expression.capability, context.runtime, 'search', p => 'canHandle' in p && (p as SearchEngine).canHandle(expression));
        this.metric('capability_resolution_ms', Date.now() - resolutionStart);
        const entry = { capability: expression.capability, operator: expression.operator, availability: resolved.availability };
        const engine = resolved.providers[0] as SearchEngine | undefined;
        if (!engine) { report.unavailable.push(entry); return undefined; }
        try {
          let prepared: unknown;
          const plugin = this.resolver.registry.getCapability(engine.capabilityId);
          if (plugin?.queryProcessors?.some(p => p.canHandle(expression))) {
            const processor = this.resolver.resolve(engine.capabilityId, context.runtime, 'query', p => (p as QueryProcessor).canHandle(expression)).providers[0] as QueryProcessor | undefined;
            if (!processor) throw new Error('QUERY_PROCESSOR_UNAVAILABLE');
            const queryStart = Date.now();
            prepared = await processor.process(expression, context);
            this.metric('query_processing_ms', Date.now() - queryStart);
          }
          const result = await engine.search(expression, prepared, candidates, context);
          report.executed.push(entry);
          return result;
        } catch {
          context.signal?.throwIfAborted();
          report.unavailable.push({ ...entry, availability: { status: 'unavailable', reason: 'EXECUTION_FAILED' } });
          return undefined;
        }
      }
      if (expression.type === 'not') {
        const result = await run(expression.child, candidates);
        return result ? this.index.subtract(candidates, result) : undefined;
      }
      if (expression.type === 'and') {
        let result = candidates;
        let complete = true;
        for (const child of [...expression.children].sort((a, b) => cost(a) - cost(b))) {
          const next = await run(child, result);
          if (next) result = this.index.intersect([result, next]); else complete = false;
        }
        // Fail closed: an incomplete AND must never become an apparently valid selection.
        return complete ? result : undefined;
      }
      const results: CandidateSet[] = [];
      let complete = true;
      for (const child of expression.children) { const result = await run(child, candidates); if (result) results.push(result); else complete = false; }
      return complete ? this.index.intersect([candidates, this.index.union(results)]) : undefined;
    };
    try {
      let candidates = await run(request.expression, this.index.universe());
      if (candidates && request.ranking) {
        const ranking = request.ranking;
        const resolved = this.resolver.resolve(ranking.capability, context.runtime, 'ranking', p => (p as RankingEngine).canHandle(ranking.strategy));
        const ranker = resolved.providers[0] as RankingEngine | undefined;
        if (!ranker) { report.unavailable.push({ capability: ranking.capability, operator: ranking.strategy, availability: resolved.availability }); candidates = undefined; }
        else { const time = Date.now(); candidates = await ranker.rank(candidates, ranking.strategy, context); this.metric('ranking_ms', Date.now() - time); }
      }
      report.status = report.unavailable.length ? 'unavailable' : report.executed.some(e => e.availability.status === 'degraded') ? 'degraded' : 'complete';
      const result = candidates ? await this.index.page(candidates, page, JSON.stringify(request), request.target?.maxResults) : { assets: [] };
      return { ...result, report: searchReportSchema.parse(report) };
    } finally { this.index.release(); this.metric('search_execution_ms', Date.now() - start); }
  }
}
export class AnalysisComposition {
  constructor(private readonly resolver: CapabilityResolver, private readonly metric: Metric = () => {}) {}
  async process(batch: AnalysisBatch, capabilities: readonly string[], context: AnalysisContext) {
    const completed: string[] = []; const unavailable: string[] = []; const failed: string[] = [];
    const visited = new Set<string>();
    const process = async (id: string): Promise<void> => {
      if (visited.has(id)) return;
      visited.add(id);
      context.signal?.throwIfAborted();
      const plugin = this.resolver.registry.getCapability(id);
      for (const dependency of plugin?.manifest.dependencies ?? []) await process(dependency);
      if (context.runtime.resources === 'critical' || (context.runtime.resources === 'constrained' && plugin?.manifest.cost === 'expensive')) { unavailable.push(id); return; }
      if (plugin?.manifest.dependencies.some(dependency => failed.includes(dependency) || unavailable.includes(dependency))) { unavailable.push(id); return; }
      const analyzer = this.resolver.resolve(id, context.runtime, 'analysis').providers[0] as Analyzer | undefined;
      if (!analyzer) { unavailable.push(id); return; }
      try {
        const size = Math.max(1, Math.min(200, analyzer.batchSize));
        for (let offset = 0; offset < batch.assetIds.length; offset += size) {
          context.signal?.throwIfAborted();
          const pending = await analyzer.pending({ assetIds: batch.assetIds.slice(offset, offset + size) }, context);
          if (pending.assetIds.length) await analyzer.analyzeBatch(pending, context);
        }
        completed.push(id);
      } catch { context.signal?.throwIfAborted(); failed.push(id); }
    };
    const start = Date.now();
    for (const id of [...capabilities].sort((a, b) => costs[this.resolver.registry.getCapability(a)?.manifest.cost ?? 'expensive'] - costs[this.resolver.registry.getCapability(b)?.manifest.cost ?? 'expensive'])) await process(id);
    this.metric('analysis_planning_ms', Date.now() - start);
    return { completed, unavailable, failed };
  }
}
