import type { AssetPage, PageRequest, QueryPlan } from '@seleva/core';

export { migrate } from './migrations';
export { PhotoRepository } from './repository';
export type { SqlDatabase, SqlConnection, SqlValue } from './connection';

export interface PhotoIndex {
  query(plan: QueryPlan, page: PageRequest): Promise<AssetPage>;
}
