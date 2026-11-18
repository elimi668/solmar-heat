// Save and load through localStorage: cash, the mission stage, the player's position and health,
// the wanted level and the clock. A save is only a few numbers; cars, traffic and pedestrians
// are respawned fresh on load, so a save never goes stale.

import { SAVE_KEY } from './config.js';

export function readSave() {
  try {
    const raw = window.localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const save = JSON.parse(raw);
    if (typeof save.cash !== 'number' || typeof save.x !== 'number' || typeof save.y !== 'number') return null;
    return save;
  } catch {
    return null;
  }
}

export function writeSave(world) {
  try {
    const player = world.state.player;
    const mission = world.state.mission;
    window.localStorage.setItem(SAVE_KEY, JSON.stringify({
      cash: world.state.cash,
      missionStage: mission.done ? 0 : mission.stage,
      x: player.x,
      y: player.y,
      health: player.health,
      wanted: world.state.wanted,
      clockMinutes: world.state.clockMinutes,
    }));
    return true;
  } catch {
    return false;
  }
}

export function clearSave() {
  try {
    window.localStorage.removeItem(SAVE_KEY);
  } catch {
    // Storage can be off: the save then lasts this visit only.
  }
}

/** Human-readable one-liner for the title screen's Continue line. */
export function describeSave(save) {
  if (!save) return '';
  const stage = save.missionStage === 0 ? 'mission done' : `mission ${save.missionStage}/3`;
  return `$${save.cash} · ${stage}`;
}
