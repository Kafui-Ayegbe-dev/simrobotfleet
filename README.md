# RoboOps

Robot fleet management with Node.js + ROS 2. It currently drives one simulated TurtleBot3 over HTTP, reports its position, and shows it live in a 3D viewer that also works in VR. See [docs/roadmap.md](docs/roadmap.md) for what's next and [docs/architecture.md](docs/architecture.md) for how it fits together.

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
    │   ├── realtime/           # Socket.IO live status push
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

5. **Watch it** at http://localhost:3000/viewer/. You'll see the robot, its trail and its live status.

Stop everything with `docker compose down`.

## 3D viewer and VR

Open http://localhost:3000/viewer/ while the server is running. Drag to orbit, right-drag to pan, scroll to zoom, and tick **Follow robot** to keep the camera on it. The server pushes positions about 10 times a second over Socket.IO.

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
| GET | `/robot/status` | | `state` (`idle` / `moving` / `stale` / `disconnected`), pose (x, y, heading in degrees), velocity |
| POST | `/robot/move` | `{linear, angular, durationMs}` | Limits: ±0.22 m/s, ±2.84 rad/s, ≤10 s. Auto-stops at the end. A new move replaces the current one |
| POST | `/robot/stop` | | Immediate stop |
| GET | `/viewer/` | | 3D / VR viewer |
| WS | `/socket.io` | | Event `robots:status` → array of robot statuses, ~10 Hz |

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
