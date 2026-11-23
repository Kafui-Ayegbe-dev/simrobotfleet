// Mission goals in the 3D scene: a marker per goal, coloured by state, and a
// dashed line from each robot to its active goal.
import * as THREE from "three";
import { rosToThree, textSprite } from "./scene.js";

export const MISSION_COLORS = {
  queued: 0xc9d1d9,
  active: 0x4c9aff,
  succeeded: 0x3fb950,
  failed: 0xf85149,
  cancelled: 0x6e7681,
};

const OPEN = new Set(["queued", "active"]);
const KEEP_FINISHED = 15; // finished markers kept on screen (oldest removed)

export class MissionLayer {
  constructor(world) {
    this.world = world;
    this.missions = new Map(); // id -> { mission, marker }
    this.paths = new Map();    // robotId -> dashed line
  }

  /** Replace all open missions (sent by the server on connect). */
  reset(list) {
    for (const id of [...this.missions.keys()]) this.#remove(id);
    for (const m of list) this.upsert(m);
  }

  upsert(m) {
    let entry = this.missions.get(m.id);
    if (!entry) {
      entry = { mission: m, marker: buildMarker(m) };
      this.world.add(entry.marker);
      this.missions.set(m.id, entry);
    }
    entry.mission = m;
    setMarkerState(entry.marker, m.state);
    this.#pruneFinished();
  }

  /** Missions for the HUD: active, then queued in order, then recent finished. */
  list() {
    const all = [...this.missions.values()].map((e) => e.mission);
    const active = all.filter((m) => m.state === "active");
    const queued = all.filter((m) => m.state === "queued").sort((a, b) => (a.queuePosition ?? 0) - (b.queuePosition ?? 0));
    const done = all.filter((m) => !OPEN.has(m.state)).sort((a, b) => Date.parse(b.endedAt) - Date.parse(a.endedAt));
    return [...active, ...queued, ...done];
  }

  activeFor(robotId) {
    for (const { mission } of this.missions.values()) {
      if (mission.robotId === robotId && mission.state === "active") return mission;
    }
    return null;
  }

  /** Every frame: pulse active markers, update robot -> goal lines. */
  tick(t, robotViews) {
    for (const { mission, marker } of this.missions.values()) {
      const s = mission.state === "active" ? 1 + 0.15 * Math.sin(t * 5) : 1;
      marker.userData.ring.scale.set(s, s, 1);
    }

    for (const [robotId, view] of robotViews) {
      const goal = this.activeFor(robotId);
      let line = this.paths.get(robotId);
      if (!goal) {
        if (line) line.visible = false;
        continue;
      }
      if (!line) {
        line = buildPathLine();
        this.world.add(line);
        this.paths.set(robotId, line);
      }
      const from = view.group.position;
      const to = rosToThree(goal.goal.x, goal.goal.y);
      const pos = line.geometry.attributes.position;
      pos.setXYZ(0, from.x, 0.006, from.z);
      pos.setXYZ(1, to.x, 0.006, to.z);
      pos.needsUpdate = true;
      line.computeLineDistances();
      line.visible = true;
    }
  }

  #pruneFinished() {
    const finished = [...this.missions.values()]
      .filter((e) => !OPEN.has(e.mission.state))
      .sort((a, b) => Date.parse(a.mission.endedAt) - Date.parse(b.mission.endedAt));
    for (const e of finished.slice(0, Math.max(0, finished.length - KEEP_FINISHED))) this.#remove(e.mission.id);
  }

  #remove(id) {
    const e = this.missions.get(id);
    if (!e) return;
    this.world.remove(e.marker);
    e.marker.traverse((o) => { o.geometry?.dispose(); o.material?.map?.dispose(); o.material?.dispose(); });
    this.missions.delete(id);
  }
}

function buildMarker(m) {
  const g = new THREE.Group();
  g.position.copy(rosToThree(m.goal.x, m.goal.y));

  const mat = () => new THREE.MeshBasicMaterial({ color: MISSION_COLORS.queued, transparent: true, side: THREE.DoubleSide });

  const ring = new THREE.Mesh(new THREE.RingGeometry(0.045, 0.06, 40), mat());
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.004;

  const dot = new THREE.Mesh(new THREE.CircleGeometry(0.015, 20), mat());
  dot.rotation.x = -Math.PI / 2;
  dot.position.y = 0.005;

  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.003, 0.003, 0.22, 8), mat());
  pole.position.y = 0.11;

  const flag = new THREE.Mesh(new THREE.PlaneGeometry(0.06, 0.035), mat());
  flag.position.set(0.03, 0.2, 0);

  const label = textSprite(m.id, 0xc9d1d9, new THREE.Vector3(0, 0.26, 0), 0.035);

  g.add(ring, dot, pole, flag, label);
  g.userData = { ring, parts: [ring, dot, pole, flag], label };
  return g;
}

function setMarkerState(marker, state) {
  const color = MISSION_COLORS[state] ?? MISSION_COLORS.queued;
  const opacity = OPEN.has(state) ? 0.95 : 0.4;
  for (const p of marker.userData.parts) {
    p.material.color.setHex(color);
    p.material.opacity = opacity;
  }
  marker.userData.label.material.opacity = OPEN.has(state) ? 1 : 0.45;
}

function buildPathLine() {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(6), 3));
  const line = new THREE.Line(
    geo,
    new THREE.LineDashedMaterial({ color: MISSION_COLORS.active, dashSize: 0.04, gapSize: 0.03, transparent: true, opacity: 0.8 })
  );
  line.frustumCulled = false;
  return line;
}
