export function notificationScopeClauses(scope) {
  if (!scope) return [];
  const clauses = [];
  if (scope.parkingIds?.length) clauses.push(`parking_id.in.(${scope.parkingIds.join(",")})`);
  if (scope.subscriberIds?.length) clauses.push(`subscriber_id.in.(${scope.subscriberIds.join(",")})`);
  if (scope.userId) clauses.push(`user_id.eq.${scope.userId}`);
  return clauses;
}

export function applyNotificationQueryScope(query, scope) {
  return scope ? query.or(notificationScopeClauses(scope).join(",")) : query;
}
