import { intentSchema, type IntentPlanner, type PlanNotice } from './types';
import { queryToRequest } from './query';

export const planner: IntentPlanner = {
  async createPlan(candidate) {
    const intent = intentSchema.parse(candidate);
    const notices: PlanNotice[] = [];
    if (intent.bestShot) notices.push('bestShotUnavailable');
    if (['organize', 'compare', 'keep'].includes(intent.action))
      notices.push('actionUnavailable');
    const query = queryToRequest(intent.query);
    if (intent.query.filters?.people || intent.query.filters?.places || intent.query.filters?.sceneLabels || intent.query.filters?.source) notices.push('filterUnavailable');
    // Classification labels are not populated with these semantic categories yet.
    if (intent.concepts.length || notices.length) {
      return { status: 'unsupported', notices, requiresReview: true };
    }
    if (intent.cleanupCandidate) notices.push('cleanupRankingUnavailable');
    if (intent.freeSpace || intent.query.target?.minSpaceToRecover)
      notices.push('spaceTargetUnavailable');
    const constrained = Object.values(intent.query.filters ?? {}).some(
      (value) => value !== undefined,
    );
    if (!constrained && (intent.cleanupCandidate || intent.freeSpace)) {
      return { status: 'clarification', notices, requiresReview: true };
    }
    if (
      intent.query.ranking?.strategy === 'least-important' ||
      intent.query.ranking?.strategy === 'most-redundant'
    ) {
      return { status: 'unsupported', notices, requiresReview: true };
    }
    const action = intent.action === 'delete'
      ? { action: 'trash' as const, requiresConfirmation: true as const }
      : intent.action === 'favorite' || intent.action === 'unfavorite' || intent.action === 'share'
        ? { action: intent.action, requiresConfirmation: true as const }
        : undefined;
    return { status: 'ready', query, action, notices, requiresReview: true };
  },
};
