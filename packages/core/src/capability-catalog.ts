import type { CapabilityPlugin } from './capabilities';
import { CapabilityRegistry } from './capabilities';

/** Stable IDs mirrored from the operational Capability Catalog. Providers are attached by platform packages. */
export const capabilityManifests = [
  { id: 'metadata.core', version: '1', functions: ['search'] as const, platforms: { android: { minVersion: 0 }, ios: { minVersion: 0 } }, cost: 'cheap' as const, persistence: 'sqlite' as const, dependencies: [], fallbackCapabilities: [] },
  { id: 'query.date', version: '1', functions: ['query'] as const, platforms: { android: { minVersion: 0 }, ios: { minVersion: 0 } }, cost: 'cheap' as const, persistence: 'none' as const, dependencies: [], fallbackCapabilities: [] },
  { id: 'language.identification', version: '1', functions: ['query'] as const, platforms: { android: { minVersion: 23 }, ios: { minVersion: 15.5 } }, cost: 'medium' as const, persistence: 'none' as const, dependencies: [], fallbackCapabilities: [] },
  { id: 'language.translation', version: '1', functions: ['query'] as const, platforms: { android: { minVersion: 23 }, ios: { minVersion: 15.5 } }, cost: 'medium' as const, persistence: 'none' as const, dependencies: [], fallbackCapabilities: [] },
  { id: 'text.ocr', version: '1', functions: ['analysis', 'query', 'search'] as const, platforms: { android: { minVersion: 23 }, ios: { minVersion: 13 } }, cost: 'medium' as const, persistence: 'fts' as const, dependencies: [], fallbackCapabilities: [] },
  { id: 'people.face', version: '1', functions: ['analysis', 'query', 'search'] as const, platforms: { android: { minVersion: 23 }, ios: { minVersion: 13 } }, cost: 'medium' as const, persistence: 'sqlite' as const, dependencies: [], fallbackCapabilities: [] },
  { id: 'place.geo', version: '1', functions: ['search'] as const, platforms: { android: { minVersion: 0 }, ios: { minVersion: 0 } }, cost: 'cheap' as const, persistence: 'sqlite' as const, dependencies: [], fallbackCapabilities: [] },
  { id: 'visual.labels', version: '1', functions: ['analysis', 'query', 'search'] as const, platforms: { android: { minVersion: 23 }, ios: { minVersion: 13 } }, cost: 'medium' as const, persistence: 'sqlite' as const, dependencies: [], fallbackCapabilities: ['semantic.visual'] },
  { id: 'semantic.visual', version: '1', functions: ['analysis', 'query', 'search', 'ranking'] as const, platforms: { android: { minVersion: 0 }, ios: { minVersion: 0 } }, cost: 'expensive' as const, persistence: 'vector' as const, dependencies: [], fallbackCapabilities: ['visual.labels'] },
  { id: 'visual.background', version: '1', functions: ['analysis', 'query', 'search'] as const, platforms: { android: { minVersion: 0 }, ios: { minVersion: 0 } }, cost: 'medium' as const, persistence: 'derived' as const, dependencies: [], fallbackCapabilities: [], },
  { id: 'duplicate.exact', version: '1', functions: ['analysis', 'search'] as const, platforms: { android: { minVersion: 0 }, ios: { minVersion: 0 } }, cost: 'cheap' as const, persistence: 'sqlite' as const, dependencies: [], fallbackCapabilities: [] },
  { id: 'similarity.perceptual', version: '1', functions: ['analysis', 'query', 'search'] as const, platforms: { android: { minVersion: 0 }, ios: { minVersion: 0 } }, cost: 'cheap' as const, persistence: 'sqlite' as const, dependencies: [], fallbackCapabilities: ['duplicate.exact'] },
  { id: 'quality.visual', version: '1', functions: ['analysis', 'query', 'search', 'ranking'] as const, platforms: { android: { minVersion: 0 }, ios: { minVersion: 0 } }, cost: 'cheap' as const, persistence: 'sqlite' as const, dependencies: [], fallbackCapabilities: [] },
  { id: 'content.screenshot', version: '1', functions: ['analysis', 'query', 'search'] as const, platforms: { android: { minVersion: 0 }, ios: { minVersion: 0 } }, cost: 'cheap' as const, persistence: 'sqlite' as const, dependencies: [], fallbackCapabilities: [] },
  { id: 'content.document', version: '1', functions: ['analysis', 'query', 'search'] as const, platforms: { android: { minVersion: 23 }, ios: { minVersion: 13 } }, cost: 'medium' as const, persistence: 'derived' as const, dependencies: [], fallbackCapabilities: ['text.ocr'] },
] as const;
export function manifestPlugins(): CapabilityPlugin[] {
  return capabilityManifests.map(manifest => ({
    manifest: {
      ...manifest,
      functions: [...manifest.functions],
      dependencies: [...manifest.dependencies],
      fallbackCapabilities: [...manifest.fallbackCapabilities],
    },
  }));
}
export function createCapabilityRegistry(plugins: readonly CapabilityPlugin[] = manifestPlugins()): CapabilityRegistry { const registry = new CapabilityRegistry(); plugins.forEach(plugin => registry.register(plugin)); return registry; }
