// Boot and the one loop: input is read every frame, the world advances in fixed 1/60 s steps
// (several in a slow frame, none in a fast one), and the renderer paints what is there. The game
// moves between four screens: title, play, paused and busted. Progress (cash, mission, position,
// health) saves to localStorage on pause, on leaving the tab, and every 20 seconds of play.
//
// ?seed=N fixes the city and the traffic. ?shot=start|play|drive|chase|mission (with &seed=N)
// stages that scene instead of running the loop, paints it twice and sets window.__shotReady.
import { BEST_KEY, STEP } from './config.js';
import { createRandom } from './random.js';
import { createWorld, EVENT_BUSTED, EVENT_CASH, EVENT_CRASH, EVENT_MISSION_DONE, EVENT_OBJECTIVE, EVENT_PUNCH, EVENT_STEAL } from './world.js';
import {
  ACTION_CONFIRM, ACTION_ENTER, ACTION_MUTE, ACTION_NEW, ACTION_PAUSE, ACTION_PUNCH, createInput,
} from './input.js';
import { createRenderer, SCREEN_OVER, SCREEN_PAUSED, SCREEN_PLAY, SCREEN_TITLE } from './render.js';
import { stageShot } from './shots.js';
import { clearSave, describeSave, readSave, writeSave } from './save.js';
import { createAudio } from './audio.js';

/** The longest frame the loop catches up on; a longer stall (a hidden tab) is dropped, not replayed. */
const MAX_FRAME = 0.25;
/** Seconds of play between autosaves. */
const AUTOSAVE_SECONDS = 20;

const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seedParam = Number.parseInt(params.get('seed') ?? '', 10);
const seed = Number.isInteger(seedParam) ? seedParam : Math.floor(Math.random() * 4294967296);

const canvas = document.getElementById('game');
const status = document.getElementById('status');
const world = createWorld(createRandom(seed));
const renderer = createRenderer(canvas);
const shotRandom = createRandom(seed ^ 0x9e3779b9);

function readBest() {
  try {
    return Number.parseInt(window.localStorage.getItem(BEST_KEY) ?? '0', 10) || 0;
  } catch {
    return 0;
  }
}

function saveBest(value) {
  try {
    window.localStorage.setItem(BEST_KEY, String(value));
  } catch {
    // Storage can be off: the best cash then lasts this visit only.
  }
}

function runShot(name) {
  const scene = stageShot(name, world, shotRandom);
  let painted = 0;
  function paint() {
    renderer.draw(world.state, scene.screen, { best: scene.best, hasSave: false, saveFlash: 0, muted: false });
    painted += 1;
    if (painted < 2) requestAnimationFrame(paint);
    else window.__shotReady = true;
  }
  requestAnimationFrame(paint);
}

function runGame() {
  const input = createInput(canvas);
  const audio = createAudio();
  let screen = SCREEN_TITLE;
  let best = readBest();
  let save = readSave();
  let accumulator = 0;
  let last = performance.now();
  let autosaveTimer = AUTOSAVE_SECONDS;
  const ui = {
    best, hasSave: save !== null, saveCash: save?.cash ?? 0,
    saveMission: save ? describeSave(save) : '', overTitle: 'BUSTED', saveFlash: 0, muted: false,
  };

  // Screen readers (and anyone watching the page's text) hear the screen changes.
  function announce(message) {
    status.textContent = message;
  }

  function doSave() {
    if (writeSave(world)) ui.saveFlash = 1.5;
  }

  function applySave(next) {
    const player = world.state.player;
    player.x = next.x;
    player.y = next.y;
    player.health = next.health ?? 100;
    world.state.cash = next.cash;
    world.state.wanted = next.wanted ?? 0;
    world.state.clockMinutes = next.clockMinutes ?? world.state.clockMinutes;
    if (next.missionStage === 0) {
      world.state.mission.done = true;
      world.state.mission.text = 'Free roam — explore Solmar City';
    } else {
      world.state.mission.stage = next.missionStage ?? 1;
    }
    world.state.camera.x = player.x;
    world.state.camera.y = player.y;
  }

  function startGame(fresh) {
    if (fresh) {
      clearSave();
      world.reset();
      save = null;
    } else if (save) {
      world.reset();
      applySave(save);
    } else {
      world.reset();
    }
    ui.hasSave = false;
    accumulator = 0;
    autosaveTimer = AUTOSAVE_SECONDS;
    screen = SCREEN_PLAY;
    announce('Playing. Solmar City.');
  }

  function endGame(title) {
    screen = SCREEN_OVER;
    ui.overTitle = title;
    if (world.state.cash > best) {
      best = world.state.cash;
      saveBest(best);
      ui.best = best;
    }
    announce(`${title}. Cash $${world.state.cash}. Best $${best}.`);
  }

  function handleActions() {
    const actions = input.takeActions();
    if (actions & ACTION_MUTE) {
      ui.muted = !ui.muted;
      audio.setMuted(ui.muted);
      announce(ui.muted ? 'Muted.' : 'Sound on.');
    }
    if (screen === SCREEN_TITLE) {
      if (actions & ACTION_NEW) startGame(true);
      else if (actions & ACTION_CONFIRM) {
        audio.unlock();
        startGame(false);
      }
    } else if (screen === SCREEN_OVER) {
      if (actions & ACTION_CONFIRM) {
        audio.unlock();
        startGame(true);
      }
    } else if (screen === SCREEN_PLAY) {
      if (actions & ACTION_PAUSE) {
        screen = SCREEN_PAUSED;
        doSave();
        announce('Paused. Progress saved.');
      }
    } else if (screen === SCREEN_PAUSED) {
      if (actions & (ACTION_PAUSE | ACTION_CONFIRM)) {
        screen = SCREEN_PLAY;
        announce('Playing.');
      }
    }
    return actions;
  }

  function step(actions) {
    const move = input.move();
    const events = world.step(STEP, {
      moveX: move.x, moveY: move.y, run: input.run(), handbrake: input.handbrake(),
      enter: Boolean(actions & ACTION_ENTER), punch: Boolean(actions & ACTION_PUNCH),
    });
    if (events & EVENT_BUSTED) endGame('BUSTED');
    if (events & EVENT_OBJECTIVE) {
      announce(world.state.mission.bannerText);
      audio.objective();
    }
    if (events & EVENT_MISSION_DONE) {
      announce('Mission complete.');
      audio.missionDone();
    }
    if (events & EVENT_CASH) audio.pickup();
    if (events & EVENT_CRASH) audio.crash();
    if (events & EVENT_PUNCH) audio.punch();
    if (events & EVENT_STEAL) audio.click();
    if (events & EVENT_BUSTED) audio.busted();
    autosaveTimer -= STEP;
    if (autosaveTimer <= 0) {
      autosaveTimer = AUTOSAVE_SECONDS;
      doSave();
    }
  }

  function frame(now) {
    requestAnimationFrame(frame);
    accumulator += Math.min((now - last) / 1000, MAX_FRAME);
    last = now;
    const actions = handleActions();
    if (ui.saveFlash > 0) ui.saveFlash = Math.max(0, ui.saveFlash - (now - last) / 1000);
    if (screen === SCREEN_PLAY) {
      while (accumulator >= STEP && screen === SCREEN_PLAY) {
        step(actions);
        accumulator -= STEP;
      }
    } else {
      accumulator = 0;
    }
    // Continuous sounds follow the game state every frame.
    const playerCar = world.state.player.car;
    audio.engine(playerCar ? playerCar.speed : 0, !world.state.player.onFoot);
    let nearestPolice = Infinity;
    for (const car of world.state.cars) {
      if (!car.active || car.kind !== 'police') continue;
      nearestPolice = Math.min(nearestPolice, Math.hypot(car.x - world.state.player.x, car.y - world.state.player.y));
    }
    audio.siren(world.state.wanted > 0 ? nearestPolice : Infinity);
    renderer.draw(world.state, screen, ui);
  }

  // Leaving the tab pauses a running game and saves, rather than letting the city run unseen.
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && screen === SCREEN_PLAY) {
      screen = SCREEN_PAUSED;
      doSave();
      announce('Paused. Progress saved.');
    }
  });

  announce('Solmar Heat. Press Enter or click to start.');
  requestAnimationFrame(frame);
}

if (shot) runShot(shot);
else runGame();
