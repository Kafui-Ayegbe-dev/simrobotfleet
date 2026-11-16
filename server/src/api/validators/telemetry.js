import { TELEMETRY } from "../../config/index.js";

/**
 * ?since=  ISO timestamp (2026-11-13T22:00:00Z) or milliseconds since epoch
 * ?limit=  max samples, most recent kept (1..TELEMETRY.maxQueryLimit)
 */
export function validateTelemetryQuery(query = {}) {
  const errors = [];
  let since;
  let limit;

  if (query.since != null) {
    since = /^\d+$/.test(query.since) ? Number(query.since) : Date.parse(query.since);
    if (!Number.isFinite(since)) errors.push("since must be an ISO timestamp or milliseconds since epoch");
  }
  if (query.limit != null) {
    limit = Number(query.limit);
    if (!Number.isInteger(limit) || limit < 1 || limit > TELEMETRY.maxQueryLimit)
      errors.push(`limit must be an integer in [1, ${TELEMETRY.maxQueryLimit}]`);
  }
  return errors.length ? { errors } : { value: { since, limit } };
}
