const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const { randomUUID } = require("node:crypto");
const WebSocket = require("ws");

function loadEnvironmentFile() {
  const file = path.join(__dirname, ".env");
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (!match || process.env[match[1]] !== undefined) continue;
    const value = match[2].replace(/^(['"])(.*)\1$/, "$2");
    process.env[match[1]] = value;
  }
}

loadEnvironmentFile();

const PORT = Number(process.env.PORT) || 3001;
const HOST = process.env.HOST || "0.0.0.0";
const MAX_CARS = 6;
const LAPS_TO_WIN = 3;
const TRACK_LENGTH = 5200;
const TICK_RATE = 30;
const PUBLIC_DIR = path.join(__dirname, "public");
const VEHICLES = JSON.parse(fs.readFileSync(path.join(PUBLIC_DIR, "vehicles.json"), "utf8"));
const SUPABASE_URL = process.env.SUPABASE_URL || "";
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_PUBLISHABLE_KEY || "";
const colors = ["#55e6c1", "#ff6b6b", "#feca57", "#54a0ff", "#c56cf0", "#ff9f43"];
const names = ["Comet", "Rivet", "Nova", "Dash", "Piston", "Turbo"];
const CORNER_ZONES = [
  [0.176, 0.82, 1, 0.055], [0.295, 0.75, -1, 0.045], [0.451, 0.9, 1, 0.055],
  [0.807, 0.76, 1, 0.04], [0.83, 0.9, -1, 0.028], [0.843, 0.76, 1, 0.04]
];

const players = new Map();
let bots = [];
let raceStartedAt = 0;
let countdownStartedAt = 0;
let raceOverAt = 0;
let raceId = "";
let raceSequence = 0;
let finishSequence = 0;

function getCornerProfile(progress) {
  const position = (progress % TRACK_LENGTH) / TRACK_LENGTH;
  let profile = { severity: 0, direction: 0 };
  for (const [center, strength, direction, width] of CORNER_ZONES) {
    const distance = Math.abs(position - center);
    const wrappedDistance = Math.min(distance, 1 - distance);
    const fade = Math.max(0, 1 - wrappedDistance / width);
    const severity = strength * fade * fade * (3 - 2 * fade);
    if (severity > profile.severity) profile = { severity, direction };
  }
  return profile;
}

function defaultCustomization() {
  return {
    wheelColor: "#d9e2dd",
    wheelStyle: "five-spoke",
    finish: "glossy",
    decals: "twin-stripe",
    spoiler: "stock"
  };
}

function sendJson(response, status, value, headers = {}) {
  response.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
    ...headers
  });
  response.end(JSON.stringify(value));
}

function validateOrigin(request) {
  const origin = request.headers.origin;
  let originHost = "";
  try {
    originHost = origin ? new URL(origin).host : "";
  } catch {
    originHost = "";
  }
  if (!originHost || originHost !== request.headers.host) {
    const error = new Error("Request origin was not accepted.");
    error.status = 403;
    throw error;
  }
}

function setPrivacyHeaders(request, response) {
  let host = "";
  try {
    host = new URL(request.url, `http://${request.headers.host}`).host;
  } catch {
    // Omit host-specific WebSocket sources if the request host is malformed.
  }
  const websocketSources = host ? ` ws://${host} wss://${host}` : "";
  let supabaseSource = "";
  try {
    const supabaseUrl = new URL(SUPABASE_URL);
    if (supabaseUrl.protocol === "https:") supabaseSource = ` ${supabaseUrl.origin}`;
  } catch {
    // Supabase is optional; omit it from the policy when it is not configured.
  }

  response.setHeader("Content-Security-Policy", [
    "default-src 'self'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    "object-src 'none'",
    "script-src 'self'",
    "style-src 'self'",
    "img-src 'self' data: blob:",
    `connect-src 'self'${websocketSources}${supabaseSource}`
  ].join("; "));
  response.setHeader("Referrer-Policy", "no-referrer");
  response.setHeader("X-Content-Type-Options", "nosniff");
  response.setHeader("X-Frame-Options", "DENY");
  response.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
}

function makeCar(id, name, color, isBot = false, index = 0, carIndex = index % VEHICLES.length, upgrades = {}, customization = {}) {
  const vehicle = VEHICLES[carIndex] || VEHICLES[0];
  return {
    id,
    name,
    color,
    isBot,
    carIndex,
    upgrades,
    wheelColor: customization.wheelColor || "",
    wheelStyle: customization.wheelStyle || "five-spoke",
    finish: customization.finish || "glossy",
    decals: customization.decals || "twin-stripe",
    spoiler: customization.spoiler || "stock",
    fuelLiters: vehicle.fuelCapacity,
    fuelCapacity: vehicle.fuelCapacity,
    fuelLPer100Km: vehicle.fuelLPer100Km,
    fuelRateLPer100Km: vehicle.fuelLPer100Km * 0.12,
    progress: 0,
    speed: 0,
    lane: (index % 2 ? 1 : -1) * (22 + Math.floor(index / 2) * 23),
    steer: 0,
    throttle: 0,
    braking: false,
    slipping: false,
    finishedAt: null,
    finishPlace: 0
  };
}

function fillGrid() {
  const occupied = new Set([...players.values()].map((player) => player.gridIndex));
  bots = [];
  for (let slot = 0; slot < MAX_CARS; slot += 1) {
    if (!occupied.has(slot)) {
      const botIndex = bots.length;
      bots.push(makeCar(`bot-${slot}`, names[slot], colors[slot], true, slot));
      bots[botIndex].gridIndex = slot;
      bots[botIndex].targetSpeed = 360 + slot * 3;
    }
  }
}

function racePhase(now) {
  if (!raceStartedAt) return "waiting";
  if (now < raceStartedAt) return "countdown";
  if (raceOverAt) return now - raceOverAt < 7000 ? "finished" : "waiting";
  return "racing";
}

function resetRace(now) {
  raceStartedAt = now + 5000;
  countdownStartedAt = now;
  raceOverAt = 0;
  finishSequence = 0;
  raceId = randomUUID();
  raceSequence += 1;
  for (const [index, player] of [...players.values()].entries()) {
    player.progress = 0;
    player.speed = 0;
    player.lane = (index % 2 ? 1 : -1) * 24;
    player.steer = 0;
    player.throttle = 0;
    player.braking = false;
    player.slipping = false;
    player.finishedAt = null;
    player.finishPlace = 0;
    const vehicle = VEHICLES[player.carIndex] || VEHICLES[0];
    player.fuelCapacity = vehicle.fuelCapacity;
    player.fuelLPer100Km = vehicle.fuelLPer100Km;
    player.fuelLiters = vehicle.fuelCapacity;
    player.fuelRateLPer100Km = vehicle.fuelLPer100Km * 0.12;
  }
  fillGrid();
  for (const bot of bots) {
    bot.progress = 0;
    bot.speed = 0;
    bot.finishedAt = null;
    bot.finishPlace = 0;
    bot.fuelLiters = bot.fuelCapacity;
  }
}

function addPlayer(socket) {
  const usedSlots = new Set([...players.values()].map((player) => player.gridIndex));
  const gridIndex = Array.from({ length: MAX_CARS }, (_, index) => index).find((slot) => !usedSlots.has(slot));
  const id = randomUUID();
  const player = makeCar(id, "Racer", colors[gridIndex], false, gridIndex);
  player.gridIndex = gridIndex;
  player.socket = socket;
  player.input = { throttle: 0, brake: 0, steer: 0 };
  players.set(id, player);
  fillGrid();
  socket.send(JSON.stringify({ type: "welcome", id, gridIndex }));
  return player;
}

function getAllCars() {
  return [...players.values(), ...bots];
}

function updateBot(bot, dt, now) {
  if (!raceStartedAt || now < raceStartedAt || bot.finishedAt) return;
  const lead = Math.max(0, ...[...players.values()].map((player) => player.progress));
  const catchUp = bot.progress + TRACK_LENGTH < lead ? 36 : 0;
  const vehicle = VEHICLES[bot.carIndex] || VEHICLES[0];
  const corner = getCornerProfile(bot.progress);
  const cornerSpeedLimit = vehicle.topSpeed * 390 * (1 - corner.severity * 0.45);
  const target = bot.fuelLiters > 0
    ? Math.min(vehicle.topSpeed * 390, cornerSpeedLimit, bot.targetSpeed + catchUp + Math.sin(now / 1700 + bot.gridIndex) * 18)
    : 0;
  const previousProgress = bot.progress;
  bot.speed += Math.max(-300 * dt, Math.min(target - bot.speed, 180 * dt));
  bot.slipping = false;
  bot.progress += bot.speed * dt;
  consumeFuel(bot, bot.progress - previousProgress, target > 0, vehicle);
  bot.lane = Math.sin(now / 2100 + bot.gridIndex * 1.9) * 48;
  if (bot.progress >= TRACK_LENGTH * LAPS_TO_WIN) finishCar(bot, now);
}

function consumeFuel(car, distance, throttle, vehicle) {
  const engineUpgrade = car.upgrades?.engine || 0;
  const speedRatio = Math.min(1, car.speed / (390 * vehicle.topSpeed));
  const load = throttle ? 0.72 + speedRatio * 0.42 : 0.12;
  const consumption = vehicle.fuelLPer100Km * (1 + engineUpgrade * 0.025) * load;
  car.fuelRateLPer100Km = consumption;
  if (distance <= 0 || car.fuelLiters <= 0) return;
  car.fuelLiters = Math.max(0, car.fuelLiters - (distance / 1000) * consumption / 100);
}

function handleApiRequest(request, response, pathname) {
  if (request.method === "GET" && pathname === "/api/config") {
    sendJson(response, 200, { supabaseUrl: SUPABASE_URL, supabaseAnonKey: SUPABASE_ANON_KEY });
    return;
  }
  sendJson(response, 404, { error: "API route not found." });
}

function finishCar(car, now) {
  car.progress = TRACK_LENGTH * LAPS_TO_WIN;
  car.finishedAt = now;
  car.finishPlace = ++finishSequence;
}

function finishPlayer(player, now) {
  finishCar(player, now);
  if (player.socket.readyState === WebSocket.OPEN) {
    player.socket.send(JSON.stringify({
      type: "race-finished",
      raceId,
      place: player.finishPlace,
      reward: { credits: 450, xp: 180 }
    }));
  }
}

function updatePlayer(player, dt, now) {
  if (!raceStartedAt || now < raceStartedAt || player.finishedAt) {
    player.speed *= 0.96;
    return;
  }
  const vehicle = VEHICLES[player.carIndex] || VEHICLES[0];
  const input = player.input;
  const throttleDemand = input.throttle && player.fuelLiters > 0 && !input.brake ? 1 : 0;
  player.throttle += (throttleDemand - player.throttle) * Math.min(1, dt * (throttleDemand ? 5 : 7));
  player.steer += (input.steer - player.steer) * Math.min(1, dt * 7);
  player.braking = Boolean(input.brake);
  const engineLevel = player.upgrades.engine || 0;
  const maxSpeed = 390 * vehicle.topSpeed * (1 + engineLevel * 0.025);
  const corner = getCornerProfile(player.progress);
  const cornerSpeedLimit = maxSpeed * (1 - corner.severity * 0.45);
  const overspeed = Math.max(0, player.speed - cornerSpeedLimit);
  const tractionLoss = Math.min(0.92, overspeed / maxSpeed * corner.severity * 4.5);
  const acceleration = 270 * vehicle.acceleration * (1 + engineLevel * 0.07);
  const brakeForce = input.brake ? 270 * vehicle.braking * (1 + (player.upgrades.brakes || 0) * 0.08) : 0;
  const rollingDrag = 8 + player.speed * 0.035 + player.speed * player.speed * 0.00008;
  player.speed += (player.throttle * acceleration * (1 - tractionLoss) - brakeForce - rollingDrag) * dt;
  player.speed = Math.max(0, Math.min(maxSpeed, player.speed));
  if (overspeed > 0) {
    player.speed = Math.max(0, player.speed - overspeed * corner.severity * 5 * dt);
    player.lane += corner.direction * overspeed * corner.severity * 0.5 * dt;
  }
  player.slipping = overspeed > maxSpeed * 0.04 && corner.severity > 0.2;
  player.lane += player.steer * vehicle.handling * (1 + (player.upgrades.handling || 0) * 0.07) * (38 + player.speed * 0.09) * dt;
  player.lane = Math.max(-116, Math.min(116, player.lane));
  const offRoad = Math.abs(player.lane) > 61;
  if (offRoad) player.speed = Math.max(0, player.speed - 190 * dt);
  const previousProgress = player.progress;
  player.progress += player.speed * dt;
  consumeFuel(player, player.progress - previousProgress, player.throttle > 0, vehicle);
  if (player.progress >= TRACK_LENGTH * LAPS_TO_WIN) {
    finishPlayer(player, now);
  }
}

function sendSnapshots(now) {
  const cars = getAllCars().map(({ socket, input, upgrades, ...car }) => ({
    ...car,
    finishPlace: car.finishPlace || 0,
    lap: Math.min(LAPS_TO_WIN, Math.floor(car.progress / TRACK_LENGTH) + 1),
    lapProgress: (car.progress % TRACK_LENGTH) / TRACK_LENGTH,
    finished: Boolean(car.finishedAt)
  }));
  const phase = racePhase(now);
  const remaining = phase === "countdown" ? Math.max(0, Math.ceil((raceStartedAt - now) / 1000)) : 0;
  const state = JSON.stringify({
    type: "state",
    phase,
    countdown: remaining,
    cars,
    players: players.size,
    maxCars: MAX_CARS,
    trackLength: TRACK_LENGTH,
    lapsToWin: LAPS_TO_WIN,
    serverTime: now,
    raceId,
    raceSequence
  });
  for (const player of players.values()) {
    if (player.socket.readyState === WebSocket.OPEN) player.socket.send(state);
  }
}

function tick() {
  const now = Date.now();
  const dt = 1 / TICK_RATE;
  if (players.size > 0) {
    if (!raceStartedAt || (raceOverAt && now - raceOverAt >= 7000)) resetRace(now);
    for (const player of players.values()) updatePlayer(player, dt, now);
    for (const bot of bots) updateBot(bot, dt, now);
    const humanPlayers = [...players.values()];
    if (!raceOverAt && humanPlayers.length > 0 && humanPlayers.every((player) => player.finishedAt)) {
      raceOverAt = now;
    }
  } else {
    raceStartedAt = 0;
    raceOverAt = 0;
    bots = [];
  }
  sendSnapshots(now);
}

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".svg": "image/svg+xml",
  ".md": "text/markdown; charset=utf-8",
  ".json": "application/json; charset=utf-8"
};

const server = http.createServer((request, response) => {
  setPrivacyHeaders(request, response);
  response.setHeader("Set-Cookie", "apex_session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0");
  let url;
  try {
    url = new URL(request.url, "http://localhost");
  } catch {
    response.writeHead(400).end("Bad request");
    return;
  }
  if (url.pathname.startsWith("/api/")) {
    if (request.method === "GET" && url.pathname === "/api/health") {
      sendJson(response, 200, { status: "ok" });
      return;
    }
    handleApiRequest(request, response, url.pathname);
    return;
  }

  if (request.method !== "GET" && request.method !== "HEAD") {
    response.writeHead(405, { Allow: "GET, HEAD" }).end("Method not allowed");
    return;
  }
  const urlPath = decodeURIComponent(url.pathname);
  const isVendor = urlPath.startsWith("/vendor/");
  const isPrivacyDisclosure = urlPath === "/privacy" || urlPath === "/privacy/";
  const relativePath = isVendor
    ? urlPath.slice("/vendor/".length)
    : urlPath === "/" ? "index.html"
      : urlPath === "/play" || urlPath === "/play/" ? "race.html"
        : urlPath.replace(/^\/+/, "");
  const vendorFile = isVendor && relativePath === "supabase.js"
    ? path.join(__dirname, "node_modules", "@supabase", "supabase-js", "dist", "umd", "supabase.js")
    : null;
  const baseDirectory = isVendor ? path.join(__dirname, "node_modules", "three", "build") : PUBLIC_DIR;
  const filePath = vendorFile || (isPrivacyDisclosure
    ? path.join(__dirname, "DATA-PRIVACY.md")
    : path.resolve(baseDirectory, relativePath));
  if ((isVendor && !/^[a-zA-Z0-9._-]+\.js$/.test(relativePath)) ||
      (!vendorFile && !isPrivacyDisclosure && !filePath.startsWith(`${baseDirectory}${path.sep}`))) {
    response.writeHead(403).end("Forbidden");
    return;
  }
  fs.readFile(filePath, (error, content) => {
    if (error) {
      response.writeHead(404).end("Not found");
      return;
    }
    response.writeHead(200, {
      "Content-Type": mimeTypes[path.extname(filePath)] || (isVendor ? "text/javascript; charset=utf-8" : "application/octet-stream"),
      "Cache-Control": "no-cache"
    });
    response.end(content);
  });
});

const wss = new WebSocket.Server({ server });
wss.on("connection", (socket, request) => {
  if (request.headers.origin) {
    try {
      validateOrigin(request);
    } catch {
      socket.close(1008, "Invalid origin");
      return;
    }
  }
  if (players.size >= MAX_CARS) {
    socket.send(JSON.stringify({ type: "full" }));
    socket.close(1000, "Race is full");
    return;
  }
  const player = addPlayer(socket);
  socket.on("message", (raw) => {
    if (raw.length > 1024) return;
    let message;
    try {
      message = JSON.parse(raw.toString());
    } catch {
      return;
    }
    if (message.type === "join") {
      const safeName = String(message.name || "Racer").trim().slice(0, 16);
      if (safeName) player.name = safeName;
      const carIndex = Number(message.carIndex);
      if (Number.isInteger(carIndex) && VEHICLES[carIndex]) player.carIndex = carIndex;
      if (typeof message.color === "string" && /^#[0-9a-f]{6}$/i.test(message.color)) player.color = message.color;
      const levels = message.upgrades || {};
      player.upgrades = {
        engine: Math.max(0, Math.min(3, Number(levels.engine) || 0)),
        handling: Math.max(0, Math.min(3, Number(levels.handling) || 0)),
        brakes: Math.max(0, Math.min(3, Number(levels.brakes) || 0))
      };
      const customization = message.customization || {};
      const defaults = defaultCustomization();
      player.wheelColor = typeof customization.wheelColor === "string" && /^#[0-9a-f]{6}$/i.test(customization.wheelColor)
        ? customization.wheelColor
        : defaults.wheelColor;
      for (const field of ["wheelStyle", "finish", "decals", "spoiler"]) {
        if (typeof customization[field] === "string" && customization[field].length <= 24) {
          player[field] = customization[field];
        }
      }
    } else if (message.type === "input") {
      player.input.throttle = message.throttle ? 1 : 0;
      player.input.brake = message.brake ? 1 : 0;
      player.input.steer = Math.max(-1, Math.min(1, Number(message.steer) || 0));
    }
  });
  socket.on("close", () => {
    players.delete(player.id);
    fillGrid();
  });
});

setInterval(tick, 1000 / TICK_RATE);
server.listen(PORT, HOST, () => {
  console.log(`Rivalken is live at http://localhost:${PORT}`);
  console.log(`Other players on your network can join at http://<this-computer-ip>:${PORT}`);
});

function shutdown() {
  for (const socket of wss.clients) socket.close();
  server.close(() => process.exit(0));
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
