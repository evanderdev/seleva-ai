import { z } from 'zod';
import { capabilityIdSchema, type CapabilityId, type SearchPredicate } from './search-expression';
import type { AssetPage, PageRequest } from './index';

export const capabilityAvailabilitySchema = z.discriminatedUnion('status', [
  z.strictObject({ status: z.literal('available') }),
  z.strictObject({ status: z.literal('degraded'), reason: z.string(), fallback: capabilityIdSchema.optional() }),
  z.strictObject({ status: z.literal('unavailable'), reason: z.string() }),
]);
export type CapabilityAvailability = z.infer<typeof capabilityAvailabilitySchema>;
const platformRequirement = z.strictObject({ minVersion: z.number().nonnegative(), architectures: z.array(z.string()).optional() });
export const capabilityManifestSchema = z.strictObject({
  id: capabilityIdSchema, version: z.string().min(1),
  functions: z.array(z.enum(['analysis', 'query', 'search', 'ranking', 'direct'])).min(1),
  platforms: z.strictObject({ android: platformRequirement.optional(), ios: platformRequirement.optional() }),
  cost: z.enum(['cheap', 'medium', 'expensive']), persistence: z.enum(['none', 'sqlite', 'fts', 'vector', 'derived']),
  dependencies: z.array(capabilityIdSchema).default([]), fallbackCapabilities: z.array(capabilityIdSchema).default([]),
});
export type CapabilityManifest = z.infer<typeof capabilityManifestSchema>;
export interface CapabilityRuntimeContext {
  platform: 'android' | 'ios'; osVersion: number; architecture?: string;
  permissions: readonly string[]; models: readonly string[]; nativeApis: readonly string[];
  resources: 'normal' | 'constrained' | 'critical';
}
export interface ProviderRequirements { permissions?: readonly string[]; models?: readonly string[]; nativeApis?: readonly string[]; minVersion?: number; }
export interface Provider {
  id: string; capabilityId: CapabilityId; version: string; priority?: number;
  requirements?: ProviderRequirements;
  availability?(context: CapabilityRuntimeContext): CapabilityAvailability;
}
/** Opaque, lazy set owned by the index. Never a gallery-sized JS array. */
export interface CandidateSet { readonly key: string; }
export interface SearchContext { runtime: CapabilityRuntimeContext; signal?: AbortSignal; }
export interface QueryProcessor extends Provider {
  canHandle(predicate: SearchPredicate): boolean;
  process(predicate: SearchPredicate, context: SearchContext): Promise<unknown>;
}
export interface SearchEngine extends Provider {
  canHandle(predicate: SearchPredicate): boolean;
  selectivity?: number;
  search(predicate: SearchPredicate, prepared: unknown, candidates: CandidateSet, context: SearchContext): Promise<CandidateSet>;
}
export interface RankingEngine extends Provider {
  canHandle(strategy: string): boolean;
  rank(candidates: CandidateSet, strategy: string, context: SearchContext): Promise<CandidateSet>;
}
export interface CandidateIndex {
  universe(): CandidateSet;
  intersect(sets: CandidateSet[]): CandidateSet;
  union(sets: CandidateSet[]): CandidateSet;
  subtract(base: CandidateSet, excluded: CandidateSet): CandidateSet;
  page(set: CandidateSet, request: PageRequest, fingerprint: string, maxResults?: number): Promise<AssetPage>;
  release(): void;
}
export interface AnalysisContext { runtime: CapabilityRuntimeContext; signal?: AbortSignal; }
export interface AnalysisBatch { assetIds: readonly string[]; }
export interface Analyzer extends Provider {
  batchSize: number;
  pending(batch: AnalysisBatch, context: AnalysisContext): Promise<AnalysisBatch>;
  analyzeBatch(batch: AnalysisBatch, context: AnalysisContext): Promise<void>;
}
export interface CapabilityPlugin {
  manifest: CapabilityManifest;
  analyzers?: readonly Analyzer[]; queryProcessors?: readonly QueryProcessor[];
  searchEngines?: readonly SearchEngine[]; rankers?: readonly RankingEngine[];
}
export type CapabilityFunction = 'analysis' | 'query' | 'search' | 'ranking';
export type Metric = (stage: string, milliseconds: number) => void;

export class CapabilityRegistry {
  private readonly plugins = new Map<CapabilityId, CapabilityPlugin>();
  register(plugin: CapabilityPlugin): void {
    const manifest = capabilityManifestSchema.parse(plugin.manifest);
    if (this.plugins.has(manifest.id)) throw new Error('DUPLICATE_CAPABILITY');
    const ids = new Set<string>();
    for (const provider of [...(plugin.analyzers ?? []), ...(plugin.queryProcessors ?? []), ...(plugin.searchEngines ?? []), ...(plugin.rankers ?? [])]) {
      if (provider.capabilityId !== manifest.id || !provider.id || !provider.version || ids.has(provider.id)) throw new Error('INVALID_PROVIDER');
      ids.add(provider.id);
    }
    this.plugins.set(manifest.id, { ...plugin, manifest });
  }
  /** Attach a platform provider to a manifest registered by the catalog. */
  registerProvider(capabilityId: CapabilityId, provider: Analyzer | QueryProcessor | SearchEngine | RankingEngine): void {
    const plugin = this.plugins.get(capabilityId);
    if (!plugin || provider.capabilityId !== capabilityId || !provider.id || !provider.version) throw new Error('INVALID_PROVIDER');
    const providers = [...(plugin.analyzers ?? []), ...(plugin.queryProcessors ?? []), ...(plugin.searchEngines ?? []), ...(plugin.rankers ?? [])];
    if (providers.some((candidate) => candidate.id === provider.id)) throw new Error('DUPLICATE_PROVIDER');
    const next: CapabilityPlugin = { ...plugin };
    if ('batchSize' in provider) next.analyzers = [...(plugin.analyzers ?? []), provider as Analyzer];
    else if ('rank' in provider) next.rankers = [...(plugin.rankers ?? []), provider as RankingEngine];
    else if ('search' in provider) next.searchEngines = [...(plugin.searchEngines ?? []), provider as SearchEngine];
    else if ('process' in provider) next.queryProcessors = [...(plugin.queryProcessors ?? []), provider as QueryProcessor];
    else throw new Error('INVALID_PROVIDER');
    this.plugins.set(capabilityId, next);
  }
  getCapability(id: CapabilityId): CapabilityPlugin | undefined { return this.plugins.get(id); }
  list(): CapabilityPlugin[] { return [...this.plugins.values()]; }
}
export class CapabilityResolver {
  constructor(readonly registry: CapabilityRegistry) {}
  resolve(id: CapabilityId, runtime: CapabilityRuntimeContext, fn: CapabilityFunction, accepts: (provider: Provider) => boolean = () => true, path: readonly string[] = []): { availability: CapabilityAvailability; providers: Provider[] } {
    const unavailable = (reason: string) => ({ availability: { status: 'unavailable' as const, reason }, providers: [] });
    if (path.includes(id)) return unavailable('DEPENDENCY_CYCLE');
    const plugin = this.registry.getCapability(id);
    if (!plugin) return unavailable('NOT_REGISTERED');
    const platform = plugin.manifest.platforms[runtime.platform];
    let reason = !platform || runtime.osVersion < platform.minVersion || (platform.architectures && (!runtime.architecture || !platform.architectures.includes(runtime.architecture))) ? 'OS_INCOMPATIBLE' : undefined;
    let dependencyDegraded = false;
    if (!reason) for (const dependency of plugin.manifest.dependencies) {
      const resolved = this.resolve(dependency, runtime, fn, () => true, [...path, id]);
      if (resolved.availability.status === 'unavailable') { reason = 'DEPENDENCY_UNAVAILABLE'; break; }
      dependencyDegraded ||= resolved.availability.status === 'degraded';
    }
    const sources = { analysis: plugin.analyzers, query: plugin.queryProcessors, search: plugin.searchEngines, ranking: plugin.rankers };
    const candidates: Array<{ provider: Provider; availability: CapabilityAvailability }> = [];
    if (!reason) for (const provider of sources[fn] ?? []) {
      if (!accepts(provider)) continue;
      const requirements = provider.requirements;
      const missing = runtime.osVersion < (requirements?.minVersion ?? 0) ? 'OS_INCOMPATIBLE'
        : requirements?.permissions?.some(value => !runtime.permissions.includes(value)) ? 'PERMISSION_UNAVAILABLE'
        : requirements?.models?.some(value => !runtime.models.includes(value)) ? 'MISSING_MODEL'
        : requirements?.nativeApis?.some(value => !runtime.nativeApis.includes(value)) ? 'NATIVE_API_UNAVAILABLE' : undefined;
      const availability = missing ? { status: 'unavailable' as const, reason: missing } : provider.availability?.(runtime) ?? { status: 'available' as const };
      if (availability.status !== 'unavailable') candidates.push({ provider, availability });
      else reason = availability.reason;
    }
    candidates.sort((a, b) => Number(a.availability.status === 'degraded') - Number(b.availability.status === 'degraded') || (b.provider.priority ?? 0) - (a.provider.priority ?? 0));
    const best = candidates[0];
    if (best) return { availability: dependencyDegraded && best.availability.status === 'available' ? { status: 'degraded', reason: 'DEPENDENCY_DEGRADED' } : best.availability, providers: candidates.map(c => c.provider) };
    for (const fallback of plugin.manifest.fallbackCapabilities) {
      const resolved = this.resolve(fallback, runtime, fn, accepts, [...path, id]);
      if (resolved.availability.status !== 'unavailable') return { ...resolved, availability: { status: 'degraded', reason: reason ?? 'FALLBACK_PROVIDER', fallback } };
    }
    return unavailable(reason ?? 'NO_PROVIDER');
  }
}
