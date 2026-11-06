import { LIMITS } from "../../config/index.js";

/** Returns { value } on success or { errors: [...] } on failure. */
export function validateMove(body = {}) {
  const { linear = 0, angular = 0, durationMs = 1000 } = body;
  const errors = [];

  if (typeof linear !== "number" || Math.abs(linear) > LIMITS.maxLinear)
    errors.push(`linear must be a number in [-${LIMITS.maxLinear}, ${LIMITS.maxLinear}] m/s`);
  if (typeof angular !== "number" || Math.abs(angular) > LIMITS.maxAngular)
    errors.push(`angular must be a number in [-${LIMITS.maxAngular}, ${LIMITS.maxAngular}] rad/s`);
  if (!Number.isInteger(durationMs) || durationMs <= 0 || durationMs > LIMITS.maxDurationMs)
    errors.push(`durationMs must be an integer in (0, ${LIMITS.maxDurationMs}]`);

  return errors.length ? { errors } : { value: { linear, angular, durationMs } };
}
