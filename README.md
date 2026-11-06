# RoboOps

Robot fleet management with Node.js + ROS 2. It currently drives one simulated TurtleBot3 over HTTP and reports its position. See [docs/roadmap.md](docs/roadmap.md) for what's next and [docs/architecture.md](docs/architecture.md) for how it fits together.

Runs on Apple Silicon. It uses `turtlebot3_fake_node` (a kinematic sim) because Gazebo doesn't run on ARM64.

## Project structure

```
roboops/
├── docker-compose.yml          # runs the sim container
├── docs/                       # architecture + roadmap
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
    │   └── utils/
    ├── test/                   # API tests (use the mock bridge)
    └── tools/mock-rosbridge.js # fake ROS for testing without Docker
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
4. **Drive it** from a second Mac terminal tab:

```bash
curl localhost:3000/robot/status

curl -X POST localhost:3000/robot/move \
  -H 'Content-Type: application/json' \
  -d '{"linear":0.2,"angular":0,"durationMs":2000}'     # forward ~0.4 m

curl -X POST localhost:3000/robot/move \
  -H 'Content-Type: application/json' \
  -d '{"linear":0,"angular":1.57,"durationMs":1000}'    # turn ~90°

curl -X POST localhost:3000/robot/stop
```

Stop everything with `docker compose down`.

## API

| Method | Path | Body | Notes |
|---|---|---|---|
| GET | `/health` | | Server and rosbridge connection |
| GET | `/robot/status` | | `state` (`idle` / `moving` / `stale` / `disconnected`), pose (x, y, heading in degrees), velocity |
| POST | `/robot/move` | `{linear, angular, durationMs}` | Limits: ±0.22 m/s, ±2.84 rad/s, ≤10 s. Auto-stops at the end. A new move replaces the current one |
| POST | `/robot/stop` | | Immediate stop |

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
