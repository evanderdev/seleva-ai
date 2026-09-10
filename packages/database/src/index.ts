import type { AssetPage, PageRequest, SearchRequest } from '@seleva/core';

export { migrate } from './migrations';
export { PhotoRepository } from './repository';
export { SqlCandidateIndex, createSqlCapabilityPlugins } from './search-index';
export type { SqlDatabase, SqlConnection, SqlValue } from './connection';

export interface PhotoIndex {
  query(plan: SearchRequest, page: PageRequest): Promise<AssetPage>;
}
