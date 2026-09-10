import { queryPlanSchema } from '@seleva/core';
import { intentSchema, type IntentPlanner, type PlanNotice } from './types';

export const planner: IntentPlanner = {
  async createPlan(candidate) {
    const intent = intentSchema.parse(candidate);
    const notices: PlanNotice[] = [];
    if (intent.bestShot) notices.push('bestShotUnavailable');
    if (['organize', 'compare', 'keep'].includes(intent.action))
      notices.push('actionUnavailable');
    // Classification labels are not populated with these semantic categories yet.
    if (intent.concepts.length || notices.length) {
      return { status: 'unsupported', notices, requiresReview: true };
    }
    if (intent.cleanupCandidate) notices.push('cleanupRankingUnavailable');
    if (intent.freeSpace || intent.query.target?.minSpaceToRecover)
      notices.push('spaceTargetUnavailable');
    const query = queryPlanSchema.parse(intent.query);
    const constrained = Object.values(query.filters ?? {}).some(
      (value) => value !== undefined,
    );
    if (!constrained && (intent.cleanupCandidate || intent.freeSpace)) {
      return { status: 'clarification', notices, requiresReview: true };
    }
    if (
      query.ranking?.strategy === 'least-important' ||
      query.ranking?.strategy === 'most-redundant'
    ) {
      return { status: 'unsupported', notices, requiresReview: true };
    }
    // Only return queries. Selection and trash APIs are deliberately not dependencies.
    return { status: 'ready', query, notices, requiresReview: true };
  },
};
