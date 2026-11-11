// One robot in the 3D scene: a TurtleBot3 Burger model, a state ring,
// a label and a trail. Poses arrive at ~10 Hz and are smoothed every frame.
import * as THREE from "three";
import { rosToThree, textSprite } from "./scene.js";

export const STATE_COLORS = {
  idle: 0x3fb950,
  moving: 0x4c9aff,
  stale: 0xd29922,
  disconnected: 0xf85149,
};

const TRAIL_MAX_POINTS = 4000;
const TRAIL_MIN_STEP = 0.01; // metres between trail points
const SMOOTHING = 12;        // higher = snappier interpolation

export class RobotView {
  constructor(id) {
    this.id = id;
    this.group = new THREE.Group();     // positioned in the world
    this.body = buildBurger();          // rotated by heading
    this.group.add(this.body);

    this.ring = new THREE.Mesh(
      new THREE.RingGeometry(0.11, 0.125, 48),
      new THREE.MeshBasicMaterial({ color: STATE_COLORS.idle, side: THREE.DoubleSide, transparent: true, opacity: 0.9 })
    );
    this.ring.rotation.x = -Math.PI / 2;
    this.ring.position.y = 0.003;
    this.group.add(this.ring);

    this.label = textSprite(id, 0xe6e9ef, new THREE.Vector3(0, 0.27, 0), 0.045);
    this.group.add(this.label);

    this.trail = buildTrail();

    this.target = null;   // { x, y, yaw } in ROS frame
    this.current = null;
    this.lastTrailPoint = null;
    this.spin = this.body.getObjectByName("lidarTop");
  }

  /** Called with a status object from the server. */
  update(status) {
    this.ring.material.color.setHex(STATE_COLORS[status.state] ?? STATE_COLORS.stale);
    if (!status.pose) return;
    const yaw = THREE.MathUtils.degToRad(status.pose.heading);
    this.target = { x: status.pose.x, y: status.pose.y, yaw };
    if (!this.current) this.current = { ...this.target };
    this.moving = status.state === "moving";
  }

  /** Called every frame. */
  tick(dt) {
    if (!this.current) return;
    const k = 1 - Math.exp(-SMOOTHING * dt);
    this.current.x += (this.target.x - this.current.x) * k;
    this.current.y += (this.target.y - this.current.y) * k;
    this.current.yaw += shortestAngle(this.current.yaw, this.target.yaw) * k;

    this.group.position.copy(rosToThree(this.current.x, this.current.y));
    this.body.rotation.y = this.current.yaw;
    if (this.spin) this.spin.rotation.y += dt * 6;

    this.#extendTrail();
  }

  #extendTrail() {
    const p = this.group.position;
    if (this.lastTrailPoint && this.lastTrailPoint.distanceTo(p) < TRAIL_MIN_STEP) return;
    const geo = this.trail.geometry;
    const count = geo.drawRange.count;
    const positions = geo.attributes.position;
    if (count >= TRAIL_MAX_POINTS) {
      positions.array.copyWithin(0, 3); // drop the oldest point
      geo.setDrawRange(0, count - 1);
    }
    const i = geo.drawRange.count;
    positions.setXYZ(i, p.x, 0.004, p.z);
    positions.needsUpdate = true;
    geo.setDrawRange(0, i + 1);
    this.lastTrailPoint = p.clone();
  }

  clearTrail() {
    this.trail.geometry.setDrawRange(0, 0);
    this.lastTrailPoint = null;
  }
}

function buildTrail() {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(TRAIL_MAX_POINTS * 3), 3));
  geo.setDrawRange(0, 0);
  const line = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: 0x4c9aff, transparent: true, opacity: 0.7 }));
  line.frustumCulled = false;
  return line;
}

const shortestAngle = (from, to) => {
  let d = (to - from) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
};

/**
 * Simplified TurtleBot3 Burger (~138 x 178 x 192 mm), built from primitives.
 * Local frame matches ROS base_link: +x (three) is the robot's front.
 */
function buildBurger() {
  const g = new THREE.Group();
  const plateMat = new THREE.MeshStandardMaterial({ color: 0x2b2f36, roughness: 0.6, metalness: 0.2 });
  const postMat = new THREE.MeshStandardMaterial({ color: 0xb8bec8, roughness: 0.3, metalness: 0.8 });
  const tyreMat = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.9 });
  const hubMat = new THREE.MeshStandardMaterial({ color: 0x8a93a3, roughness: 0.4, metalness: 0.5 });

  // Four stacked waffle plates with standoffs between them
  const plateHeights = [0.03, 0.075, 0.12, 0.155];
  for (const h of plateHeights) {
    const plate = new THREE.Mesh(new THREE.CylinderGeometry(0.069, 0.069, 0.004, 40), plateMat);
    plate.position.y = h;
    g.add(plate);
  }
  for (const [px, pz] of [[0.045, 0.045], [0.045, -0.045], [-0.045, 0.045], [-0.045, -0.045]]) {
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.003, 0.003, 0.125, 8), postMat);
    post.position.set(px, 0.0925, pz);
    g.add(post);
  }

  // Battery (bottom), OpenCR board (middle), Raspberry Pi (upper)
  const box = (w, h, d, color, y) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshStandardMaterial({ color, roughness: 0.7 }));
    m.position.y = y;
    g.add(m);
  };
  box(0.07, 0.02, 0.035, 0x30363d, 0.044);
  box(0.06, 0.006, 0.06, 0x1f6f43, 0.081);
  box(0.055, 0.006, 0.04, 0x2a7a3f, 0.126);

  // Drive wheels (axis along three z = ROS y)
  for (const side of [1, -1]) {
    const tyre = new THREE.Mesh(new THREE.CylinderGeometry(0.033, 0.033, 0.018, 32), tyreMat);
    tyre.rotation.x = Math.PI / 2;
    tyre.position.set(-0.01, 0.033, side * 0.08);
    const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.02, 16), hubMat);
    hub.rotation.x = Math.PI / 2;
    hub.position.copy(tyre.position);
    g.add(tyre, hub);
  }

  // Rear caster
  const caster = new THREE.Mesh(new THREE.SphereGeometry(0.01, 16, 12), postMat);
  caster.position.set(-0.055, 0.01, 0);
  g.add(caster);

  // LDS lidar on top, with a spinning head
  const lidarBase = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.022, 32), plateMat);
  lidarBase.position.y = 0.168;
  const lidarTop = new THREE.Mesh(
    new THREE.CylinderGeometry(0.028, 0.03, 0.014, 32),
    new THREE.MeshStandardMaterial({ color: 0x3d434d, roughness: 0.4, metalness: 0.4 })
  );
  lidarTop.name = "lidarTop";
  lidarTop.position.y = 0.186;
  const lidarWindow = new THREE.Mesh(
    new THREE.BoxGeometry(0.012, 0.008, 0.02),
    new THREE.MeshStandardMaterial({ color: 0xff7b72, emissive: 0x661f1a })
  );
  lidarWindow.position.set(0.028, 0, 0);
  lidarTop.add(lidarWindow);
  g.add(lidarBase, lidarTop);

  // Heading marker so the front is obvious
  const nose = new THREE.Mesh(
    new THREE.ConeGeometry(0.014, 0.03, 16),
    new THREE.MeshStandardMaterial({ color: 0xffa657, emissive: 0x6b3a0a })
  );
  nose.rotation.z = -Math.PI / 2;
  nose.position.set(0.085, 0.157, 0);
  g.add(nose);

  return g;
}
