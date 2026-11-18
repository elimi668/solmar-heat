// Solmar Heat's rules and state, with no drawing and no browser in it: the city grid, the
// player on foot, cars, traffic, pedestrians, the wanted level and police, the mission, and the
// particles. step() advances one fixed step and returns what happened as bit flags, so the caller
// can react (sound, announcements) without the world knowing about screens or sound. The city is
// generated once from the seed: streets, blocks, buildings, the park and the beach are the same
// every visit with the same seed.

import {
  CAR, CASH, CLOCK, HEALTH, MISSION, PALETTE, PEDESTRIAN, PLAYER, POLICE, SAND_TOP, STREET_X,
  STREET_Y, TRAFFIC, WANTED, WATER_TOP, WORLD, PARK,
} from './config.js';

export const EVENT_CASH = 1;
export const EVENT_CRASH = 2;
export const EVENT_PUNCH = 4;
export const EVENT_OBJECTIVE = 8;
export const EVENT_MISSION_DONE = 16;
export const EVENT_BUSTED = 32;
export const EVENT_STEAL = 64;
export const EVENT_SIREN = 128;

/** The block columns and rows between the streets: [min, max] spans of buildable ground. */
function blockSpans(centres, roadHalf, worldSize) {
  const spans = [];
  let edge = 0;
  for (const centre of centres) {
    spans.push([edge, centre - roadHalf - 28]);
    edge = centre + roadHalf + 28;
  }
  spans.push([edge, worldSize]);
  return spans;
}

function rectsOverlap(a, b) {
  return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
}

/** Push a circle out of a rectangle; returns true when it overlapped. Mutates `p`. */
function pushOutOfRect(p, radius, rect) {
  const nearestX = Math.max(rect.x, Math.min(p.x, rect.x + rect.width));
  const nearestY = Math.max(rect.y, Math.min(p.y, rect.y + rect.height));
  const dx = p.x - nearestX;
  const dy = p.y - nearestY;
  const distSq = dx * dx + dy * dy;
  if (distSq >= radius * radius) return false;
  if (distSq > 0.0001) {
    const dist = Math.sqrt(distSq);
    p.x = nearestX + (dx / dist) * radius;
    p.y = nearestY + (dy / dist) * radius;
    return true;
  }
  // Centre inside the rectangle: push out along the shallowest side.
  const left = p.x - rect.x;
  const right = rect.x + rect.width - p.x;
  const top = p.y - rect.y;
  const bottom = rect.y + rect.height - p.y;
  const min = Math.min(left, right, top, bottom);
  if (min === left) p.x = rect.x - radius;
  else if (min === right) p.x = rect.x + rect.width + radius;
  else if (min === top) p.y = rect.y - radius;
  else p.y = rect.y + rect.height + radius;
  return true;
}

function onSand(y) {
  return y >= SAND_TOP && y < WATER_TOP;
}

export function createWorld(random) {
  // ---- City generation (deterministic from the seed) ----
  const buildings = [];
  const trees = [];
  const colSpans = blockSpans(STREET_X, 62, WORLD.width);
  const rowSpans = blockSpans(STREET_Y, 62, WORLD.height);
  const parkRect = { x: PARK.x, y: PARK.y, width: PARK.width, height: PARK.height };
  let buildingIndex = 0;

  for (let col = 0; col < colSpans.length; col += 1) {
    for (let row = 0; row < rowSpans.length; row += 1) {
      const [x0, x1] = colSpans[col];
      const [y0, y1raw] = rowSpans[row];
      // The last row ends at the sand: no building ever stands on the beach or in the water.
      const y1 = Math.min(y1raw, SAND_TOP);
      const block = { x: x0 + 14, y: y0 + 14, width: x1 - x0 - 28, height: y1 - y0 - 28 };
      if (block.width < 90 || block.height < 90) continue;
      if (rectsOverlap(block, parkRect)) {
        // The park: trees and a pond, no buildings.
        for (let t = 0; t < 16; t += 1) {
          trees.push({
            x: parkRect.x + 40 + random() * (parkRect.width - 80),
            y: parkRect.y + 40 + random() * (parkRect.height - 80),
            park: true,
          });
        }
        continue;
      }
      const beachfront = y0 >= SAND_TOP - 200;
      const count = block.width > 420 && block.height > 260 && random() < 0.6 ? 2 : 1;
      for (let b = 0; b < count; b += 1) {
        const w = Math.min(block.width - 24, 120 + random() * 170);
        const h = Math.min(block.height - 24, 90 + random() * 130);
        const bx = block.x + 12 + random() * Math.max(1, block.width - w - 24);
        const by = block.y + 12 + random() * Math.max(1, block.height - h - 24);
        const rect = { x: bx, y: by, width: w, height: h };
        if (buildings.some((other) => rectsOverlap(rect, other))) continue;
        buildings.push({
          ...rect,
          color: PALETTE.building[buildingIndex % PALETTE.building.length],
          hotel: beachfront,
          sign: beachfront && random() < 0.7,
        });
        buildingIndex += 1;
      }
      // A couple of street trees on the block's corners.
      for (let t = 0; t < 2; t += 1) {
        trees.push({ x: block.x + 20 + random() * (block.width - 40), y: block.y + 16, park: false });
      }
    }
  }

  // The water is one blocked rectangle along the south edge.
  const waterRect = { x: 0, y: WATER_TOP, width: WORLD.width, height: WORLD.height - WATER_TOP };
  const solids = buildings.concat([waterRect]);

  // Parked cars at curbside spots along the streets (empty, stealable).
  const parkedSpots = [
    { x: 448, y: 800, angle: Math.PI / 2 }, { x: 1152, y: 1600, angle: -Math.PI / 2 },
    { x: 2048, y: 800, angle: Math.PI / 2 }, { x: 2752, y: 1500, angle: -Math.PI / 2 },
    { x: 800, y: 448, angle: 0 }, { x: 2400, y: 1948, angle: Math.PI },
  ];

  const state = {
    time: 0,
    clockMinutes: CLOCK.startMinutes,
    player: { x: 1200, y: 400, angle: -Math.PI / 2, radius: PLAYER.radius, speed: 0, onFoot: true, car: null, health: HEALTH.max, invulnerable: 0, punchCooldown: 0 },
    cars: [],
    peds: [],
    particles: [],
    skids: [],
    pickups: [],
    wanted: 0,
    wantedTimer: 0,
    lastCrime: -1000,
    mission: { stage: 1, done: false, marker: { ...MISSION.pickup }, text: MISSION.pickup.text, banner: 0, bannerText: '' },
    cash: CASH.start,
    best: 0,
    camera: { x: 1200, y: 400 },
    shake: 0,
    buildings,
    trees,
    solids,
    parkedSpots,
  };

  function reset() {
    state.time = 0;
    state.clockMinutes = CLOCK.startMinutes;
    state.player.x = 1200;
    state.player.y = 400;
    state.player.angle = -Math.PI / 2;
    state.player.speed = 0;
    state.player.onFoot = true;
    state.player.car = null;
    state.player.health = HEALTH.max;
    state.player.invulnerable = 0;
    state.player.punchCooldown = 0;
    state.cars.length = 0;
    state.peds.length = 0;
    state.particles.length = 0;
    state.skids.length = 0;
    state.pickups.length = 0;
    state.wanted = 0;
    state.wantedTimer = 0;
    state.lastCrime = -1000;
    state.mission.stage = 1;
    state.mission.done = false;
    state.mission.marker = { ...MISSION.pickup };
    state.mission.text = MISSION.pickup.text;
    state.mission.banner = 0;
    state.mission.bannerText = '';
    state.cash = CASH.start;
    state.camera.x = state.player.x;
    state.camera.y = state.player.y;
    state.shake = 0;
    for (const spot of state.parkedSpots) {
      state.cars.push({
        x: spot.x, y: spot.y, angle: spot.angle, speed: 0, kind: 'parked',
        color: PALETTE.traffic[Math.floor(random() * PALETTE.traffic.length)],
        active: true, driver: 'none', cooldown: 0, stuck: 0,
      });
    }
    ensureTraffic();
    ensurePeds();
  }

  function addWanted(stars) {
    state.wanted = Math.min(WANTED.max, state.wanted + stars);
    state.wantedTimer = WANTED.decaySeconds;
    state.lastCrime = state.time;
  }

  function addParticles(x, y, count, color, speed, size, life) {
    for (let i = 0; i < count; i += 1) {
      if (state.particles.length > 120) state.particles.shift();
      const angle = random() * Math.PI * 2;
      const v = speed * (0.4 + random() * 0.6);
      state.particles.push({
        x, y, vx: Math.cos(angle) * v, vy: Math.sin(angle) * v,
        life, max: life, size: size * (0.7 + random() * 0.6), color,
      });
    }
  }

  function dropCash(x, y) {
    state.pickups.push({
      x, y, value: CASH.pedDropMin + Math.floor(random() * (CASH.pedDropMax - CASH.pedDropMin)),
      life: CASH.pickupLife,
    });
  }

  function nearestCarTo(x, y, maxDist) {
    let best = null;
    let bestDist = maxDist;
    for (const car of state.cars) {
      if (!car.active) continue;
      const dist = Math.hypot(car.x - x, car.y - y);
      if (dist < bestDist) {
        bestDist = dist;
        best = car;
      }
    }
    return best;
  }

  /** Steer toward the target intersection, keeping to the right-hand lane. */
  function stepTrafficCar(car, dt) {
    const dx = car.tx - car.x;
    const dy = car.ty - car.y;
    const dist = Math.hypot(dx, dy);
    const targetAngle = Math.atan2(dy, dx);
    let diff = targetAngle - car.angle;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    car.angle += Math.max(-2.4 * dt, Math.min(2.4 * dt, diff));
    // Do not rear-end the car ahead on the same lane.
    let cruise = car.cruise;
    for (const other of state.cars) {
      if (other === car || other.kind !== 'traffic' || !other.active) continue;
      const ox = other.x - car.x;
      const oy = other.y - car.y;
      const ahead = ox * Math.cos(car.angle) + oy * Math.sin(car.angle);
      const side = Math.abs(-ox * Math.sin(car.angle) + oy * Math.cos(car.angle));
      if (ahead > 0 && ahead < 70 && side < 30) cruise = Math.min(cruise, other.speed);
    }
    car.speed += (cruise - car.speed) * Math.min(1, dt * 1.4);
    car.x += Math.cos(car.angle) * car.speed * dt;
    car.y += Math.sin(car.angle) * car.speed * dt;
    if (dist < 26) {
      const options = [];
      if (car.ix > 0) options.push([car.ix - 1, car.iy]);
      if (car.ix < STREET_X.length - 1) options.push([car.ix + 1, car.iy]);
      if (car.iy > 0) options.push([car.ix, car.iy - 1]);
      if (car.iy < STREET_Y.length - 1) options.push([car.ix, car.iy + 1]);
      const usable = options.filter(([a, b]) => !(a === car.fromIx && b === car.fromIy));
      const pick = (usable.length ? usable : options)[Math.floor(random() * (usable.length ? usable.length : options.length))];
      car.fromIx = car.ix;
      car.fromIy = car.iy;
      car.ix = pick[0];
      car.iy = pick[1];
      const ox = STREET_X[car.ix] - STREET_X[car.fromIx];
      const oy = STREET_Y[car.iy] - STREET_Y[car.fromIy];
      const len = Math.hypot(ox, oy) || 1;
      car.tx = STREET_X[car.ix] + (-oy / len) * 14;
      car.ty = STREET_Y[car.iy] + (ox / len) * 14;
    }
  }

  function spawnTrafficCar(nearX, nearY) {
    for (let attempt = 0; attempt < 12; attempt += 1) {
      const ix = Math.floor(random() * STREET_X.length);
      const iy = Math.floor(random() * STREET_Y.length);
      const x = STREET_X[ix];
      const y = STREET_Y[iy];
      if (nearX !== undefined && Math.hypot(x - nearX, y - nearY) > 1100) continue;
      const options = [];
      if (ix > 0) options.push([ix - 1, iy]);
      if (ix < STREET_X.length - 1) options.push([ix + 1, iy]);
      if (iy > 0) options.push([ix, iy - 1]);
      if (iy < STREET_Y.length - 1) options.push([ix, iy + 1]);
      const pick = options[Math.floor(random() * options.length)];
      const ox = STREET_X[pick[0]] - x;
      const oy = STREET_Y[pick[1]] - y;
      const len = Math.hypot(ox, oy) || 1;
      state.cars.push({
        x: x + (-oy / len) * 14, y: y + (ox / len) * 14, angle: Math.atan2(oy, ox),
        speed: TRAFFIC.cruiseMin, kind: 'traffic',
        color: PALETTE.traffic[Math.floor(random() * PALETTE.traffic.length)],
        active: true, driver: 'ai', cooldown: 0, stuck: 0,
        cruise: TRAFFIC.cruiseMin + random() * (TRAFFIC.cruiseMax - TRAFFIC.cruiseMin),
        ix, iy, fromIx: ix, fromIy: iy,
        tx: STREET_X[pick[0]] + (-oy / len) * 14, ty: STREET_Y[pick[1]] + (ox / len) * 14,
      });
      return;
    }
  }

  function ensureTraffic() {
    let count = 0;
    for (const car of state.cars) if (car.active && car.kind === 'traffic') count += 1;
    while (count < TRAFFIC.count) {
      spawnTrafficCar(state.player.x, state.player.y);
      count += 1;
    }
  }

  function spawnPed(nearX, nearY) {
    const vertical = random() < 0.5;
    let x;
    let y;
    let lane;
    if (vertical) {
      const street = STREET_X[Math.floor(random() * STREET_X.length)];
      const line = street + (random() < 0.5 ? -80 : 80);
      x = line;
      y = random() * WORLD.height;
      lane = { axis: 'v', line, dir: random() < 0.5 ? 1 : -1 };
    } else {
      const street = STREET_Y[Math.floor(random() * STREET_Y.length)];
      const line = street + (random() < 0.5 ? -80 : 80);
      x = random() * WORLD.width;
      y = line;
      lane = { axis: 'h', line, dir: random() < 0.5 ? 1 : -1 };
    }
    if (nearX !== undefined && Math.hypot(x - nearX, y - nearY) > 1100) return;
    state.peds.push({
      x, y, angle: 0, speed: PEDESTRIAN.speedMin + random() * (PEDESTRIAN.speedMax - PEDESTRIAN.speedMin),
      lane, down: 0, color: PALETTE.ped[Math.floor(random() * PALETTE.ped.length)],
    });
  }

  function ensurePeds() {
    while (state.peds.length < PEDESTRIAN.count) spawnPed(state.player.x, state.player.y);
  }

  function stepPed(ped, dt) {
    if (ped.down > 0) {
      ped.down = Math.max(0, ped.down - dt);
      return;
    }
    const lane = ped.lane;
    if (lane.axis === 'v') {
      ped.y += lane.dir * ped.speed * dt;
      ped.angle = lane.dir > 0 ? Math.PI / 2 : -Math.PI / 2;
      if (ped.y < 20 || ped.y > WORLD.height - 20) lane.dir *= -1;
      // At a crossing, sometimes turn onto the cross street's sidewalk.
      for (const street of STREET_Y) {
        if (Math.abs(ped.y - street) < 100 && random() < dt * 0.35) {
          ped.lane = { axis: 'h', line: street + (random() < 0.5 ? -80 : 80), dir: random() < 0.5 ? 1 : -1 };
          ped.y = ped.lane.line;
          break;
        }
      }
    } else {
      ped.x += lane.dir * ped.speed * dt;
      ped.angle = lane.dir > 0 ? 0 : Math.PI;
      if (ped.x < 20 || ped.x > WORLD.width - 20) lane.dir *= -1;
      for (const street of STREET_X) {
        if (Math.abs(ped.x - street) < 100 && random() < dt * 0.35) {
          ped.lane = { axis: 'v', line: street + (random() < 0.5 ? -80 : 80), dir: random() < 0.5 ? 1 : -1 };
          ped.x = ped.lane.line;
          break;
        }
      }
    }
  }

  function spawnPolice() {
    const player = state.player;
    for (let attempt = 0; attempt < 16; attempt += 1) {
      const ix = Math.floor(random() * STREET_X.length);
      const iy = Math.floor(random() * STREET_Y.length);
      const x = STREET_X[ix];
      const y = STREET_Y[iy];
      const dist = Math.hypot(x - player.x, y - player.y);
      if (dist < 600 || dist > 1300) continue;
      // Never stack two units on the same corner.
      if (state.cars.some((c) => c.active && c.kind === 'police'
        && Math.hypot(c.x - x, c.y - y) < 150)) continue;
      state.cars.push({
        x, y, angle: Math.atan2(player.y - y, player.x - x), speed: 0, kind: 'police',
        color: PALETTE.police, active: true, driver: 'ai', cooldown: 0, stuck: 0, slide: 0, slideDir: 1,
        cruise: POLICE.cruise,
      });
      return true;
    }
    return false;
  }

  function ensurePolice() {
    // A unit that lost the trail stands down.
    for (const car of state.cars) {
      if (car.active && car.kind === 'police'
        && Math.hypot(car.x - state.player.x, car.y - state.player.y) > 1500) car.active = false;
    }
    // Fresh heat only while a crime is recent or a unit is still on the player's tail.
    const anyNear = state.cars.some((c) => c.active && c.kind === 'police'
      && Math.hypot(c.x - state.player.x, c.y - state.player.y) < 1200);
    const hot = state.wanted > 0 && (state.time - state.lastCrime < 20 || anyNear);
    const desired = hot ? Math.min(state.wanted + 1, POLICE.max) : 0;
    let count = 0;
    for (const car of state.cars) if (car.active && car.kind === 'police') count += 1;
    if (count > desired) {
      // The heat is off: the farthest units stand down first.
      const police = state.cars.filter((c) => c.active && c.kind === 'police');
      police.sort((a, b) => Math.hypot(b.x - state.player.x, b.y - state.player.y) - Math.hypot(a.x - state.player.x, a.y - state.player.y));
      for (let i = desired; i < police.length; i += 1) police[i].active = false;
      return false;
    }
    let spawned = false;
    while (count < desired) {
      if (!spawnPolice()) break;
      count += 1;
      spawned = true;
    }
    return spawned;
  }

  /** A police car steers at the player; stuck on a building, it slides along the wall to get around it. */
  function stepPoliceCar(car, dt) {
    const target = state.player.car ?? state.player;
    const dx = target.x - car.x;
    const dy = target.y - car.y;
    const targetAngle = Math.atan2(dy, dx);
    let desired = targetAngle;
    if (car.slide > 0) {
      car.slide -= dt;
      desired = targetAngle + car.slideDir * Math.PI / 2;
    }
    let diff = desired - car.angle;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    car.angle += Math.max(-3.4 * dt, Math.min(3.4 * dt, diff));
    car.speed += (car.cruise - car.speed) * Math.min(1, dt * 1.2);
    car.x += Math.cos(car.angle) * car.speed * dt;
    car.y += Math.sin(car.angle) * car.speed * dt;
    if (collideCircle(car, CAR.radius)) car.speed *= 0.6;
    if (Math.abs(car.speed) < 40) car.stuck += dt;
    else car.stuck = 0;
    if (car.stuck > 1.0) {
      car.slide = 1.5;
      car.slideDir = random() < 0.5 ? 1 : -1;
      car.stuck = 0;
    }
    if (car.cooldown > 0) car.cooldown = Math.max(0, car.cooldown - dt);
  }

  /** A police car touching the player on foot hurts; ramming the player's car hurts less. */
  function policeContact() {
    let events = 0;
    const player = state.player;
    for (const car of state.cars) {
      if (!car.active || car.kind !== 'police') continue;
      if (player.onFoot) {
        if (Math.hypot(car.x - player.x, car.y - player.y) < CAR.radius + player.radius) {
          // The unit brakes onto the player instead of driving through them.
          car.speed = Math.min(car.speed, 60);
          if (player.invulnerable === 0) {
            player.health -= POLICE.ramDamage;
            player.invulnerable = PLAYER.invulnerable;
            state.shake = 0.4;
            addParticles(player.x, player.y, 10, '#ff5a4e', 150, 4, 0.5);
            events |= EVENT_CRASH;
            if (player.health <= 0) {
              player.health = 0;
              events |= EVENT_BUSTED;
            }
          }
        }
      } else if (car.cooldown === 0
        && Math.hypot(car.x - player.car.x, car.y - player.car.y) < CAR.radius + TRAFFIC.radius) {
        player.health -= 6;
        car.cooldown = POLICE.ramCooldown;
        addParticles(player.car.x, player.car.y, 8, '#ffd23f', 160, 4, 0.5);
        events |= EVENT_CRASH;
        if (player.health <= 0) {
          player.health = 0;
          events |= EVENT_BUSTED;
        }
      }
    }
    return events;
  }

  /** Punching on foot, and the mission: reaching the marker advances the chain. */
  function stepMission(input) {
    let events = 0;
    const player = state.player;
    const mission = state.mission;
    if (input.punch && player.onFoot && player.punchCooldown === 0) {
      player.punchCooldown = 0.45;
      let victim = null;
      let victimDist = 55;
      for (const ped of state.peds) {
        if (ped.down > 0) continue;
        const dist = Math.hypot(ped.x - player.x, ped.y - player.y);
        if (dist >= victimDist) continue;
        const angle = Math.atan2(ped.y - player.y, ped.x - player.x);
        let diff = angle - player.angle;
        while (diff > Math.PI) diff -= Math.PI * 2;
        while (diff < -Math.PI) diff += Math.PI * 2;
        if (Math.abs(diff) > 1.1) continue;
        victimDist = dist;
        victim = ped;
      }
      if (victim) {
        victim.down = 5;
        dropCash(victim.x, victim.y);
        addParticles(victim.x, victim.y, 8, '#ffcf3f', 120, 4, 0.5);
        if (state.cars.some((c) => c.active && c.kind === 'police'
          && Math.hypot(c.x - player.x, c.y - player.y) < 400)) addWanted(1);
        events |= EVENT_PUNCH;
      }
    }
    if (!mission.done) {
      const marker = mission.marker;
      if (Math.hypot(player.x - marker.x, player.y - marker.y) < 70) {
        if (mission.stage === 1) {
          mission.stage = 2;
          mission.marker = { ...MISSION.deliver };
          mission.text = MISSION.deliver.text;
          mission.banner = 2.5;
          mission.bannerText = 'Package picked up';
          events |= EVENT_OBJECTIVE;
        } else if (mission.stage === 2) {
          state.cash += MISSION.reward;
          mission.stage = 3;
          mission.marker = { ...MISSION.escape };
          mission.text = MISSION.escape.text;
          mission.banner = 2.5;
          mission.bannerText = `Delivered! +$${MISSION.reward}`;
          if (state.wanted < 2) addWanted(2 - state.wanted);
          state.lastCrime = state.time;
          events |= EVENT_OBJECTIVE;
        } else if (mission.stage === 3) {
          mission.done = true;
          mission.text = 'Free roam — explore Solmar City';
          mission.banner = 3;
          mission.bannerText = 'MISSION COMPLETE';
          events |= EVENT_MISSION_DONE;
        }
      }
    }
    return events;
  }

  function stepPlayerInCar(dt, input) {
    const player = state.player;
    const car = player.car;
    const prevX = car.x;
    const prevY = car.y;
    let accel = 0;
    if (input.moveY < 0) accel = CAR.accel;
    else if (input.moveY > 0) accel = car.speed > 10 ? -CAR.brake : -CAR.accel * 0.5;
    car.speed += accel * dt;
    if (accel === 0) car.speed *= Math.max(0, 1 - CAR.drag * dt);
    if (input.handbrake) {
      const before = car.speed;
      car.speed -= Math.sign(car.speed) * CAR.handbrake * dt;
      if (Math.sign(car.speed) !== Math.sign(before)) car.speed = 0;
      if (Math.abs(before) > 120) {
        const px = Math.cos(car.angle + Math.PI / 2);
        const py = Math.sin(car.angle + Math.PI / 2);
        state.skids.push({ x1: prevX + px * 10, y1: prevY + py * 10, x2: car.x + px * 10, y2: car.y + py * 10, life: 6, max: 6 });
        state.skids.push({ x1: prevX - px * 10, y1: prevY - py * 10, x2: car.x - px * 10, y2: car.y - py * 10, life: 6, max: 6 });
        if (state.skids.length > 80) state.skids.splice(0, state.skids.length - 80);
      }
    }
    car.speed = Math.max(-CAR.maxReverse, Math.min(CAR.maxSpeed, car.speed));
    const steer = Math.min(1, Math.abs(car.speed) / 120);
    car.angle += input.moveX * CAR.turnRate * steer * dt * (car.speed < 0 ? -1 : 1);
    car.x += Math.cos(car.angle) * car.speed * dt;
    car.y += Math.sin(car.angle) * car.speed * dt;
    const speedBefore = car.speed;
    if (collideCircle(car, CAR.radius)) {
      car.speed *= 0.5;
      if (Math.abs(speedBefore) > 220) {
        state.shake = 0.5;
        addParticles(car.x, car.y, 8, '#ffd23f', 160, 4, 0.5);
        return EVENT_CRASH;
      }
    }
    // Exhaust puffs while accelerating hard.
    if (accel > 0 && Math.abs(car.speed) > 60 && random() < dt * 20) {
      const bx = car.x - Math.cos(car.angle) * 34;
      const by = car.y - Math.sin(car.angle) * 34;
      addParticles(bx, by, 1, 'rgba(160,160,170,0.7)', 40, 5, 0.7);
    }
    player.x = car.x;
    player.y = car.y;
    player.angle = car.angle;
    if (player.invulnerable > 0) player.invulnerable = Math.max(0, player.invulnerable - dt);
    if (player.punchCooldown > 0) player.punchCooldown = Math.max(0, player.punchCooldown - dt);
    return 0;
  }

  function collideCars(dt) {
    let events = 0;
    const playerCar = state.player.car;
    if (!playerCar) return events;
    for (const other of state.cars) {
      if (other === playerCar || !other.active) continue;
      const dx = other.x - playerCar.x;
      const dy = other.y - playerCar.y;
      const dist = Math.hypot(dx, dy);
      const minDist = CAR.radius + TRAFFIC.radius;
      if (dist >= minDist || dist < 0.01) continue;
      const push = (minDist - dist) / 2;
      const nx = dx / dist;
      const ny = dy / dist;
      playerCar.x -= nx * push;
      playerCar.y -= ny * push;
      if (other.kind !== 'parked') {
        other.x += nx * push;
        other.y += ny * push;
      }
      const impact = Math.abs(playerCar.speed - other.speed);
      if (impact > 150) {
        // A real crash: both cars shed speed, sparks fly, the camera shakes.
        state.shake = 0.5;
        playerCar.speed *= 0.6;
        if (other.kind === 'traffic') other.speed *= 0.4;
        addParticles(playerCar.x, playerCar.y, 8, '#ffd23f', 160, 4, 0.5);
        events |= EVENT_CRASH;
      } else if (other.kind === 'traffic') {
        // A gentle rear-end: the traffic car pulls away instead of both cars locking up.
        other.speed = Math.max(other.speed, Math.abs(playerCar.speed) * 0.95);
        playerCar.speed *= 1 - 0.1 * dt;
      } else if (other.kind === 'police') {
        // A police ram is paid for in health by policeContact, not in speed here.
      } else {
        playerCar.speed *= 1 - 0.5 * dt;
      }
    }
    return events;
  }

  function collideCarPeds() {
    let events = 0;
    const car = state.player.car;
    if (!car || Math.abs(car.speed) < 40) return events;
    for (const ped of state.peds) {
      if (ped.down > 0) continue;
      if (Math.hypot(ped.x - car.x, ped.y - car.y) < CAR.radius + PEDESTRIAN.radius) {
        ped.down = 5;
        dropCash(ped.x, ped.y);
        addWanted(1);
        addParticles(ped.x, ped.y, 10, '#ff5a4e', 140, 4, 0.6);
        car.speed *= 0.85;
        events |= EVENT_CRASH;
      }
    }
    return events;
  }

  function stepParticles(dt) {
    for (let i = state.particles.length - 1; i >= 0; i -= 1) {
      const p = state.particles[i];
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.life -= dt;
      if (p.life <= 0) state.particles.splice(i, 1);
    }
    for (let i = state.skids.length - 1; i >= 0; i -= 1) {
      state.skids[i].life -= dt;
      if (state.skids[i].life <= 0) state.skids.splice(i, 1);
    }
    for (let i = state.pickups.length - 1; i >= 0; i -= 1) {
      const pickup = state.pickups[i];
      pickup.life -= dt;
      if (pickup.life <= 0) {
        state.pickups.splice(i, 1);
        continue;
      }
      const player = state.player;
      if (player.onFoot && Math.hypot(pickup.x - player.x, pickup.y - player.y) < 34) {
        state.cash += pickup.value;
        state.pickups.splice(i, 1);
      }
    }
  }

  function collideCircle(p, radius) {
    let hit = false;
    for (let i = 0; i < state.solids.length; i += 1) {
      if (pushOutOfRect(p, radius, state.solids[i])) hit = true;
    }
    p.x = Math.max(radius, Math.min(WORLD.width - radius, p.x));
    p.y = Math.max(radius, Math.min(WORLD.height - radius, p.y));
    return hit;
  }

  function stepPlayerOnFoot(dt, input) {
    const player = state.player;
    const len = Math.hypot(input.moveX, input.moveY);
    let speed = 0;
    if (len > 0.01) {
      const base = input.run ? PLAYER.run : PLAYER.walk;
      speed = onSand(player.y) ? base * PLAYER.sand : base;
      const nx = input.moveX / Math.max(1, len);
      const ny = input.moveY / Math.max(1, len);
      player.x += nx * speed * dt;
      player.y += ny * speed * dt;
      player.angle = Math.atan2(ny, nx);
      collideCircle(player, player.radius);
    }
    player.speed = speed;
    if (player.invulnerable > 0) player.invulnerable = Math.max(0, player.invulnerable - dt);
    if (player.punchCooldown > 0) player.punchCooldown = Math.max(0, player.punchCooldown - dt);
  }

  function stepCamera() {
    const focus = state.player.onFoot
      ? state.player
      : state.player.car ?? state.player;
    state.camera.x = focus.x;
    state.camera.y = focus.y;
  }

  /**
   * One fixed step. `input` carries the held keys: moveX/moveY (-1..1), run, and (later stages)
   * enter, punch, handbrake. Returns event bit flags.
   */
  function step(dt, input) {
    let events = 0;
    state.time += dt;
    state.clockMinutes = (CLOCK.startMinutes + state.time * CLOCK.minutesPerSecond) % (24 * 60);
    if (state.mission.banner > 0) state.mission.banner = Math.max(0, state.mission.banner - dt);
    if (state.shake > 0) state.shake = Math.max(0, state.shake - dt * 2.2);

    if (state.player.onFoot) {
      stepPlayerOnFoot(dt, input);
      if (input.enter) {
        const car = nearestCarTo(state.player.x, state.player.y, 85);
        if (car) {
          state.player.onFoot = false;
          state.player.car = car;
          car.driver = 'player';
          if (car.kind !== 'player') {
            car.kind = 'player';
            addWanted(1);
            events |= EVENT_STEAL;
          }
          state.player.x = car.x;
          state.player.y = car.y;
          state.player.angle = car.angle;
        }
      }
    } else {
      events |= stepPlayerInCar(dt, input);
      if (input.enter && Math.abs(state.player.car.speed) < 40) {
        const car = state.player.car;
        car.driver = 'none';
        car.kind = 'parked';
        car.speed = 0;
        state.player.onFoot = true;
        state.player.car = null;
        state.player.x = car.x + Math.cos(car.angle + Math.PI / 2) * 44;
        state.player.y = car.y + Math.sin(car.angle + Math.PI / 2) * 44;
        collideCircle(state.player, state.player.radius);
      }
    }
    ensureTraffic();
    for (const car of state.cars) {
      if (car.active && car.kind === 'traffic') stepTrafficCar(car, dt);
    }
    ensurePeds();
    for (const ped of state.peds) stepPed(ped, dt);
    events |= collideCars(dt);
    events |= collideCarPeds();
    // Wanted: cools off one star at a time when no police are close; health creeps back too.
    if (state.wanted > 0) {
      const policeNear = state.cars.some((c) => c.active && c.kind === 'police'
        && Math.hypot(c.x - state.player.x, c.y - state.player.y) < WANTED.nearPolice);
      if (!policeNear) {
        state.wantedTimer -= dt;
        if (state.wantedTimer <= 0) {
          state.wanted -= 1;
          state.wantedTimer = WANTED.decaySeconds;
        }
      } else {
        state.wantedTimer = WANTED.decaySeconds;
      }
    }
    if (state.wanted === 0 && state.player.health < HEALTH.max) {
      state.player.health = Math.min(HEALTH.max, state.player.health + HEALTH.regenPerSecond * dt);
    }
    if (ensurePolice()) events |= EVENT_SIREN;
    for (const car of state.cars) {
      if (car.active && car.kind === 'police') stepPoliceCar(car, dt);
    }
    events |= policeContact();
    events |= stepMission(input);
    stepParticles(dt);
    stepCamera();
    return events;
  }

  reset();
  return { state, reset, step };
}
