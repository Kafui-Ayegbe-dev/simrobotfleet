# RoboOps

Robot fleet management with Node.js + ROS 2. It drives a simulated TurtleBot3 over HTTP, sends it on autonomous missions (it navigates to each goal by itself, one after another), and shows everything live in a 3D viewer with VR support built in. See [docs/roadmap.md](docs/roadmap.md) for what's next and [docs/architecture.md](docs/architecture.md) for how it fits together.

Runs on Apple Silicon. It uses `turtlebot3_fake_node` (a kinematic sim) because Gazebo doesn't run on ARM64.

## Project structure

```
roboops/
├── docker-compose.yml          # runs the sim container
├── docs/                       # architecture + roadmap
├── viewer/                     # 3D / WebXR viewer (Three.js, served by the server)
├── sim/                        # ROS 2 side (runs in Docker)
│   ├── docker/Dockerfile
│   └── launch/roboops_sim.launch.py
└── server/                     # Node.js backend (runs on your Mac)
    ├── src/
    │   ├── index.js            # entry point
    │   ├── app.js              # Express app wiring
    │   ├── config/             # settings + robot limits
    │   ├── api/                # routes, validators, middleware
    │   ├── robots/             # Robot model and state
    │   ├── ros/                # rosbridge client + message helpers
    │   ├── realtime/           # Socket.IO live status + mission events
    │   ├── missions/           # mission queue and lifecycle
    │   ├── navigation/         # go-to-goal controller that drives missions
    │   ├── telemetry/          # rolling pose history
    │   └── utils/
    ├── test/                   # API tests (use the mock bridge)
    └── tools/                  # mock-rosbridge.js (fake ROS), draw-smiley.js (demo)
```

## Setup (one time)

Requires Docker Desktop and Node 18+.

```bash
docker compose build          # bakes ROS packages into the image
cd server && npm install
```

## Run

1. Start the container with `docker compose up -d`.
2. **Start the sim**: open http://localhost:6080, open a terminal in that desktop, and run `start-sim`.
3. **Start the server** in a Mac terminal with `cd server && npm start`. Expect `[rosbridge] connected`.
4. **Open the viewer** at http://localhost:3000/viewer/ and **double-click the floor**. The robot drives itself there.
5. **Or use the API** from a second Mac terminal tab:

```bash
curl -X POST localhost:3000/missions -H 'Content-Type: application/json' -d '{"x":1,"y":0.5}'   # go to a point
curl localhost:3000/robots/tb3_0/status

curl -X POST localhost:3000/robots/tb3_0/move \
  -H 'Content-Type: application/json' \
  -d '{"linear":0.2,"angular":0,"durationMs":2000}'     # manual drive: forward ~0.4 m

curl -X POST localhost:3000/robots/tb3_0/stop           # emergency stop (also cancels missions)
```

Stop everything with `docker compose down`.

## 3D viewer and VR

Open http://localhost:3000/viewer/ while the server is running. Drag to orbit, right-drag to pan, scroll to zoom, and tick **Follow robot** to keep the camera on it. The server pushes positions about 10 times a second over Socket.IO.

- **Double-click the floor** to send the robot there as a mission.
- **Goal markers** show each mission: white = queued, blue (pulsing) = active, green = succeeded, red = failed, grey = cancelled. A dashed line joins the robot to its current goal.
- **The HUD** lists active and queued missions plus the last few finished ones, and a notification pops up when a mission succeeds or fails.

**Viewing in VR.** Browsers only allow WebXR on `https://` or `localhost`, so a headset on your Wi-Fi needs one of these:

- **Meta Quest over USB (simplest):** enable developer mode, plug in, run `adb reverse tcp:3000 tcp:3000`, then open `http://localhost:3000/viewer/` in the Quest browser and press **Enter VR**.
- **Any headset over Wi-Fi:** create a local certificate and start the server with HTTPS:
  ```bash
  brew install mkcert && mkcert -install
  mkdir -p certs && mkcert -key-file certs/key.pem -cert-file certs/cert.pem localhost <your-mac-ip>
  cd server && HTTPS_KEY=../certs/key.pem HTTPS_CERT=../certs/cert.pem npm start
  ```
  Open the `On your network:` URL that the server prints, in the headset browser. You'll need to accept the certificate warning once.
- **No headset?** Install the **Immersive Web Emulator** extension from the Chrome Web Store to try VR mode on your Mac.

In VR, the robot area appears about 1 m in front of you at real scale, with a floating status board to your right.

## API

| Method | Path | Body | Notes |
|---|---|---|---|
| GET | `/health` | | Server and rosbridge connection |
| GET | `/robots` | | All robots and their status |
| GET | `/robots/:id/status` | | `state` (`idle` / `moving` / `stale` / `disconnected`), pose (x, y, heading in degrees), velocity, and `mission` while one is running |
| POST | `/robots/:id/move` | `{linear, angular, durationMs}` | Manual drive. Limits: ±0.22 m/s, ±2.84 rad/s, ≤10 s. Auto-stops at the end. **409 while a mission is running** |
| POST | `/robots/:id/stop` | | **Emergency stop:** halts the robot and cancels its active and queued missions |
| GET | `/robots/:id/telemetry` | | Recent pose history, oldest first. `?since=` (ISO or ms) and `?limit=` (1–3000). Sampled at 5 Hz, last 10 min kept |
| | `/robot/...` | | Same as `/robots/tb3_0/...`, kept so older commands still work |
| POST | `/missions` | `{x, y, robotId?}` | Go-to-goal mission. Goal within ±5 m. Starts if the robot is free, otherwise queues. `robotId` defaults to `tb3_0` |
| GET | `/missions` | | All missions, newest first. Filters: `?state=` and `?robotId=` |
| GET | `/missions/:id` | | One mission, with its state history (and `queuePosition` if queued) |
| POST | `/missions/:id/cancel` | | Cancel a queued or active mission. 409 if it's already finished |
| GET | `/viewer/` | | 3D / VR viewer |
| WS | `/socket.io` | | `robots:status` (array, ~10 Hz), `missions:snapshot` (on connect), `missions:update` (on every change) |

## Missions

A mission asks a robot to go to a point. The robot **drives itself there**, then the next queued mission starts automatically, until the queue is empty:

```
queued ──▶ active ──▶ succeeded | failed | cancelled
   └──────────────────▶ cancelled
```

```bash
curl -X POST localhost:3000/missions -H 'Content-Type: application/json' -d '{"x":1.5,"y":0.5}'
curl localhost:3000/missions?state=active
curl -X POST localhost:3000/missions/m-0001/cancel
```

**How it navigates:** a go-to-goal controller runs at 10 Hz. It turns on the spot if the goal is well off to the side, otherwise it drives forward while steering toward the goal, slowing as it gets close. It counts as arrived within 5 cm.

**When a mission fails** (with the reason in `error`):
- **timed out:** it took far longer than the straight-line drive should
- **no progress:** it didn't get 2 cm closer for 5 seconds
- **lost contact:** the robot disconnected or stopped reporting its position for 3 seconds

The robot always stops when a mission ends, for whatever reason. There's no obstacle avoidance yet: the simulated world is empty.

**Demo:** `node tools/draw-smiley.js --missions` queues 48 missions that trace a smiley face.

Missions and telemetry are kept in memory, so they reset when the server restarts.

## Testing

```bash
cd server
npm test          # automated API tests against the mock bridge (no Docker needed)
npm run mock      # or run the mock manually, then `npm start` in another tab
```

## Troubleshooting

- **`ECONNREFUSED`**: rosbridge isn't up. Check that `start-sim` is running and that `docker ps` shows port 9090.
- **`stale` state**: the bridge is connected but no `/odom` is arriving, so the fake node isn't running.
- **Robot doesn't move in RViz**: set Fixed Frame to `odom`.
- **Position reset to 0**: the sim was restarted. The fake node always starts at the origin.
- **Changed anything in `sim/`?** Run `docker compose build && docker compose up -d --force-recreate`.
