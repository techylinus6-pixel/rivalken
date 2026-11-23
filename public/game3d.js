import * as THREE from "/vendor/three.module.js";

const vehicleCatalogResponse = await fetch("/vehicles.json");
if (!vehicleCatalogResponse.ok) throw new Error("Could not load vehicle specifications.");
const vehicleCatalog = await vehicleCatalogResponse.json();
const configResponse = await fetch("/api/config");
if (!configResponse.ok) throw new Error("Could not load authentication configuration.");
const publicConfig = await configResponse.json();
const supabaseClient = window.supabase && publicConfig.supabaseUrl && publicConfig.supabaseAnonKey
  ? window.supabase.createClient(publicConfig.supabaseUrl, publicConfig.supabaseAnonKey, {
    auth: { persistSession: false, autoRefreshToken: true, detectSessionInUrl: false }
  })
  : null;

const gameRoot = document.getElementById("game");
const connectionLabel = document.getElementById("connection");
const liveDot = document.querySelector(".live-dot");
const message = document.getElementById("message");
const messageTitle = document.getElementById("message-title");
const messageHint = document.getElementById("message-hint");
const standingsNode = document.getElementById("standings");
const mainMenu = document.getElementById("main-menu");
const joinForm = document.getElementById("join-form");
const racerNameInput = document.getElementById("racer-name");
const menuFeedback = document.getElementById("menu-feedback");
const lobbyScreen = document.getElementById("lobby-screen");
const lobbyTitle = document.getElementById("lobby-title");
const lobbyCount = document.getElementById("lobby-count");
const lobbyRoster = document.getElementById("lobby-roster");
const lobbyStatus = document.getElementById("lobby-status");
const leaveRaceButton = document.getElementById("leave-race");
const raceTimeNode = document.getElementById("race-time");
const accountPanel = document.getElementById("account-panel");
const careerMenu = document.getElementById("career-menu");
const authForm = document.getElementById("auth-form");
const authFeedback = document.getElementById("auth-feedback");
const authPassword = document.getElementById("account-password");
const authUsername = document.getElementById("account-username");
const fuelPanel = document.getElementById("fuel-panel");
const fuelToggle = document.getElementById("fuel-toggle");
const keys = new Set();
const MAX_CARS = 6;
const TRACK_LENGTH = 5200;
const ROAD_HALF_WIDTH = 7.2;
const FRAME_INTERVAL = 1000 / 60;
const cars = new Map();
const circuitCurve = new THREE.CatmullRomCurve3([
  [10, -95], [80, -85], [135, -65], [170, -36], [180, -5],
  [164, 22], [136, 35], [112, 24], [92, 4], [72, 10],
  [60, 30], [64, 55], [88, 76], [123, 85], [154, 105],
  [160, 132], [140, 154], [108, 160], [75, 147], [47, 125],
  [10, 108], [-30, 105], [-75, 94], [-118, 72], [-152, 45],
  [-172, 14], [-175, -15], [-158, -35], [-160, -50],
  [-120, -85], [-60, -97]
].map(([x, z]) => new THREE.Vector3(x * 1.18, 0, z * 1.18)), true, "centripetal");

function createAsphaltTexture() {
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 256;
  const context = canvas.getContext("2d");
  const image = context.createImageData(canvas.width, canvas.height);
  let seed = 98431;
  for (let index = 0; index < image.data.length; index += 4) {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    const noise = 49 + (seed % 35);
    image.data[index] = noise;
    image.data[index + 1] = noise + 1;
    image.data[index + 2] = noise + 3;
    image.data[index + 3] = 255;
  }
  context.putImageData(image, 0, 0);
  context.globalAlpha = 0.16;
  context.strokeStyle = "#14191b";
  context.lineWidth = 2;
  for (let index = 0; index < 70; index += 1) {
    const x = (index * 71) % 256;
    const y = (index * 137) % 256;
    context.beginPath();
    context.moveTo(x, y);
    context.lineTo(x + (index % 5) * 2, y + 1 + index % 4);
    context.stroke();
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.anisotropy = 4;
  return texture;
}

function createGrassTexture() {
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 256;
  const context = canvas.getContext("2d");
  context.fillStyle = "#526943";
  context.fillRect(0, 0, canvas.width, canvas.height);
  let seed = 44921;
  for (let index = 0; index < 6200; index += 1) {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    const x = seed % 256;
    seed = (seed * 1664525 + 1013904223) >>> 0;
    const y = seed % 256;
    const shade = 55 + (seed % 50);
    context.fillStyle = `rgba(${35 + (shade >> 2)},${shade},${30 + (shade >> 2)},${0.13 + (seed % 10) / 100})`;
    context.fillRect(x, y, 1 + (seed % 2), 1);
  }
  context.globalAlpha = 0.3;
  context.lineWidth = 1;
  for (let index = 0; index < 420; index += 1) {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    const x = seed % 256;
    const y = (seed >>> 8) % 256;
    context.strokeStyle = index % 3 ? "#91a66d" : "#354d37";
    context.beginPath();
    context.moveTo(x, y);
    context.lineTo(x + ((seed >>> 16) % 4) - 2, y - 2 - (seed % 5));
    context.stroke();
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(40, 34);
  texture.anisotropy = 4;
  return texture;
}

function createSkyTexture() {
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 256;
  const context = canvas.getContext("2d");
  const gradient = context.createLinearGradient(0, 0, 0, canvas.height);
  gradient.addColorStop(0, "#527894");
  gradient.addColorStop(0.42, "#91b5c5");
  gradient.addColorStop(0.78, "#d0d5c7");
  gradient.addColorStop(1, "#c8d6ca");
  context.fillStyle = gradient;
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.filter = "blur(7px)";
  for (let index = 0; index < 14; index += 1) {
    const x = (index * 97) % canvas.width;
    const y = 45 + (index * 31) % 92;
    const width = 24 + (index * 13) % 48;
    const height = 4 + (index % 4) * 2;
    context.fillStyle = `rgba(255,255,255,${0.1 + (index % 4) * 0.025})`;
    for (const offset of [-canvas.width, 0, canvas.width]) {
      context.beginPath();
      context.ellipse(x + offset, y, width, height, 0, 0, Math.PI * 2);
      context.fill();
    }
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function createGlowTexture() {
  const canvas = document.createElement("canvas");
  canvas.width = 128;
  canvas.height = 128;
  const context = canvas.getContext("2d");
  const gradient = context.createRadialGradient(64, 64, 4, 64, 64, 64);
  gradient.addColorStop(0, "rgba(255,255,255,0.8)");
  gradient.addColorStop(0.45, "rgba(255,255,255,0.3)");
  gradient.addColorStop(1, "rgba(255,255,255,0)");
  context.fillStyle = gradient;
  context.fillRect(0, 0, canvas.width, canvas.height);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

const asphaltTexture = createAsphaltTexture();
const grassTexture = createGrassTexture();
const skyTexture = createSkyTexture();
const glowTexture = createGlowTexture();

let socket;
let playerId = null;
let lastHudUpdate = 0;
let raceStartedAt = null;
let raceFinishedAt = null;
let allowReconnect = false;
let reconnectTimer = null;
let appState = "menu";
let currentUser = null;
let currentUserId = null;
let profile = null;
let profileKey = null;
let profileSalt = null;
let authMode = "login";
let menuPage = "race";
let garageIndex = 0;
let garagePreviewRoot = null;
let fuelPanelOpen = false;
let lastReward = null;
let snapshot = {
  phase: "waiting",
  cars: [],
  countdown: 0,
  players: 0,
  trackLength: TRACK_LENGTH,
  lapsToWin: 3
};
localStorage.removeItem("rivalken-player-name");
localStorage.removeItem("apex-rush-name");
let playerName = `Racer ${Math.floor(10 + Math.random() * 90)}`;
document.getElementById("player-name").textContent = playerName.toUpperCase();
racerNameInput.value = playerName;
connectionLabel.textContent = "READY TO RACE";
liveDot.classList.add("idle");

const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.25));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.08;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
gameRoot.replaceChildren(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color("#c8d6ca");
scene.fog = new THREE.Fog("#c8d6ca", 250, 660);
const skyDome = new THREE.Mesh(
  new THREE.SphereGeometry(850, 32, 20),
  new THREE.MeshBasicMaterial({ map: skyTexture, side: THREE.BackSide, depthWrite: false, fog: false })
);
skyDome.renderOrder = -1;
skyDome.frustumCulled = false;
scene.add(skyDome);
const camera = new THREE.PerspectiveCamera(62, 16 / 9, 0.1, 1200);
camera.position.set(0, 175, 300);
camera.lookAt(0, 0, 35);

const hemiLight = new THREE.HemisphereLight("#d9efff", "#37432a", 2.0);
scene.add(hemiLight);
const sun = new THREE.DirectionalLight("#fff1d2", 3.2);
sun.position.set(-34, 65, -22);
sun.castShadow = true;
sun.shadow.mapSize.set(512, 512);
sun.shadow.camera.left = -240;
sun.shadow.camera.right = 240;
sun.shadow.camera.top = 220;
sun.shadow.camera.bottom = -220;
sun.shadow.bias = -0.00015;
scene.add(sun);

const garagePreviewNode = document.getElementById("garage-preview");
const garageRenderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: "low-power" });
garageRenderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.25));
garageRenderer.outputColorSpace = THREE.SRGBColorSpace;
garageRenderer.toneMapping = THREE.ACESFilmicToneMapping;
garageRenderer.toneMappingExposure = 1.08;
garageRenderer.domElement.setAttribute("aria-label", "Rotating 3D car preview");
garagePreviewNode.prepend(garageRenderer.domElement);
const garageScene = new THREE.Scene();
garageScene.background = new THREE.Color("#17242c");
garageScene.add(new THREE.HemisphereLight("#edf5ff", "#36433d", 2.2));
const garageKeyLight = new THREE.DirectionalLight("#fff0d6", 3);
garageKeyLight.position.set(-5, 9, 6);
garageScene.add(garageKeyLight);
const garageFillLight = new THREE.DirectionalLight("#94c8df", 1.5);
garageFillLight.position.set(6, 4, -5);
garageScene.add(garageFillLight);
const garageStand = new THREE.Mesh(
  new THREE.CylinderGeometry(4.1, 4.3, 0.18, 48),
  new THREE.MeshStandardMaterial({ color: "#28373c", metalness: 0.38, roughness: 0.52 })
);
garageStand.position.y = -0.16;
garageScene.add(garageStand);
const garageRing = new THREE.Mesh(
  new THREE.TorusGeometry(3.8, 0.045, 8, 64),
  new THREE.MeshStandardMaterial({ color: "#b7ff5c", emissive: "#506d2b", emissiveIntensity: 0.55 })
);
garageRing.rotation.x = Math.PI / 2;
garageRing.position.y = -0.06;
garageScene.add(garageRing);
const garageCamera = new THREE.PerspectiveCamera(34, 1, 0.1, 60);
garageCamera.position.set(7.5, 4.1, 8.5);
garageCamera.lookAt(0, 0.75, 0);

const materials = {
  grass: new THREE.MeshStandardMaterial({ map: grassTexture, color: "#cbd8b5", roughness: 1 }),
  road: new THREE.MeshStandardMaterial({ map: asphaltTexture, color: "#f0f0eb", roughness: 0.98 }),
  curb: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.86 }),
  runoff: new THREE.MeshStandardMaterial({ color: "#9b9d98", roughness: 0.94 }),
  lane: new THREE.MeshStandardMaterial({ color: "#e5e5d7", roughness: 0.9 }),
  rail: new THREE.MeshStandardMaterial({ color: "#d8d5c7", roughness: 0.65 }),
  darkRail: new THREE.MeshStandardMaterial({ color: "#252c30", roughness: 0.78 }),
  treeTrunk: new THREE.MeshStandardMaterial({ color: "#554331", roughness: 1 }),
  treeOne: new THREE.MeshStandardMaterial({ color: "#356346", roughness: 1 }),
  treeTwo: new THREE.MeshStandardMaterial({ color: "#48794c", roughness: 1 }),
  rock: new THREE.MeshStandardMaterial({ color: "#6d7565", roughness: 1 }),
  hill: new THREE.MeshStandardMaterial({ color: "#596d4a", roughness: 1 })
};

function trackPoint(t, lateral = 0) {
  const point = circuitCurve.getPointAt((t % 1 + 1) % 1);
  const tangent = trackTangent(t);
  return point.add(new THREE.Vector3(tangent.z, 0, -tangent.x).multiplyScalar(lateral));
}

function trackTangent(t) {
  return circuitCurve.getTangentAt((t % 1 + 1) % 1).setY(0).normalize();
}

function addRing(innerOffset, outerOffset, segments, material, y = 0.05) {
  const positions = [];
  const uvs = [];
  const indices = [];
  for (let index = 0; index <= segments; index += 1) {
    const point = index / segments;
    const inner = trackPoint(point, innerOffset);
    const outer = trackPoint(point, outerOffset);
    positions.push(inner.x, y, inner.z, outer.x, y, outer.z);
    uvs.push(point * 112, 0, point * 112, 1);
    if (index < segments) {
      const current = index * 2;
      indices.push(current, current + 2, current + 1, current + 1, current + 2, current + 3);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  const mesh = new THREE.Mesh(geometry, material);
  mesh.receiveShadow = true;
  scene.add(mesh);
  return mesh;
}

function addStrip(innerOffset, outerOffset, segments, colorForSegment, skipSegment = () => false, y = 0.09) {
  const positions = [];
  const colors = [];
  const indices = [];
  for (let index = 0; index < segments; index += 1) {
    if (skipSegment(index)) continue;
    const t0 = index / segments;
    const t1 = (index + 1) / segments;
    const points = [
      trackPoint(t0, innerOffset),
      trackPoint(t0, outerOffset),
      trackPoint(t1, innerOffset),
      trackPoint(t1, outerOffset)
    ];
    const color = new THREE.Color(colorForSegment(index));
    const base = positions.length / 3;
    for (const point of points) {
      positions.push(point.x, y, point.z);
      colors.push(color.r, color.g, color.b);
    }
    indices.push(base, base + 2, base + 1, base + 1, base + 2, base + 3);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  const mesh = new THREE.Mesh(geometry, materials.curb);
  mesh.receiveShadow = true;
  scene.add(mesh);
}

function addBox(parent, material, dimensions, position, castShadow = true) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(...dimensions), material);
  mesh.position.set(...position);
  mesh.castShadow = castShadow;
  mesh.receiveShadow = true;
  parent.add(mesh);
  return mesh;
}

function addInstancedScenery() {
  const treeCount = 180;
  const treeMeshes = [
    new THREE.InstancedMesh(new THREE.CylinderGeometry(0.35, 0.55, 2.1, 7), materials.treeTrunk, treeCount),
    new THREE.InstancedMesh(new THREE.ConeGeometry(2.2, 4.3, 9), materials.treeOne, treeCount),
    new THREE.InstancedMesh(new THREE.ConeGeometry(1.75, 4.1, 9), materials.treeTwo, treeCount),
    new THREE.InstancedMesh(new THREE.ConeGeometry(1.22, 3.3, 9), materials.treeOne, treeCount)
  ];
  const dummy = new THREE.Object3D();
  for (let index = 0; index < treeCount; index += 1) {
    const t = (index * 0.61803398875) % 1;
    const scale = 0.7 + ((index * 7) % 8) / 10;
    const position = trackPoint(t, 18 + ((index * 13) % 39));
    const heights = [1.05, 3.1, 5.25, 7.25];
    treeMeshes.forEach((mesh, meshIndex) => {
      dummy.position.set(position.x, heights[meshIndex] * scale, position.z);
      dummy.scale.setScalar(scale);
      dummy.updateMatrix();
      mesh.setMatrixAt(index, dummy.matrix);
      if (meshIndex > 0) {
        mesh.setColorAt(index, new THREE.Color().setHSL(0.28 + (index % 8) * 0.009, 0.2, 0.84 + (index % 3) * 0.025));
      }
    });
  }
  for (const mesh of treeMeshes) {
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    scene.add(mesh);
  }

  const rockCount = 70;
  const rocks = new THREE.InstancedMesh(new THREE.DodecahedronGeometry(1, 0), materials.rock, rockCount);
  for (let index = 0; index < rockCount; index += 1) {
    const t = (index * 0.754877666) % 1;
    const position = trackPoint(t, 13 + ((index * 11) % 15));
    const scale = 0.5 + (index % 4) * 0.18;
    dummy.position.set(position.x, 0.35, position.z);
    dummy.rotation.set(index, index * 0.3, index * 0.7);
    dummy.scale.set(scale * 1.4, scale * 0.7, scale * 0.9);
    dummy.updateMatrix();
    rocks.setMatrixAt(index, dummy.matrix);
  }
  rocks.castShadow = false;
  rocks.instanceMatrix.needsUpdate = true;
  scene.add(rocks);

  const hillCount = 18;
  const hills = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 2), materials.hill, hillCount);
  for (let index = 0; index < hillCount; index += 1) {
    const angle = (index / hillCount) * Math.PI * 2 + 0.12;
    const radius = 260 + (index * 17) % 44;
    const height = 8 + (index * 7) % 9;
    dummy.position.set(Math.cos(angle) * radius, height * 0.32 - 0.3, Math.sin(angle) * radius * 0.78);
    dummy.rotation.set(index * 0.09, angle, index * 0.17);
    dummy.scale.set(18 + (index % 4) * 5, height, 14 + (index % 3) * 4);
    dummy.updateMatrix();
    hills.setMatrixAt(index, dummy.matrix);
    hills.setColorAt(index, new THREE.Color().setHSL(0.25 + (index % 5) * 0.012, 0.22, 0.77 + (index % 3) * 0.035));
  }
  hills.receiveShadow = true;
  hills.instanceMatrix.needsUpdate = true;
  if (hills.instanceColor) hills.instanceColor.needsUpdate = true;
  scene.add(hills);
}

function addMountainBackdrop() {
  const peaks = [
    [-280, 230], [-180, 260], [-45, 275], [100, 265], [245, 230],
    [285, 155], [290, 50], [285, -60], [240, -185], [130, -245],
    [0, -260], [-130, -240], [-245, -190], [-295, -80], [-290, 70]
  ];
  const geometry = new THREE.ConeGeometry(1, 1, 9);
  const material = new THREE.MeshStandardMaterial({ color: "#65716d", roughness: 1 });
  const snowMaterial = new THREE.MeshStandardMaterial({ color: "#c5cfca", roughness: 1 });
  const mountainMesh = new THREE.InstancedMesh(geometry, material, peaks.length);
  const snowMesh = new THREE.InstancedMesh(new THREE.ConeGeometry(1, 1, 9), snowMaterial, peaks.length);
  const dummy = new THREE.Object3D();

  peaks.forEach(([x, z], index) => {
    const height = 28 + (index * 17) % 25;
    const radius = 20 + (index * 11) % 13;
    dummy.position.set(x, height / 2 - 1, z);
    dummy.rotation.y = index * 0.83;
    dummy.scale.set(radius, height, radius * 0.78);
    dummy.updateMatrix();
    mountainMesh.setMatrixAt(index, dummy.matrix);
    mountainMesh.setColorAt(index, new THREE.Color().setHSL(0.49 + (index % 4) * 0.012, 0.12, 0.83 + (index % 3) * 0.035));

    dummy.position.y = height * 0.77;
    dummy.scale.set(radius * 0.38, height * 0.42, radius * 0.3);
    dummy.updateMatrix();
    snowMesh.setMatrixAt(index, dummy.matrix);
  });

  mountainMesh.receiveShadow = true;
  mountainMesh.instanceMatrix.needsUpdate = true;
  if (mountainMesh.instanceColor) mountainMesh.instanceColor.needsUpdate = true;
  snowMesh.instanceMatrix.needsUpdate = true;
  scene.add(mountainMesh, snowMesh);
}

function addGrandstand(t, side) {
  const position = trackPoint(t, side * 29);
  const tangent = trackTangent(t);
  const stand = new THREE.Group();
  stand.position.copy(position);
  stand.rotation.y = Math.atan2(tangent.x, tangent.z);
  const concrete = new THREE.MeshStandardMaterial({ color: "#b5b4a7", roughness: 0.92 });
  const seats = new THREE.MeshStandardMaterial({ color: "#bb684b", roughness: 0.8 });
  addBox(stand, concrete, [27, 1, 7], [0, 0.5, 0]);
  for (let row = 0; row < 4; row += 1) {
    addBox(stand, seats, [25 - row * 1.4, 0.55, 1.15], [0, 1.25 + row * 0.58, -2.2 + row * 1.15]);
  }
  for (let x = -12; x <= 12; x += 4) {
    const person = new THREE.Mesh(
      new THREE.SphereGeometry(0.42, 7, 6),
      new THREE.MeshStandardMaterial({ color: ["#e6bb76", "#81b7bb", "#dc7560"][Math.abs(x / 4) % 3] })
    );
    person.position.set(x, 2.1, 1.1);
    stand.add(person);
  }
  scene.add(stand);
}

function addPitBuilding() {
  const building = new THREE.Group();
  building.position.copy(trackPoint(0.035, 19));
  building.rotation.y = Math.atan2(trackTangent(0).x, trackTangent(0).z);
  const structure = new THREE.MeshStandardMaterial({ color: "#b9c1bd", roughness: 0.82 });
  const roof = new THREE.MeshStandardMaterial({ color: "#272f34", metalness: 0.3, roughness: 0.48 });
  const glass = new THREE.MeshStandardMaterial({ color: "#34505b", metalness: 0.38, roughness: 0.24 });
  addBox(building, structure, [8, 4.2, 26], [0, 2.1, 0]);
  addBox(building, roof, [9, 0.55, 27], [0, 4.48, 0]);
  addBox(building, roof, [0.2, 1.15, 23], [-4.12, 1.1, 0]);
  for (let index = 0; index < 6; index += 1) {
    addBox(building, glass, [0.14, 1.6, 3.2], [-4.07, 3.0, -9.5 + index * 3.8], false);
  }
  addBox(building, roof, [0.18, 0.18, 24], [-4.18, 2.05, 0]);
  const sign = new THREE.MeshStandardMaterial({ color: "#b7ff5c", emissive: "#304516" });
  addBox(building, sign, [0.35, 0.9, 7], [-4.55, 3.1, 0], false);
  scene.add(building);
}

function buildTrack() {
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(660, 600), materials.grass);
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -0.32;
  ground.receiveShadow = true;
  scene.add(ground);

  addRing(-ROAD_HALF_WIDTH, ROAD_HALF_WIDTH, 1100, materials.road, 0.02);
  addRing(-10.8, -8.4, 1100, materials.runoff, 0.015);
  addRing(8.4, 10.8, 1100, materials.runoff, 0.015);
  addStrip(-8.4, -7.2, 900, (index) => Math.floor(index / 5) % 2 ? "#f0eee3" : "#df6653");
  addStrip(7.2, 8.4, 900, (index) => Math.floor(index / 5) % 2 ? "#f0eee3" : "#df6653");
  addStrip(-7.05, -6.86, 1100, () => "#f1f0e7", () => false, 0.085);
  addStrip(6.86, 7.05, 1100, () => "#f1f0e7", () => false, 0.085);

  for (const side of [-1, 1]) {
    const railPath = [];
    for (let index = 0; index <= 700; index += 1) {
      const point = trackPoint(index / 700, side * 11.5);
      point.y = 1.25;
      railPath.push(point);
    }
    const curve = new THREE.CatmullRomCurve3(railPath, true, "centripetal");
    const rail = new THREE.Mesh(new THREE.TubeGeometry(curve, 900, 0.38, 7, true), materials.rail);
    rail.castShadow = false;
    rail.receiveShadow = true;
    scene.add(rail);

    const postCount = 180;
    const posts = new THREE.InstancedMesh(new THREE.BoxGeometry(0.25, 1.1, 0.25), materials.darkRail, postCount);
    const dummy = new THREE.Object3D();
    for (let index = 0; index < postCount; index += 1) {
      const point = trackPoint(index / postCount, side * 11.5);
      dummy.position.set(point.x, 0.56, point.z);
      dummy.rotation.set(0, Math.atan2(trackTangent(index / postCount).x, trackTangent(index / postCount).z), 0);
      dummy.updateMatrix();
      posts.setMatrixAt(index, dummy.matrix);
    }
    posts.castShadow = false;
    posts.instanceMatrix.needsUpdate = true;
    scene.add(posts);
  }

  const start = trackPoint(0);
  const startYaw = Math.atan2(trackTangent(0).x, trackTangent(0).z);
  const startLine = new THREE.Group();
  startLine.position.copy(start);
  startLine.rotation.y = startYaw;
  for (let index = 0; index < 12; index += 1) {
    const square = new THREE.Mesh(
      new THREE.BoxGeometry(ROAD_HALF_WIDTH * 2 / 12, 0.08, 0.55),
      new THREE.MeshStandardMaterial({ color: index % 2 ? "#f5f2e7" : "#20252a", roughness: 0.85 })
    );
    square.position.set(-ROAD_HALF_WIDTH + (index + 0.5) * ROAD_HALF_WIDTH * 2 / 12, 0.12, 0);
    startLine.add(square);
  }
  scene.add(startLine);

  const arch = new THREE.Group();
  arch.position.copy(start);
  arch.rotation.y = startYaw;
  const archMat = new THREE.MeshStandardMaterial({ color: "#202930", metalness: 0.25, roughness: 0.62 });
  addBox(arch, archMat, [0.8, 5, 0.8], [-8.7, 2.5, 0]);
  addBox(arch, archMat, [0.8, 5, 0.8], [8.7, 2.5, 0]);
  addBox(arch, archMat, [18.2, 0.9, 0.9], [0, 5, 0]);
  const sign = new THREE.Mesh(new THREE.BoxGeometry(8, 1.3, 0.35), new THREE.MeshStandardMaterial({ color: "#b7ff5c", emissive: "#304516" }));
  sign.position.set(0, 5, 0.58);
  arch.add(sign);
  scene.add(arch);

  addGrandstand(0.2, 1);
  addGrandstand(0.72, -1);
  addPitBuilding();
  addMountainBackdrop();
  addInstancedScenery();
}

function makeLabel(text, isPlayer) {
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 128;
  const context = canvas.getContext("2d");
  context.fillStyle = "#07101dc9";
  context.beginPath();
  context.roundRect(16, 16, 480, 96, 20);
  context.fill();
  context.fillStyle = isPlayer ? "#b7ff5c" : "#f4f4eb";
  context.font = "700 50px Inter, sans-serif";
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.fillText(text, 256, 64, 450);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, transparent: true, depthTest: false }));
  sprite.scale.set(5, 1.25, 1);
  sprite.position.y = 4;
  return sprite;
}

const carStyles = [
  { length: 4.25, width: 1.94, cabinLength: 1.6, cabinWidth: 1.45, cabinHeight: 0.62, rearWing: 0, roofScoop: false, rim: "#d9e2dd", accent: "#eff2e9" },
  { length: 4.7, width: 2.1, cabinLength: 1.35, cabinWidth: 1.3, cabinHeight: 0.52, rearWing: 1.2, roofScoop: false, rim: "#bac5cf", accent: "#f1be57" },
  { length: 4.65, width: 2.18, cabinLength: 1.8, cabinWidth: 1.62, cabinHeight: 0.66, rearWing: 0.8, roofScoop: false, rim: "#e7bb72", accent: "#46d1c1" },
  { length: 4.15, width: 2.0, cabinLength: 1.65, cabinWidth: 1.55, cabinHeight: 0.72, rearWing: 0.65, roofScoop: true, rim: "#efeee5", accent: "#e7e4d8" },
  { length: 4.5, width: 2.16, cabinLength: 1.55, cabinWidth: 1.4, cabinHeight: 0.58, rearWing: 1.45, roofScoop: false, rim: "#c5e0dc", accent: "#de6955" },
  { length: 4.9, width: 2.2, cabinLength: 1.2, cabinWidth: 1.22, cabinHeight: 0.48, rearWing: 1.05, roofScoop: true, rim: "#d6c6fa", accent: "#c0adf3" }
];

function addCarProfile(root, material, outline, depth) {
  const shape = new THREE.Shape();
  shape.moveTo(...outline[0]);
  for (const point of outline.slice(1)) shape.lineTo(...point);
  shape.closePath();
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth,
    bevelEnabled: true,
    bevelSegments: 2,
    bevelSize: 0.035,
    bevelThickness: 0.025,
    curveSegments: 5
  });
  geometry.rotateY(Math.PI / 2);
  geometry.translate(-depth / 2, 0, 0);
  const mesh = new THREE.Mesh(geometry, material);
  mesh.userData.vehicleShadowCaster = true;
  root.add(mesh);
  return mesh;
}

function makeWindowGeometry(width, height, topWidthRatio = 0.72) {
  const shape = new THREE.Shape();
  shape.moveTo(-width / 2, -height / 2);
  shape.lineTo(width / 2, -height / 2);
  shape.lineTo(width * topWidthRatio / 2, height / 2);
  shape.lineTo(-width * topWidthRatio / 2, height / 2);
  shape.closePath();
  return new THREE.ShapeGeometry(shape);
}

function makeCar(car, targetScene = scene) {
  const styleIndex = Number.isInteger(car.carIndex) ? car.carIndex : (Number(car.gridIndex) || 0) % carStyles.length;
  const style = carStyles[styleIndex] || carStyles[0];
  const finish = car.finish || "glossy";
  const finishRoughness = { glossy: 0.2, matte: 0.72, metallic: 0.29, pearl: 0.24 }[finish] || 0.28;
  const spoilerChoice = car.spoiler || "stock";
  const rearWing = spoilerChoice === "none"
    ? 0
    : spoilerChoice === "race" ? Math.max(1.3, style.rearWing)
      : spoilerChoice === "sport" ? Math.max(0.7, style.rearWing * 0.72)
        : style.rearWing;
  const decalChoice = car.decals || "twin-stripe";
  const root = new THREE.Group();
  const paint = new THREE.MeshPhysicalMaterial({
    color: car.color,
    metalness: finish === "metallic" ? 0.76 : finish === "pearl" ? 0.5 : 0.36,
    roughness: finishRoughness,
    clearcoat: 0.94,
    clearcoatRoughness: finish === "matte" ? 0.55 : 0.11
  });
  const accent = new THREE.MeshStandardMaterial({ color: style.accent, metalness: 0.32, roughness: 0.34 });
  const dark = new THREE.MeshStandardMaterial({ color: "#171d23", metalness: 0.12, roughness: 0.52 });
  const glass = new THREE.MeshPhysicalMaterial({
    color: "#7c9aa0",
    metalness: 0.35,
    roughness: 0.16,
    clearcoat: 0.9,
    transparent: true,
    opacity: 0.48,
    side: THREE.DoubleSide,
    depthWrite: false
  });
  const tire = new THREE.MeshStandardMaterial({ color: "#111417", roughness: 0.92 });
  const sidewall = new THREE.MeshStandardMaterial({ color: "#292d2f", roughness: 0.76 });
  const rim = new THREE.MeshStandardMaterial({ color: car.wheelColor || style.rim, metalness: 0.76, roughness: 0.28 });
  const brake = new THREE.MeshStandardMaterial({ color: "#737b7d", metalness: 0.76, roughness: 0.35 });
  const lug = new THREE.MeshStandardMaterial({ color: "#d3d9d4", metalness: 0.82, roughness: 0.24 });
  const interior = new THREE.MeshStandardMaterial({ color: "#101519", roughness: 0.82 });
  const underglowMaterial = new THREE.MeshBasicMaterial({
    map: glowTexture,
    color: car.color,
    transparent: true,
    opacity: 0.48,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide,
    toneMapped: false
  });
  const underglow = new THREE.Mesh(
    new THREE.PlaneGeometry(style.width * 1.65, style.length * 1.18),
    underglowMaterial
  );
  underglow.rotation.x = -Math.PI / 2;
  underglow.position.y = 0.055;
  root.add(underglow);
  const halfLength = style.length / 2;
  const wheelbase = style.length * 0.62;
  const wheelX = style.width * 0.52;
  const wheelZ = wheelbase / 2;
  addCarProfile(root, paint, [
    [-halfLength, 0.43],
    [-halfLength, 0.57],
    [-halfLength * 0.94, 0.65],
    [-style.length * 0.28, 0.88],
    [-style.length * 0.12, 0.94],
    [style.length * 0.2, 0.9],
    [halfLength * 0.84, 0.69],
    [halfLength * 0.98, 0.62],
    [halfLength * 0.96, 0.43]
  ], style.width * 0.96);
  addCarProfile(root, paint, [
    [-style.cabinLength * 0.52, 0.98],
    [-style.cabinLength * 0.43, 1.18],
    [-style.cabinLength * 0.2, 1.25 + style.cabinHeight * 0.48],
    [style.cabinLength * 0.24, 1.25 + style.cabinHeight * 0.48],
    [style.cabinLength * 0.49, 1.15],
    [style.cabinLength * 0.53, 0.98]
  ], style.cabinWidth * 0.94);
  addBox(root, interior, [style.cabinWidth * 0.82, 0.16, style.cabinLength * 0.72], [0, 1.03, -0.03]);
  for (const x of [-style.cabinWidth * 0.24, style.cabinWidth * 0.24]) {
    addBox(root, interior, [0.27, 0.43, 0.32], [x, 1.15, -0.24]);
  }
  addBox(root, dark, [style.cabinWidth * 0.72, 0.1, 0.12], [0, 1.31, style.cabinLength * 0.27]);
  const frontGlass = new THREE.Mesh(makeWindowGeometry(style.cabinWidth * 0.82, style.cabinHeight * 0.58), glass);
  frontGlass.position.set(0, 1.34, style.cabinLength * 0.39);
  frontGlass.rotation.x = 0.42;
  root.add(frontGlass);
  const rearGlass = new THREE.Mesh(makeWindowGeometry(style.cabinWidth * 0.76, style.cabinHeight * 0.52), glass);
  rearGlass.position.set(0, 1.34, -style.cabinLength * 0.4);
  rearGlass.rotation.x = -0.42;
  root.add(rearGlass);
  for (const side of [-1, 1]) {
    const sideGlass = new THREE.Mesh(makeWindowGeometry(style.cabinLength * 0.72, style.cabinHeight * 0.5, 0.8), glass);
    sideGlass.position.set(side * (style.cabinWidth * 0.94 / 2 + 0.008), 1.4, -0.03);
    sideGlass.rotation.y = side * Math.PI / 2;
    root.add(sideGlass);
  }
  addBox(root, dark, [style.width * 1.08, 0.13, 0.36], [0, 0.45, halfLength + 0.08]);
  addBox(root, dark, [style.width * 1.08, 0.18, 0.3], [0, 0.46, -halfLength - 0.04]);
  addBox(root, dark, [style.width * 0.42, 0.23, 0.11], [0, 0.62, halfLength + 0.13]);
  for (const x of [-style.width * 0.13, 0, style.width * 0.13]) {
    addBox(root, dark, [0.035, 0.025, 0.025], [x, 0.62, halfLength + 0.19], false);
  }
  addBox(root, dark, [style.width * 0.67, 0.1, style.length * 0.28], [0, 1.145, style.length * 0.29]);
  const stripeOffsets = decalChoice === "none" ? [] : decalChoice === "minimal" ? [0] : [-style.width * 0.17, style.width * 0.17];
  for (const x of stripeOffsets) {
    const stripeWidth = decalChoice === "minimal" ? style.width * 0.08 : style.width * 0.075;
    addBox(root, accent, [stripeWidth, 0.035, style.length * 0.3], [x, 1.15, style.length * 0.29], false);
  }
  if (decalChoice === "rally") {
    addBox(root, accent, [style.width * 0.12, 0.04, style.length * 0.44], [0, 1.16, -style.length * 0.04], false);
  }
  for (const side of [-1, 1]) {
    addBox(root, dark, [0.14, 0.18, style.length * 0.54], [side * style.width * 0.5, 0.43, 0]);
    addBox(root, dark, [0.3, 0.15, 0.34], [side * style.cabinWidth * 0.57, 1.32, 0.52]);
    addBox(root, dark, [0.16, 0.12, 0.22], [side * (style.cabinWidth * 0.53), 1.4, 0.48]);
    const doorLine = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(side * style.width * 0.48, 0.91, -0.48),
      new THREE.Vector3(side * style.width * 0.48, 0.48, -0.48),
      new THREE.Vector3(side * style.width * 0.48, 0.46, 0.63),
      new THREE.Vector3(side * style.width * 0.48, 0.9, 0.63)
    ]);
    root.add(new THREE.Line(doorLine, new THREE.LineBasicMaterial({ color: "#30383c" })));
    if (decalChoice !== "none") {
      addBox(root, accent, [0.035, 0.12, style.length * 0.34], [side * (style.width * 0.5 + 0.015), 0.73, -0.02], false);
    }
    addBox(root, dark, [0.14, 0.045, 0.3], [side * style.width * 0.39, 0.92, 0.08], false);
    addBox(root, dark, [0.055, 0.08, style.length * 0.14], [side * (style.width * 0.5 + 0.016), 0.88, -style.length * 0.16], false);
    addBox(root, accent, [0.035, 0.055, 0.22], [side * (style.width * 0.5 + 0.02), 0.91, -style.length * 0.16], false);
    addBox(root, dark, [0.13, 0.11, 0.28], [side * style.width * 0.48, 1.2, 0.47]);
    addBox(root, accent, [0.08, 0.035, 0.2], [side * style.width * 0.5, 1.23, 0.47], false);
    for (const z of [-wheelZ, wheelZ]) {
      addBox(root, dark, [0.07, 0.04, 0.46], [side * (style.width * 0.51), 0.39, z]);
    }
  }
  if (decalChoice === "twin-stripe" || decalChoice === "rally") {
    for (const side of [-1, 1]) {
      addBox(root, accent, [style.width * 0.055, 0.04, style.length * 0.5], [side * style.width * 0.16, 1.155, 0.02], false);
    }
  }
  if (style.roofScoop) addBox(root, dark, [0.52, 0.28, 0.68], [0, 1.72, -0.05]);
  if (rearWing) {
    addBox(root, dark, [0.12, 0.55, 0.14], [-style.width * 0.34, 1.24, -halfLength * 0.83]);
    addBox(root, dark, [0.12, 0.55, 0.14], [style.width * 0.34, 1.24, -halfLength * 0.83]);
    addBox(root, paint, [style.width + rearWing, 0.16, 0.52], [0, 1.55, -halfLength * 0.88]);
    addBox(root, accent, [style.width * 0.74, 0.035, 0.055], [0, 1.65, -halfLength * 0.88], false);
  }
  if (style.rearWing > 1) addBox(root, dark, [style.width * 0.92, 0.24, 0.2], [0, 0.48, -halfLength - 0.12]);

  const wheels = [];
  for (const x of [-wheelX, wheelX]) {
    for (const z of [-wheelZ, wheelZ]) {
      const wheel = new THREE.Group();
      wheel.position.set(x, 0.47, z);
      const tireMesh = new THREE.Mesh(new THREE.TorusGeometry(0.34, 0.13, 12, 28), tire);
      tireMesh.rotation.y = Math.PI / 2;
      tireMesh.castShadow = true;
      wheel.add(tireMesh);
      const sidewallMesh = new THREE.Mesh(new THREE.TorusGeometry(0.275, 0.018, 6, 24), sidewall);
      sidewallMesh.rotation.y = Math.PI / 2;
      sidewallMesh.position.x = x > 0 ? 0.11 : -0.11;
      wheel.add(sidewallMesh);
      const brakeMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.31, 0.31, 0.06, 20), brake);
      brakeMesh.rotation.z = Math.PI / 2;
      wheel.add(brakeMesh);
      const rimMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.43, 16), rim);
      rimMesh.rotation.z = Math.PI / 2;
      wheel.add(rimMesh);
      const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.085, 0.085, 0.45, 12), dark);
      hub.rotation.z = Math.PI / 2;
      wheel.add(hub);
      const spokeCount = car.wheelStyle === "mesh" ? 10 : car.wheelStyle === "rally" ? 6 : 5;
      const spokes = new THREE.InstancedMesh(new THREE.BoxGeometry(0.055, 0.22, 0.06), rim, spokeCount);
      const spokeTransform = new THREE.Object3D();
      for (let index = 0; index < spokeCount; index += 1) {
        const angle = (index / spokeCount) * Math.PI * 2;
        spokeTransform.position.set(0, Math.cos(angle) * 0.12, Math.sin(angle) * 0.12);
        spokeTransform.rotation.x = angle;
        spokeTransform.updateMatrix();
        spokes.setMatrixAt(index, spokeTransform.matrix);
      }
      spokes.instanceMatrix.needsUpdate = true;
      wheel.add(spokes);
      const lugBolts = new THREE.InstancedMesh(new THREE.SphereGeometry(0.022, 6, 5), lug, 5);
      const lugTransform = new THREE.Object3D();
      for (let index = 0; index < 5; index += 1) {
        const angle = (index / 5) * Math.PI * 2;
        lugTransform.position.set(0.225, Math.cos(angle) * 0.105, Math.sin(angle) * 0.105);
        lugTransform.updateMatrix();
        lugBolts.setMatrixAt(index, lugTransform.matrix);
      }
      lugBolts.instanceMatrix.needsUpdate = true;
      wheel.add(lugBolts);
      root.add(wheel);
      wheels.push(wheel);
    }
  }
  const headlightMat = new THREE.MeshStandardMaterial({ color: "#edf5d8", emissive: "#879975", emissiveIntensity: 1.4 });
  for (const x of [-style.width * 0.34, style.width * 0.34]) {
    addBox(root, dark, [0.43, 0.2, 0.12], [x, 0.79, halfLength + 0.045]);
    addBox(root, headlightMat, [0.35, 0.11, 0.06], [x, 0.8, halfLength + 0.11], false);
  }
  addBox(root, accent, [style.width * 0.32, 0.055, 0.035], [0, 0.84, halfLength + 0.105], false);
  const markerMat = new THREE.MeshStandardMaterial({ color: "#ffc46b", emissive: "#75431a", emissiveIntensity: 0.5 });
  for (const x of [-style.width * 0.44, style.width * 0.44]) {
    addBox(root, markerMat, [0.08, 0.12, 0.05], [x, 0.76, halfLength + 0.11], false);
  }
  const taillightMat = new THREE.MeshStandardMaterial({ color: "#ff4f55", emissive: "#922629", emissiveIntensity: 0.8 });
  for (const x of [-style.width * 0.35, style.width * 0.35]) {
    addBox(root, dark, [0.46, 0.2, 0.12], [x, 0.79, -halfLength - 0.045]);
    addBox(root, taillightMat, [0.37, 0.12, 0.06], [x, 0.8, -halfLength - 0.105], false);
  }
  const exhaust = new THREE.MeshStandardMaterial({ color: "#a6ada8", metalness: 0.82, roughness: 0.28 });
  for (const x of [-style.width * 0.29, style.width * 0.29]) {
    const tip = new THREE.Mesh(new THREE.CylinderGeometry(0.085, 0.11, 0.2, 10), exhaust);
    tip.rotation.x = Math.PI / 2;
    tip.position.set(x, 0.43, -halfLength - 0.15);
    root.add(tip);
  }
  const marker = makeLabel(car.id === playerId ? "YOU" : car.name.toUpperCase(), car.id === playerId);
  root.add(marker);
  root.traverse((object) => {
    if (object.isMesh) {
      object.castShadow = Boolean(object.userData.vehicleShadowCaster);
      object.receiveShadow = false;
    }
  });
  root.userData.paint = paint;
  root.userData.rim = rim;
  root.userData.label = marker;
  root.userData.wheels = wheels;
  root.userData.targetPosition = new THREE.Vector3();
  root.userData.targetYaw = 0;
  root.userData.lastProgress = car.progress;
  root.userData.gridIndex = car.gridIndex;
  root.userData.initialized = false;
  targetScene.add(root);
  return root;
}

function upgradeLevels(carIndex) {
  const saved = profile?.upgrades?.[carIndex] || {};
  return {
    engine: Number(saved.engine) || 0,
    handling: Number(saved.handling) || 0,
    brakes: Number(saved.brakes) || 0
  };
}

function updateProfileDisplay() {
  if (!profile) return;
  const nextLevelXp = profile.level * 250;
  document.getElementById("profile-level").textContent = String(profile.level).padStart(2, "0");
  document.getElementById("profile-credits").textContent = profile.credits.toLocaleString();
  document.getElementById("profile-xp").textContent = `${profile.xp} / ${nextLevelXp} XP`;
  document.getElementById("profile-xp-bar").style.width = `${Math.min(100, profile.xp / nextLevelXp * 100)}%`;
}

function disposeCar(root) {
  root.traverse((object) => {
    if (object.isMesh || object.isLine) {
      object.geometry.dispose();
      if (Array.isArray(object.material)) object.material.forEach((material) => material.dispose());
      else object.material.dispose();
    }
    if (object.isSprite) {
      object.material.map?.dispose();
      object.material.dispose();
    }
  });
}

function updateGaragePreview(index, color, customization = {}) {
  const wheelColor = customization.wheelColor || carStyles[index].rim;
  const signature = [
    index, color, wheelColor, customization.wheelStyle, customization.finish,
    customization.decals, customization.spoiler
  ].join("|");
  if (garagePreviewRoot?.userData.previewSignature === signature) return;
  if (garagePreviewRoot) {
    garageScene.remove(garagePreviewRoot);
    disposeCar(garagePreviewRoot);
  }
  const vehicle = vehicleCatalog[index];
  garagePreviewRoot = makeCar({
    id: "garage-preview",
    name: vehicle.name,
    carIndex: index,
    gridIndex: index,
    color,
    progress: 0,
    ...customization
  }, garageScene);
  garagePreviewRoot.position.set(0, -0.07, 0);
  garagePreviewRoot.scale.setScalar(1.06);
  garagePreviewRoot.userData.label.visible = false;
  garagePreviewRoot.userData.previewSignature = signature;
  garagePreviewRoot.userData.previewIndex = index;
}

function updateGarageUI() {
  if (!profile) return;
  const vehicle = vehicleCatalog[garageIndex];
  const owned = profile.ownedCars.includes(garageIndex);
  const selected = profile.selectedCar === garageIndex;
  const levels = upgradeLevels(garageIndex);
  const customization = profile.customizations?.[garageIndex] || {
    wheelColor: carStyles[garageIndex].rim,
    wheelStyle: "five-spoke",
    finish: "glossy",
    decals: "twin-stripe",
    spoiler: "stock"
  };
  const paint = profile.paintColors[garageIndex] || "#55e6c1";
  const action = document.getElementById("garage-car-action");
  const actionLabel = !owned
    ? `BUY CAR · ${vehicle.price.toLocaleString()} CR`
    : selected ? "CURRENT BUILD" : "SELECT THIS CAR";
  document.getElementById("garage-car-name").textContent = vehicle.name.toUpperCase();
  document.getElementById("garage-car-category").textContent = vehicle.category;
  document.getElementById("garage-car-index").textContent = `${String(garageIndex + 1).padStart(2, "0")} / ${String(vehicleCatalog.length).padStart(2, "0")}`;
  document.getElementById("garage-car-unlock").textContent = owned
    ? selected ? "OWNED · CURRENTLY SELECTED" : "OWNED · READY TO DRIVE"
    : `LEVEL ${vehicle.unlockLevel} · ${vehicle.price.toLocaleString()} CREDITS`;
  document.getElementById("garage-owned").textContent = owned ? selected ? "SELECTED" : "OWNED" : "LOCKED";
  document.getElementById("garage-owned").classList.toggle("locked", !owned);
  document.getElementById("garage-speed").textContent = `${Math.round(132 * vehicle.topSpeed * (1 + levels.engine * 0.025))} KM/H`;
  document.getElementById("garage-accel").textContent = `${(vehicle.acceleration * (1 + levels.engine * 0.07)).toFixed(2)}×`;
  document.getElementById("garage-handling").textContent = `${Math.round(vehicle.handling * (1 + levels.handling * 0.07) * 100)}%`;
  document.getElementById("garage-tank").textContent = `${vehicle.fuelCapacity} L`;
  action.textContent = actionLabel;
  action.disabled = (owned && selected) || (!owned && profile.level < vehicle.unlockLevel);
  document.getElementById("paint-color").value = paint;
  document.getElementById("paint-color").disabled = !owned;
  document.getElementById("wheel-color").value = customization.wheelColor;
  document.getElementById("wheel-color").disabled = !owned;
  document.getElementById("body-finish").value = customization.finish;
  document.getElementById("wheel-style").value = customization.wheelStyle;
  document.getElementById("decal-style").value = customization.decals;
  document.getElementById("spoiler-style").value = customization.spoiler;
  for (const selector of document.querySelectorAll(".customize-options select")) selector.disabled = !owned;
  updateGaragePreview(garageIndex, paint, customization);

  for (const button of document.querySelectorAll(".upgrade-button")) {
    const type = button.dataset.upgrade;
    const level = levels[type];
    const price = 700 + level * 450;
    document.getElementById(`upgrade-${type}-level`).textContent = `${level} / 3`;
    button.textContent = level >= 3 ? "MAX LEVEL" : `UPGRADE · ${price} CR`;
    button.disabled = !owned || level >= 3 || profile.credits < price;
  }
}

function renderGaragePreview(time, delta) {
  if (!profile || appState !== "menu" || menuPage !== "garage" || !garagePreviewRoot) return;
  const width = garagePreviewNode.clientWidth;
  const height = garagePreviewNode.clientHeight;
  if (!width || !height) return;
  if (garageRenderer.domElement.width !== Math.round(width * garageRenderer.getPixelRatio()) ||
      garageRenderer.domElement.height !== Math.round(height * garageRenderer.getPixelRatio())) {
    garageRenderer.setSize(width, height, false);
  }
  garageCamera.aspect = width / height;
  garageCamera.updateProjectionMatrix();
  garagePreviewRoot.rotation.y = time / 9000;
  for (const wheel of garagePreviewRoot.userData.wheels) wheel.rotation.x += delta * 0.22;
  garageRenderer.render(garageScene, garageCamera);
}

function defaultProfile() {
  return {
    credits: 1800,
    level: 1,
    xp: 0,
    races: 0,
    wins: 0,
    podiums: 0,
    ownedCars: [0],
    selectedCar: 0,
    paintColors: { 0: "#55e6c1" },
    customizations: { 0: { wheelColor: "#d9e2dd", wheelStyle: "five-spoke", finish: "glossy", decals: "twin-stripe", spoiler: "stock" } },
    upgrades: { 0: { engine: 0, handling: 0, brakes: 0 } },
    lastAwardedRaceId: ""
  };
}

function bytesToBase64(bytes) {
  return btoa(Array.from(bytes, (byte) => String.fromCharCode(byte)).join(""));
}

function base64ToBytes(value) {
  return Uint8Array.from(atob(value), (character) => character.charCodeAt(0));
}

async function deriveProfileKey(password, salt) {
  const material = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveKey"]);
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", salt, iterations: 310000, hash: "SHA-256" },
    material,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
}

async function syntheticAuthEmail(username) {
  const normalized = username.trim().toLowerCase();
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(normalized)));
  const identifier = Array.from(digest, (byte) => byte.toString(16).padStart(2, "0")).join("");
  return `${identifier}@players.rivalken.invalid`;
}

async function encryptProfile() {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const additionalData = new TextEncoder().encode(currentUserId);
  const plaintext = new TextEncoder().encode(JSON.stringify({ username: currentUser, profile }));
  const ciphertext = await crypto.subtle.encrypt({ name: "AES-GCM", iv, additionalData }, profileKey, plaintext);
  return {
    player_id: currentUserId,
    encrypted_profile: bytesToBase64(new Uint8Array(ciphertext)),
    encryption_salt: bytesToBase64(profileSalt),
    iv: bytesToBase64(iv),
    crypto_version: 1
  };
}

async function saveProfile() {
  if (!supabaseClient || !currentUserId || !profileKey || !profileSalt || !profile) {
    throw new Error("Sign in again before saving this profile.");
  }
  const { error } = await supabaseClient.from("player_profiles").upsert(await encryptProfile(), { onConflict: "player_id" });
  if (error) throw new Error(`Could not save your encrypted profile: ${error.message}`);
}

async function loadProfileForUser(userId, username, password) {
  const { data: row, error } = await supabaseClient
    .from("player_profiles")
    .select("encrypted_profile,encryption_salt,iv,crypto_version")
    .eq("player_id", userId)
    .maybeSingle();
  if (error) throw new Error(`Could not load your private profile: ${error.message}`);

  currentUserId = userId;
  currentUser = username.trim();
  if (row) {
    if (row.crypto_version !== 1) throw new Error("This profile uses an unsupported encryption version.");
    profileSalt = base64ToBytes(row.encryption_salt);
    profileKey = await deriveProfileKey(password, profileSalt);
    try {
      const plaintext = await crypto.subtle.decrypt(
        { name: "AES-GCM", iv: base64ToBytes(row.iv), additionalData: new TextEncoder().encode(userId) },
        profileKey,
        base64ToBytes(row.encrypted_profile)
      );
      const saved = JSON.parse(new TextDecoder().decode(plaintext));
      if (!saved.profile || typeof saved.username !== "string") throw new Error("Invalid profile");
      currentUser = saved.username;
      updateProfile({ username: currentUser, profile: saved.profile });
    } catch {
      profileKey = null;
      profileSalt = null;
      throw new Error("Could not decrypt this profile. Check your username and password; profile recovery is not available.");
    }
  } else {
    profileSalt = crypto.getRandomValues(new Uint8Array(16));
    profileKey = await deriveProfileKey(password, profileSalt);
    updateProfile({ username: currentUser, profile: defaultProfile() });
    await saveProfile();
  }
}

function updateProfile(result) {
  currentUser = result.username || currentUser;
  profile = result.profile;
  if (!profile) return;
  playerName = currentUser;
  racerNameInput.value = playerName;
  garageIndex = profile.selectedCar;
  updateProfileDisplay();
  updateGarageUI();
  updateScreens();
}

async function garageRequest(action, payload, successMessage) {
  const feedback = document.getElementById("garage-feedback");
  if (!profile) return;
  const previous = structuredClone(profile);
  try {
    const index = Number(payload.carIndex ?? garageIndex);
    const vehicle = vehicleCatalog[index];
    if (action === "buy") {
      if (!Number.isInteger(index) || !vehicle) throw new Error("That car is not available.");
      if (profile.ownedCars.includes(index)) throw new Error("You already own this car.");
      if (profile.level < vehicle.unlockLevel) throw new Error(`Reach level ${vehicle.unlockLevel} to unlock this car.`);
      if (profile.credits < vehicle.price) throw new Error("You need more credits for this car.");
      profile.credits -= vehicle.price;
      profile.ownedCars.push(index);
      profile.selectedCar = index;
      profile.paintColors[index] = "#55e6c1";
      profile.customizations[index] = { wheelColor: "#d9e2dd", wheelStyle: "five-spoke", finish: "glossy", decals: "twin-stripe", spoiler: "stock" };
      profile.upgrades[index] = { engine: 0, handling: 0, brakes: 0 };
    } else if (action === "select") {
      if (!Number.isInteger(index) || !profile.ownedCars.includes(index)) throw new Error("Buy this car before selecting it.");
      profile.selectedCar = index;
    } else if (action === "paint") {
      if (!/^#[0-9a-f]{6}$/i.test(payload.color)) throw new Error("Choose a valid paint color.");
      profile.paintColors[profile.selectedCar] = payload.color;
    } else if (action === "customize") {
      const current = profile.customizations[profile.selectedCar] || { wheelColor: "#d9e2dd", wheelStyle: "five-spoke", finish: "glossy", decals: "twin-stripe", spoiler: "stock" };
      const [field, value] = Object.entries(payload).find(([key]) => key !== "carIndex") || [];
      const allowed = {
        wheelColor: (candidate) => /^#[0-9a-f]{6}$/i.test(candidate),
        wheelStyle: (candidate) => ["five-spoke", "rally", "mesh"].includes(candidate),
        finish: (candidate) => ["glossy", "matte", "metallic", "pearl"].includes(candidate),
        decals: (candidate) => ["twin-stripe", "rally", "minimal", "none"].includes(candidate),
        spoiler: (candidate) => ["stock", "sport", "race", "none"].includes(candidate)
      };
      if (!field || !allowed[field]?.(value)) throw new Error("That customization is not available.");
      profile.customizations[profile.selectedCar] = { ...current, [field]: value };
    } else if (action === "upgrade") {
      const type = payload.type;
      if (!["engine", "handling", "brakes"].includes(type)) throw new Error("That upgrade is not available.");
      const levels = profile.upgrades[profile.selectedCar] || { engine: 0, handling: 0, brakes: 0 };
      const level = Number(levels[type]) || 0;
      if (level >= 3) throw new Error("This upgrade is already at maximum level.");
      const price = 700 + level * 450;
      if (profile.credits < price) throw new Error(`You need ${price} credits for this upgrade.`);
      profile.credits -= price;
      profile.upgrades[profile.selectedCar] = { ...levels, [type]: level + 1 };
    }
    await saveProfile();
    garageIndex = profile.selectedCar;
    updateProfileDisplay();
    updateGarageUI();
    feedback.textContent = successMessage;
  } catch (error) {
    profile = previous;
    updateProfileDisplay();
    updateGarageUI();
    feedback.textContent = error.message;
  }
}

function setMenuPage(page) {
  menuPage = page;
  document.getElementById("play-panel").classList.toggle("hidden", page !== "race");
  document.getElementById("garage-panel").classList.toggle("hidden", page !== "garage");
  document.getElementById("play-tab").classList.toggle("selected", page === "race");
  document.getElementById("garage-tab").classList.toggle("selected", page === "garage");
  document.getElementById("play-tab").setAttribute("aria-selected", String(page === "race"));
  document.getElementById("garage-tab").setAttribute("aria-selected", String(page === "garage"));
  if (page === "garage") updateGarageUI();
}

function updateCars() {
  const activeIds = new Set(snapshot.cars.map((car) => car.id));
  for (const [id, root] of cars) {
    if (activeIds.has(id)) continue;
    scene.remove(root);
    root.traverse((object) => {
      if (object.isMesh) {
        object.geometry.dispose();
        object.material.dispose();
      }
    });
    root.userData.label.material.map.dispose();
    root.userData.label.material.dispose();
    cars.delete(id);
  }

  for (const car of snapshot.cars) {
    let root = cars.get(car.id);
    if (!root) {
      root = makeCar(car);
      cars.set(car.id, root);
    }
    const distance = Math.max(0, car.progress - root.userData.lastProgress);
    for (const wheel of root.userData.wheels) wheel.rotation.x += distance / 8;
    root.userData.lastProgress = car.progress;
    const t = car.finished ? 0.9999 : (car.lapProgress || 0);
    const point = trackPoint(t, (Number(car.lane) || 0) * 0.1);
    const tangent = trackTangent(t);
    root.userData.targetPosition.copy(point);
    root.userData.targetYaw = Math.atan2(tangent.x, tangent.z);
    root.userData.speed = car.speed;
  }
}

function animateCars(delta, time) {
  const smoothing = 1 - Math.exp(-delta * 12);
  for (const root of cars.values()) {
    if (!root.userData.initialized) {
      root.position.copy(root.userData.targetPosition);
      root.rotation.y = root.userData.targetYaw;
      root.userData.initialized = true;
    } else {
      root.position.lerp(root.userData.targetPosition, smoothing);
      const difference = Math.atan2(Math.sin(root.userData.targetYaw - root.rotation.y), Math.cos(root.userData.targetYaw - root.rotation.y));
      root.rotation.y += difference * smoothing;
    }
    root.position.y = root.userData.targetPosition.y + Math.sin(time / 78 + (root.userData.gridIndex || 0)) * Math.min(root.userData.speed / 900, 0.045);
  }
}

function updateCamera(delta) {
  const playerRoot = cars.get(playerId);
  if (!playerRoot) return;
  const tangent = new THREE.Vector3(Math.sin(playerRoot.rotation.y), 0, Math.cos(playerRoot.rotation.y));
  const position = playerRoot.position;
  const desiredPosition = position.clone().addScaledVector(tangent, -19).add(new THREE.Vector3(0, 12, 0));
  const lookAt = position.clone().addScaledVector(tangent, 13).add(new THREE.Vector3(0, 1.2, 0));
  camera.position.lerp(desiredPosition, 1 - Math.exp(-delta * 2.8));
  camera.lookAt(lookAt);
}

function connect() {
  const protocol = location.protocol === "https:" ? "wss:" : "ws:";
  socket = new WebSocket(`${protocol}//${location.host}`);
  socket.addEventListener("open", () => {
    connectionLabel.textContent = "Connected · joining grid";
    liveDot.classList.remove("offline");
    liveDot.classList.remove("idle");
    const carIndex = profile.selectedCar;
    socket.send(JSON.stringify({
      type: "join",
      name: playerName,
      carIndex,
      color: profile.paintColors[carIndex] || "#55e6c1",
      upgrades: profile.upgrades[carIndex] || {},
      customization: profile.customizations?.[carIndex] || {}
    }));
    lobbyStatus.textContent = "Connected · assembling the grid";
  });
  socket.addEventListener("message", (event) => {
    const data = JSON.parse(event.data);
    if (data.type === "welcome") {
      playerId = data.id;
      document.getElementById("player-name").textContent = playerName.toUpperCase();
    }
    if (data.type === "race-finished" && profile && profile.lastAwardedRaceId !== data.raceId) {
      profile.races += 1;
      if (data.place === 1) profile.wins += 1;
      if (data.place <= 3) profile.podiums += 1;
      profile.credits += data.reward.credits;
      profile.xp += data.reward.xp;
      while (profile.xp >= profile.level * 250) {
        profile.xp -= profile.level * 250;
        profile.level += 1;
      }
      profile.lastAwardedRaceId = data.raceId;
      lastReward = data.reward;
      updateProfileDisplay();
      void saveProfile().catch((error) => {
        document.getElementById("garage-feedback").textContent = error.message;
      });
      updateHud();
    }
    if (data.type === "state") {
      const previousPhase = snapshot.phase;
      snapshot = data;
      connectionLabel.textContent = `${data.players} RACER${data.players === 1 ? "" : "S"} ONLINE`;
      if (data.phase === "waiting" || data.phase === "countdown") {
        appState = "lobby";
        raceStartedAt = null;
        raceFinishedAt = null;
        if (data.phase === "countdown") {
          lobbyTitle.textContent = `RACE STARTS IN ${data.countdown}`;
          lobbyStatus.textContent = "Grid locked · get ready to race";
        } else {
          lobbyTitle.textContent = "GRID FORMING";
          lobbyStatus.textContent = "Waiting for the start sequence…";
        }
      } else if (data.phase === "racing") {
        if (previousPhase !== "racing") {
          raceStartedAt = performance.now();
          raceFinishedAt = null;
        }
        appState = "racing";
      } else if (data.phase === "finished") {
        appState = "results";
      }
      updateCars();
      updateHud();
      updateLobby();
      updateScreens();
    }
    if (data.type === "full") {
      allowReconnect = false;
      appState = "menu";
      connectionLabel.textContent = "Race full · try again soon";
      liveDot.classList.add("offline");
      menuFeedback.textContent = "All six human seats are taken. Try again after this race.";
      updateScreens();
      showMessage("GRID FULL", "This race already has six human racers.");
      socket.close();
    }
  });
  socket.addEventListener("close", () => {
    if (!allowReconnect) return;
    connectionLabel.textContent = "Connection lost · reconnecting";
    liveDot.classList.add("offline");
    lobbyStatus.textContent = "Connection lost · trying again…";
    appState = "lobby";
    updateScreens();
    clearTimeout(reconnectTimer);
    reconnectTimer = setTimeout(connect, 1500);
  });
  socket.addEventListener("error", () => {
    connectionLabel.textContent = "Server unavailable";
    liveDot.classList.add("offline");
    lobbyStatus.textContent = "Server unavailable · retrying…";
  });
}

function updateLobby() {
  const ordered = [...snapshot.cars].sort((a, b) => a.gridIndex - b.gridIndex);
  lobbyCount.textContent = `${ordered.length} / ${MAX_CARS}`;
  const slots = Array.from({ length: MAX_CARS }, (_, index) => {
    const car = ordered.find((entry) => entry.gridIndex === index);
    const row = document.createElement("div");
    row.className = `lobby-slot${car?.isBot ? " bot" : ""}`;
    if (car) {
      const swatch = document.createElement("span");
      swatch.className = "slot-swatch";
      swatch.style.backgroundColor = car.color;
      const copy = document.createElement("span");
      copy.className = "slot-copy";
      const name = document.createElement("span");
      name.className = "slot-name";
      name.textContent = car.id === playerId ? `${car.name} (YOU)` : car.name;
      const type = document.createElement("span");
      type.className = "slot-type";
      type.textContent = car.isBot ? "AI DRIVER" : "ONLINE RACER";
      copy.append(name, type);
      row.append(swatch, copy);
    } else {
      row.classList.add("open");
      const copy = document.createElement("span");
      copy.className = "slot-copy";
      copy.innerHTML = `<span class="slot-name">OPEN GRID SLOT</span><span class="slot-type">BOT WILL FILL</span>`;
      row.append(copy);
    }
    return row;
  });
  lobbyRoster.replaceChildren(...slots);
}

function updateScreens() {
  const inMenu = appState === "menu";
  mainMenu.classList.toggle("hidden", !inMenu);
  lobbyScreen.classList.toggle("hidden", appState !== "lobby");
  leaveRaceButton.hidden = appState !== "racing" && appState !== "results";
  accountPanel.classList.toggle("hidden", Boolean(currentUser));
  careerMenu.classList.toggle("hidden", !currentUser);
  fuelToggle.hidden = appState !== "racing" && appState !== "results";
  const canShowFuel = (appState === "racing" || appState === "results") && Boolean(currentUser);
  if (!canShowFuel) fuelPanelOpen = false;
  fuelPanel.classList.toggle("hidden", !canShowFuel || !fuelPanelOpen);
}

async function joinRace() {
  if (!currentUser) return;
  playerName = currentUser;
  document.getElementById("player-name").textContent = playerName.toUpperCase();
  menuFeedback.textContent = "Connecting to the race server…";
  lobbyStatus.textContent = "Connecting to race server…";
  lobbyTitle.textContent = "GRID FORMING";
  lobbyRoster.replaceChildren();
  playerId = null;
  raceStartedAt = null;
  raceFinishedAt = null;
  lastReward = null;
  fuelPanelOpen = false;
  fuelPanel.classList.add("hidden");
  allowReconnect = true;
  appState = "lobby";
  updateScreens();
  connect();
}

function leaveRace() {
  allowReconnect = false;
  clearTimeout(reconnectTimer);
  if (socket && socket.readyState < WebSocket.CLOSING) socket.close(1000, "Racer left");
  socket = null;
  playerId = null;
  raceStartedAt = null;
  raceFinishedAt = null;
  keys.clear();
  fuelPanelOpen = false;
  fuelPanel.classList.add("hidden");
  snapshot = {
    phase: "waiting",
    cars: [],
    countdown: 0,
    players: 0,
    trackLength: TRACK_LENGTH,
    lapsToWin: 3
  };
  appState = "menu";
  connectionLabel.textContent = "READY TO RACE";
  liveDot.classList.add("idle");
  if (currentUser) menuFeedback.textContent = "Up to six racers online. AI drivers fill open seats.";
  updateCars();
  updateLobby();
  updateScreens();
}

authForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!authForm.reportValidity()) return;
  if (!window.isSecureContext || !window.crypto?.subtle) {
    authFeedback.textContent = "Secure profile encryption requires HTTPS or localhost. Open Rivalken on this device or use an HTTPS server.";
    return;
  }
  if (!supabaseClient) {
    authFeedback.textContent = "Supabase is not configured. Copy .env.example to .env and add your Supabase URL and public anon key.";
    return;
  }
  const submit = document.getElementById("auth-submit");
  submit.disabled = true;
  authFeedback.textContent = authMode === "register" ? "Creating your driver profile…" : "Signing in…";
  try {
    const username = authUsername.value.trim();
    const password = authPassword.value;
    const email = await syntheticAuthEmail(username);
    const authResult = authMode === "register"
      ? await supabaseClient.auth.signUp({ email, password })
      : await supabaseClient.auth.signInWithPassword({ email, password });
    if (authResult.error) throw authResult.error;
    if (!authResult.data.user || !authResult.data.session) {
      throw new Error("Supabase did not start a session. Turn off email confirmation for this project; the account uses a non-deliverable private login ID.");
    }
    await loadProfileForUser(authResult.data.user.id, username, password);
    authPassword.value = "";
    document.getElementById("player-name").textContent = playerName.toUpperCase();
    authFeedback.textContent = "";
    setMenuPage(location.hash === "#garage-tab" ? "garage" : "race");
  } catch (error) {
    currentUser = null;
    currentUserId = null;
    profile = null;
    profileKey = null;
    profileSalt = null;
    updateScreens();
    authFeedback.textContent = error.message;
  } finally {
    authPassword.value = "";
    submit.disabled = false;
  }
});

document.getElementById("auth-mode-toggle").addEventListener("click", (event) => {
  authMode = authMode === "login" ? "register" : "login";
  const registering = authMode === "register";
  document.getElementById("auth-title").textContent = registering ? "CREATE ACCOUNT" : "SIGN IN";
  document.getElementById("auth-submit").querySelector("span").textContent = registering ? "CREATE PROFILE" : "SIGN IN";
  event.currentTarget.textContent = registering ? "ALREADY HAVE AN ACCOUNT? SIGN IN" : "CREATE AN ACCOUNT";
  authPassword.autocomplete = registering ? "new-password" : "current-password";
  authFeedback.textContent = registering
    ? "Choose a 3–16 character nickname and a password with at least 8 characters."
    : "Sign in to decrypt and load your saved driver profile.";
});

document.getElementById("sign-out").addEventListener("click", async () => {
  try {
    await supabaseClient?.auth.signOut({ scope: "local" });
    leaveRace();
    currentUser = null;
    currentUserId = null;
    profile = null;
    profileKey = null;
    profileSalt = null;
    authUsername.value = "";
    authPassword.value = "";
    authFeedback.textContent = "You are signed out.";
    updateScreens();
  } catch (error) {
    menuFeedback.textContent = error.message;
  }
});

document.getElementById("delete-account").addEventListener("click", async () => {
  if (!supabaseClient || !currentUser || !window.confirm("Permanently delete your Rivalken account and encrypted profile? This cannot be undone.")) return;
  const button = document.getElementById("delete-account");
  button.disabled = true;
  try {
    const { error } = await supabaseClient.functions.invoke("delete-account", { method: "POST" });
    if (error) throw new Error(error.message || "Account deletion failed.");
    await supabaseClient.auth.signOut({ scope: "local" });
    leaveRace();
    currentUser = null;
    currentUserId = null;
    profile = null;
    profileKey = null;
    profileSalt = null;
    authFeedback.textContent = "Your account deletion request completed.";
    updateScreens();
  } catch (error) {
    document.getElementById("garage-feedback").textContent = error.message;
  } finally {
    button.disabled = false;
  }
});

document.getElementById("play-tab").addEventListener("click", () => setMenuPage("race"));
document.getElementById("garage-tab").addEventListener("click", () => setMenuPage("garage"));
document.getElementById("garage-prev").addEventListener("click", () => {
  garageIndex = (garageIndex + vehicleCatalog.length - 1) % vehicleCatalog.length;
  updateGarageUI();
});
document.getElementById("garage-next").addEventListener("click", () => {
  garageIndex = (garageIndex + 1) % vehicleCatalog.length;
  updateGarageUI();
});
document.getElementById("garage-car-action").addEventListener("click", async () => {
  if (!profile) return;
  const owned = profile.ownedCars.includes(garageIndex);
  const selected = profile.selectedCar === garageIndex;
  if (owned && selected) return;
  if (owned) {
    await garageRequest("select", { carIndex: garageIndex }, "Build selected and saved to your account.");
  } else {
    await garageRequest("buy", { carIndex: garageIndex }, "Car purchased and added to your account.");
  }
});
document.getElementById("paint-color").addEventListener("input", (event) => {
  if (garagePreviewRoot?.userData.previewIndex === garageIndex) {
    garagePreviewRoot.userData.paint.color.set(event.currentTarget.value);
  }
});
document.getElementById("paint-color").addEventListener("change", async (event) => {
  await garageRequest("paint", { color: event.currentTarget.value }, "Paint saved to your account.");
});
document.getElementById("wheel-color").addEventListener("input", (event) => {
  if (garagePreviewRoot?.userData.previewIndex === garageIndex) {
    garagePreviewRoot.userData.rim.color.set(event.currentTarget.value);
  }
});
document.getElementById("wheel-color").addEventListener("change", async (event) => {
  await garageRequest("customize", { wheelColor: event.currentTarget.value }, "Wheel color saved.");
});
for (const [id, field] of [
  ["body-finish", "finish"],
  ["wheel-style", "wheelStyle"],
  ["decal-style", "decals"],
  ["spoiler-style", "spoiler"]
]) {
  document.getElementById(id).addEventListener("change", async (event) => {
    await garageRequest("customize", { [field]: event.currentTarget.value }, "Car style saved.");
  });
}
for (const button of document.querySelectorAll(".upgrade-button")) {
  button.addEventListener("click", async () => {
    await garageRequest("upgrade", { type: button.dataset.upgrade }, "Upgrade installed and saved.");
  });
}

joinForm.addEventListener("submit", (event) => {
  event.preventDefault();
  void joinRace();
});
document.getElementById("lobby-leave").addEventListener("click", leaveRace);
leaveRaceButton.addEventListener("click", leaveRace);

function showMessage(title, hint, kicker = "GET READY") {
  message.classList.remove("hidden");
  messageTitle.textContent = title;
  messageHint.textContent = hint;
  message.querySelector(".message-kicker").textContent = kicker;
}

function sendInput() {
  if (!socket || socket.readyState !== WebSocket.OPEN) return;
  const throttle = keys.has("w") || keys.has("arrowup");
  const brake = keys.has("s") || keys.has("arrowdown") || keys.has(" ");
  const steer = (keys.has("a") || keys.has("arrowleft") ? 1 : 0) - (keys.has("d") || keys.has("arrowright") ? 1 : 0);
  socket.send(JSON.stringify({ type: "input", throttle, brake, steer }));
}

function toggleFuelPanel() {
  if (appState !== "racing" && appState !== "results") return;
  fuelPanelOpen = !fuelPanelOpen;
  fuelPanel.classList.toggle("hidden", !fuelPanelOpen);
  fuelToggle.setAttribute("aria-expanded", String(fuelPanelOpen));
}

fuelToggle.addEventListener("click", toggleFuelPanel);
window.addEventListener("keydown", (event) => {
  const key = event.key.toLowerCase();
  if ((event.code === "Minus" || event.code === "NumpadSubtract") && (appState === "racing" || appState === "results")) {
    event.preventDefault();
    toggleFuelPanel();
    return;
  }
  if ([" ", "arrowup", "arrowdown", "arrowleft", "arrowright"].includes(key)) event.preventDefault();
  keys.add(key);
  sendInput();
});
window.addEventListener("keyup", (event) => {
  keys.delete(event.key.toLowerCase());
  sendInput();
});
window.addEventListener("blur", () => {
  keys.clear();
  sendInput();
});
setInterval(sendInput, 80);

function updateHud() {
  const ordered = [...snapshot.cars].sort((a, b) => b.progress - a.progress);
  const me = ordered.find((car) => car.id === playerId);
  const fuelRatio = me ? Math.max(0, Math.min(1, me.fuelLiters / me.fuelCapacity)) : 0;
  document.getElementById("fuel-liters").textContent = me ? Math.max(0, me.fuelLiters).toFixed(1) : "—";
  document.getElementById("fuel-capacity").textContent = me ? `/ ${me.fuelCapacity} L` : "/ — L";
  document.getElementById("fuel-bar").style.width = `${fuelRatio * 100}%`;
  document.getElementById("fuel-economy").textContent = me ? `${me.fuelRateLPer100Km.toFixed(1)} L/100 KM` : "— L/100 KM";
  document.getElementById("fuel-condition").textContent = !me
    ? "—"
    : fuelRatio <= 0 ? "EMPTY" : fuelRatio <= 0.15 ? "LOW FUEL" : "READY";
  fuelPanel.classList.toggle("low-fuel", Boolean(me && fuelRatio <= 0.15));
  document.getElementById("grid-count").textContent = `${snapshot.cars.length} / ${MAX_CARS}`;
  document.getElementById("position").textContent = me ? String(ordered.indexOf(me) + 1).padStart(2, "0") : "—";
  const speed = me ? Math.round(me.speed * 0.34) : 0;
  document.getElementById("speed").textContent = String(speed).padStart(3, "0");
  document.getElementById("speed-bar").style.width = `${Math.min(100, speed / 1.6)}%`;
  document.getElementById("speed-condition").textContent = me?.slipping ? "GRIP LOSS" : "ROAD";
  document.querySelector(".speed-card").classList.toggle("slipping", Boolean(me?.slipping));
  const rpm = speed === 0 ? 850 : Math.round(850 + Math.min(speed / 132, 1) * 7100);
  document.getElementById("rpm").textContent = String(rpm).padStart(4, "0");
  document.getElementById("rpm-bar").style.width = `${Math.min(100, Math.max(0, (rpm - 850) / 71))}%`;
  const gear = speed < 3 ? "N" : String(Math.min(6, Math.floor(speed / 24) + 1));
  document.getElementById("gear").textContent = gear;
  if (me?.finished && raceFinishedAt === null) raceFinishedAt = performance.now();
  const timerNow = raceFinishedAt ?? performance.now();
  const elapsed = raceStartedAt === null ? 0 : Math.max(0, (timerNow - raceStartedAt) / 1000);
  const minutes = Math.floor(elapsed / 60).toString().padStart(2, "0");
  const seconds = (elapsed % 60).toFixed(1).padStart(4, "0");
  raceTimeNode.textContent = `${minutes}:${seconds}`;
  document.getElementById("lap").textContent = me ? Math.min(3, Math.floor(me.progress / snapshot.trackLength) + 1) : "1";
  standingsNode.replaceChildren(...ordered.map((car, index) => {
    const row = document.createElement("div");
    row.className = `standings-row${car.id === playerId ? " me" : ""}`;
    const rank = document.createElement("span");
    rank.className = "standing-rank";
    rank.textContent = String(index + 1).padStart(2, "0");
    const name = document.createElement("span");
    name.className = "standing-name";
    name.textContent = car.id === playerId ? "YOU" : car.name;
    const detail = document.createElement("span");
    detail.className = "standing-speed";
    detail.textContent = car.finished ? "FIN" : `${Math.floor(car.progress / snapshot.trackLength) + 1}/${snapshot.lapsToWin}`;
    row.append(rank, name, detail);
    return row;
  }));

  if (snapshot.phase === "waiting") {
    showMessage("GRID UP", "Race begins shortly · bots fill every open seat");
  } else if (snapshot.phase === "countdown") {
    showMessage(snapshot.countdown > 0 ? String(snapshot.countdown) : "GO!", "WASD / arrows to drive · space to brake");
  } else if (snapshot.phase === "finished") {
    const place = me ? ordered.indexOf(me) + 1 : 0;
    const suffix = place === 1 ? "ST" : place === 2 ? "ND" : place === 3 ? "RD" : "TH";
    const rewardHint = lastReward
      ? `+${lastReward.credits} CR · +${lastReward.xp} XP · next grid is forming`
      : "Next grid is forming…";
    showMessage(me?.finished ? `${place}${suffix} PLACE` : "RACE OVER", rewardHint, "FINISH");
  } else {
    message.classList.add("hidden");
  }
}

function resize() {
  const { width, height } = gameRoot.getBoundingClientRect();
  if (!width || !height) return;
  renderer.setSize(width, height, false);
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
}

function frame(time) {
  if (frame.nextFrameTime !== undefined && time < frame.nextFrameTime) {
    requestAnimationFrame(frame);
    return;
  }
  const delta = frame.lastTime === undefined ? 0 : Math.min(0.05, (time - frame.lastTime) / 1000);
  frame.lastTime = time;
  frame.nextFrameTime = (frame.nextFrameTime ?? time) + FRAME_INTERVAL;
  if (frame.nextFrameTime <= time) frame.nextFrameTime = time + FRAME_INTERVAL;
  animateCars(delta, time);
  updateCamera(delta);
  renderer.render(scene, camera);
  renderGaragePreview(time, delta);
  if (time - lastHudUpdate > 100) {
    updateHud();
    lastHudUpdate = time;
  }
  requestAnimationFrame(frame);
}

buildTrack();
resize();
renderer.render(scene, camera);
updateHud();
window.addEventListener("resize", resize);
updateLobby();
updateScreens();
if (!supabaseClient) {
  authFeedback.textContent = "Supabase is not configured. Copy .env.example to .env, add the project URL and public anon key, then restart.";
}
requestAnimationFrame(frame);
