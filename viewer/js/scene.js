// The static world: lights, floor grid and the ROS coordinate axes.
//
// Coordinate convention (used everywhere in the viewer):
//   ROS:      x forward, y left, z up       (right-handed, z-up)
//   three.js: x right,   y up,  z toward you (right-handed, y-up)
//   => ROS (x, y)  ->  three (x, 0, -y),   ROS yaw -> rotation.y = yaw
import * as THREE from "three";

export const rosToThree = (x, y, z = 0) => new THREE.Vector3(x, z, -y);

export function buildEnvironment() {
  const world = new THREE.Group();
  world.name = "world";

  // Lights
  world.add(new THREE.HemisphereLight(0xdde6ff, 0x1a1d24, 1.4));
  const sun = new THREE.DirectionalLight(0xffffff, 1.6);
  sun.position.set(2, 4, 1.5);
  world.add(sun);

  // Floor: dark plane + 1 m grid + faint 0.25 m grid, 10 m x 10 m
  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(10, 10),
    new THREE.MeshStandardMaterial({ color: 0x151920, roughness: 1 })
  );
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = -0.001;
  world.add(floor);

  const minor = new THREE.GridHelper(10, 40, 0x232833, 0x232833);
  const major = new THREE.GridHelper(10, 10, 0x3a4252, 0x3a4252);
  major.position.y = 0.0005;
  world.add(minor, major);

  // ROS axes at the odom origin: x = red, y = green
  const axisLen = 0.5;
  world.add(
    new THREE.ArrowHelper(new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 0.002, 0), axisLen, 0xe5534b, 0.06, 0.04),
    new THREE.ArrowHelper(new THREE.Vector3(0, 0, -1), new THREE.Vector3(0, 0.002, 0), axisLen, 0x57ab5a, 0.06, 0.04)
  );
  world.add(textSprite("x", 0xe5534b, rosToThree(axisLen + 0.08, 0, 0.02)));
  world.add(textSprite("y", 0x57ab5a, rosToThree(0, axisLen + 0.08, 0.02)));

  return world;
}

/** Small always-facing-camera text label. */
export function textSprite(text, color = 0xffffff, position = new THREE.Vector3(), height = 0.06) {
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  const font = "600 48px -apple-system, Segoe UI, Roboto, sans-serif";
  ctx.font = font;
  canvas.width = Math.ceil(ctx.measureText(text).width) + 24;
  canvas.height = 64;
  ctx.font = font;
  ctx.fillStyle = `#${color.toString(16).padStart(6, "0")}`;
  ctx.textBaseline = "middle";
  ctx.fillText(text, 12, 34);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, depthWrite: false }));
  sprite.scale.set((height * canvas.width) / canvas.height, height, 1);
  sprite.position.copy(position);
  return sprite;
}
