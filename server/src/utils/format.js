// Round for display; also turns -0 into 0
export const round = (n, dp = 3) => Math.round(n * 10 ** dp) / 10 ** dp + 0;

// Radians -> degrees in 0–360 (0 = facing +x, counter-clockwise positive)
export const toHeadingDeg = (rad) => ((((rad * 180) / Math.PI) % 360) + 360) % 360;

export const iso = (ms) => (ms ? new Date(ms).toISOString() : null);
