// Drives the robot along a smiley-face outline using /robot/move and /robot/status.
// Watch it in the viewer (top-down view looks best).
//
//   node tools/draw-smiley.js                 # server on localhost:3000
//   node tools/draw-smiley.js http://host:3000
//
// Coordinates are in metres in the ROS odom frame. The face is centred on the
// origin, radius 1 m, with "up" being +y.
//
// This steers point to point: turn on the spot toward the next waypoint, then
// drive straight, re-reading the pose each time so small errors don't build up.
// There's no "pen up", so the short travel lines between the face, eyes and
// mouth show in the trail. Milestone 3 will replace this with real missions.

const BASE = process.argv[2] ?? "http://localhost:3000";
const LINEAR = 0.2;   // m/s (robot max 0.22)
const ANGULAR = 1.5;  // rad/s (robot max 2.84)
const SETTLE_MS = 150;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));

async function pose() {
  const s = await (await fetch(`${BASE}/robot/status`)).json();
  if (!s.pose) throw new Error(`robot has no pose yet (state: ${s.state})`);
  return { x: s.pose.x, y: s.pose.y, yaw: (s.pose.heading * Math.PI) / 180 };
}

async function move(linear, angular, ms) {
  // The API caps a single move at 10 s, so long moves are split up.
  while (ms > 0) {
    const chunk = Math.min(ms, 10_000);
    const res = await fetch(`${BASE}/robot/move`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ linear, angular, durationMs: Math.max(1, Math.round(chunk)) }),
    });
    if (!res.ok) throw new Error(`move failed: ${res.status} ${await res.text()}`);
    await sleep(chunk + SETTLE_MS);
    ms -= chunk;
  }
}

async function goTo([x, y]) {
  let p = await pose();
  const turn = wrap(Math.atan2(y - p.y, x - p.x) - p.yaw);
  if (Math.abs(turn) > 0.02) await move(0, Math.sign(turn) * ANGULAR, (Math.abs(turn) / ANGULAR) * 1000);

  p = await pose();
  const dist = Math.hypot(x - p.x, y - p.y);
  if (dist > 0.01) await move(LINEAR, 0, (dist / LINEAR) * 1000);
}

// Points on a circle (or arc) from angle a0 to a1 (degrees), counter-clockwise.
function arc(cx, cy, r, a0, a1, steps) {
  return Array.from({ length: steps + 1 }, (_, i) => {
    const a = ((a0 + ((a1 - a0) * i) / steps) * Math.PI) / 180;
    return [cx + r * Math.cos(a), cy + r * Math.sin(a)];
  });
}

const SHAPES = [
  ["face", arc(0, 0, 1.0, 0, 360, 24)],
  ["right eye", arc(0.35, 0.3, 0.1, 0, 360, 6)],
  ["left eye", arc(-0.35, 0.3, 0.1, 180, 540, 6)],
  ["mouth", arc(0, 0, 0.55, 200, 340, 8)],
];

const started = Date.now();
for (const [name, points] of SHAPES) {
  console.log(`Drawing ${name}...`);
  for (const pt of points) await goTo(pt);
}
await fetch(`${BASE}/robot/stop`, { method: "POST" });
console.log(`Done in ${Math.round((Date.now() - started) / 1000)} s 🙂`);
