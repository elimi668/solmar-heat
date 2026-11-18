// The screenshot scenes behind ?shot=start|play|drive|chase|mission. Each one plays the real
// rules forward from a fresh world for a fixed number of steps, steered by a simple autopilot, so
// the frame is what a short game really looks like and the same seed always gives the same frame.
// Scenes for cars, the chase and the mission arrive with their stages; until then they fall back
// to the on-foot play scene rather than staging something the game cannot do yet.
import { MISSION, STEP, STREET_X, STREET_Y, WANTED } from './config.js';
import { SCREEN_PLAY, SCREEN_TITLE } from './render.js';

const START_SECONDS = 5;
const PLAY_SECONDS = 20;

function randomStreetPoint(random) {
  const vertical = random() < 0.5;
  if (vertical) {
    return { x: STREET_X[Math.floor(random() * STREET_X.length)], y: 100 + random() * 2200 };
  }
  return { x: 100 + random() * 3000, y: STREET_Y[Math.floor(random() * STREET_Y.length)] };
}

/** Walk toward a street point, picking a new one on arrival: the on-foot autopilot. */
function walkAutopilot(state, target, random) {
  const player = state.player;
  const dx = target.x - player.x;
  const dy = target.y - player.y;
  if (Math.hypot(dx, dy) < 40) {
    const next = randomStreetPoint(random);
    target.x = next.x;
    target.y = next.y;
    return { x: 0, y: 0 };
  }
  const len = Math.hypot(dx, dy);
  return { x: dx / len, y: dy / len };
}

/**
 * Set `world` to the named scene and return the screen to draw over it and the best cash to show.
 * `random` is the world's own seeded generator, so the scene is repeatable.
 */
export function stageShot(name, world, random) {
  world.reset();
  const state = world.state;
  if (name !== 'play' && name !== 'drive' && name !== 'chase' && name !== 'mission') {
    for (let index = 0; index < START_SECONDS / STEP; index += 1) {
      world.step(STEP, { moveX: 0, moveY: 0, run: false });
    }
    return { screen: SCREEN_TITLE, best: state.best };
  }
  const target = randomStreetPoint(random);
  if (name === 'mission') {
    // The delivery: on foot, walking toward the Sunset Motel marker with the beacon in frame.
    // The walk stops short so the marker is still the live objective in the shot.
    state.mission.stage = 2;
    state.mission.marker = { ...MISSION.deliver };
    state.mission.text = MISSION.deliver.text;
    state.player.x = MISSION.deliver.x - 350;
    state.player.y = MISSION.deliver.y + 40;
    for (let index = 0; index < 1.2 / STEP; index += 1) {
      const p = state.player;
      const dx = state.mission.marker.x - p.x;
      const dy = state.mission.marker.y - p.y;
      const len = Math.hypot(dx, dy) || 1;
      world.step(STEP, { moveX: dx / len, moveY: dy / len, run: false });
    }
    return { screen: SCREEN_PLAY, best: state.best };
  }
  if (name === 'chase') {
    // Wanted 3 stars: build speed first, then the police spawn behind and chase east down the
    // 400 street. The head start keeps the chase a pursuit instead of a pile-up.
    const car = state.cars.find((c) => c.kind === 'parked' && c.angle === 0) ?? state.cars[0];
    state.player.x = car.x;
    state.player.y = car.y - 44;
    world.step(STEP, { moveX: 0, moveY: 0, run: false, enter: true });
    const streetY = STREET_Y.reduce((a, b) => (Math.abs(b - car.y) < Math.abs(a - car.y) ? b : a));
    function driveEast(seconds) {
      for (let index = 0; index < seconds / STEP; index += 1) {
        const p = state.player;
        if (!p.car) break;
        const want = Math.atan2(streetY - p.y, 300);
        let diff = want - p.angle;
        while (diff > Math.PI) diff -= Math.PI * 2;
        while (diff < -Math.PI) diff += Math.PI * 2;
        const steer = diff > 0.05 ? 1 : diff < -0.05 ? -1 : 0;
        world.step(STEP, { moveX: steer, moveY: -1, run: false, handbrake: false });
      }
    }
    driveEast(1.5);
    state.wanted = 3;
    state.wantedTimer = WANTED.decaySeconds;
    driveEast(3.5);
    return { screen: SCREEN_PLAY, best: state.best };
  }
  if (name === 'drive') {
    // Get in the east-facing parked car on the 400 street, then drive east down it: 4.5 s is
    // enough to be at speed with traffic around, and short enough to stay inside the city.
    const car = state.cars.find((c) => c.kind === 'parked' && c.angle === 0) ?? state.cars[0];
    state.player.x = car.x;
    state.player.y = car.y - 44;
    world.step(STEP, { moveX: 0, moveY: 0, run: false, enter: true });
    const streetY = STREET_Y.reduce((a, b) => (Math.abs(b - car.y) < Math.abs(a - car.y) ? b : a));
    for (let index = 0; index < 4.5 / STEP; index += 1) {
      const p = state.player;
      if (!p.car) break;
      const want = Math.atan2(streetY - p.y, 300);
      let diff = want - p.angle;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      const steer = diff > 0.05 ? 1 : diff < -0.05 ? -1 : 0;
      world.step(STEP, { moveX: steer, moveY: -1, run: false, handbrake: false });
    }
    return { screen: SCREEN_PLAY, best: state.best };
  }
  for (let index = 0; index < PLAY_SECONDS / STEP; index += 1) {
    const move = walkAutopilot(state, target, random);
    world.step(STEP, { moveX: move.x, moveY: move.y, run: false });
  }
  return { screen: SCREEN_PLAY, best: state.best };
}
