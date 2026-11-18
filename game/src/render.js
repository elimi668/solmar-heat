// Drawing only: the world's state and the current screen in, pixels out. The camera shows a
// 1280x720 window of Solmar City, scaled to fit the browser window; the HUD is drawn in screen
// space on top. Flat shapes, warm sun-soaked colours, canvas text for the HUD and the panels.
import {
  FONT, PALETTE, PARK, ROAD_HALF, SAND_TOP, STREET_X, STREET_Y, VIEW, WALK_HALF, WATER_TOP, WORLD,
} from './config.js';

export const SCREEN_TITLE = 'title';
export const SCREEN_PLAY = 'play';
export const SCREEN_PAUSED = 'paused';
export const SCREEN_OVER = 'over';

const PANEL = { width: 640, top: 150, line: 32, bottom: 64 };
const MINIMAP = { width: 200, height: 150, margin: 16 };

function starPath(context, x, y, radius) {
  context.beginPath();
  for (let i = 0; i < 10; i += 1) {
    const r = i % 2 === 0 ? radius : radius * 0.45;
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const px = x + Math.cos(a) * r;
    const py = y + Math.sin(a) * r;
    if (i === 0) context.moveTo(px, py);
    else context.lineTo(px, py);
  }
  context.closePath();
}

export function createRenderer(canvas) {
  const context = canvas.getContext('2d');
  const view = { scale: 1, halfW: VIEW.width / 2, halfH: VIEW.height / 2 };

  function resize() {
    const ratio = window.devicePixelRatio || 1;
    canvas.width = Math.round(window.innerWidth * ratio);
    canvas.height = Math.round(window.innerHeight * ratio);
    view.scale = Math.min(canvas.width / VIEW.width, canvas.height / VIEW.height);
    view.halfW = canvas.width / view.scale / 2;
    view.halfH = canvas.height / view.scale / 2;
  }

  const fonts = new Map();
  function text(value, x, y, size, color, align, baseline) {
    if (!fonts.has(size)) fonts.set(size, `${size}px ${FONT}`);
    context.font = fonts.get(size);
    context.fillStyle = color;
    context.textAlign = align || 'left';
    context.textBaseline = baseline || 'alphabetic';
    context.fillText(value, x, y);
  }

  function roundRectPath(x, y, width, height, radius) {
    const r = Math.min(radius, width / 2, height / 2);
    context.beginPath();
    context.moveTo(x + r, y);
    context.arcTo(x + width, y, x + width, y + height, r);
    context.arcTo(x + width, y + height, x, y + height, r);
    context.arcTo(x, y + height, x, y, r);
    context.arcTo(x, y, x + width, y, r);
    context.closePath();
  }

  function drawGround(state) {
    context.fillStyle = PALETTE.grass;
    context.fillRect(0, 0, WORLD.width, WORLD.height);
    // Mow stripes on the grass, for a sun-soaked park-city feel.
    context.fillStyle = PALETTE.grassDark;
    for (let y = 0; y < WORLD.height; y += 160) context.fillRect(0, y, WORLD.width, 80);
    // Beach and water along the south edge.
    context.fillStyle = PALETTE.sand;
    context.fillRect(0, SAND_TOP, WORLD.width, WATER_TOP - SAND_TOP);
    context.fillStyle = PALETTE.water;
    context.fillRect(0, WATER_TOP, WORLD.width, WORLD.height - WATER_TOP);
    context.fillStyle = PALETTE.waterDeep;
    for (let x = 40; x < WORLD.width; x += 260) {
      context.fillRect(x, WATER_TOP + 18, 120, 5);
      context.fillRect(x + 90, WATER_TOP + 44, 90, 5);
    }
    // Roads: asphalt bands with sidewalks, then dashed centre lines.
    for (const x of STREET_X) {
      context.fillStyle = PALETTE.sidewalk;
      context.fillRect(x - WALK_HALF, 0, WALK_HALF * 2, WORLD.height);
      context.fillStyle = PALETTE.road;
      context.fillRect(x - ROAD_HALF, 0, ROAD_HALF * 2, WORLD.height);
    }
    for (const y of STREET_Y) {
      context.fillStyle = PALETTE.sidewalk;
      context.fillRect(0, y - WALK_HALF, WORLD.width, WALK_HALF * 2);
      context.fillStyle = PALETTE.road;
      context.fillRect(0, y - ROAD_HALF, WORLD.width, ROAD_HALF * 2);
    }
    context.fillStyle = PALETTE.roadLine;
    for (const x of STREET_X) {
      for (let y = 0; y < WORLD.height; y += 72) context.fillRect(x - 3, y, 6, 36);
    }
    for (const y of STREET_Y) {
      for (let x = 0; x < WORLD.width; x += 72) context.fillRect(x, y - 3, 36, 6);
    }
    // The park: lawn, pond and paths.
    context.fillStyle = PALETTE.park;
    context.fillRect(PARK.x, PARK.y, PARK.width, PARK.height);
    context.fillStyle = PALETTE.pond;
    context.beginPath();
    context.ellipse(PARK.x + PARK.width * 0.68, PARK.y + PARK.height * 0.62, 90, 58, 0, 0, Math.PI * 2);
    context.fill();
    context.fillStyle = PALETTE.sidewalk;
    context.fillRect(PARK.x + PARK.width / 2 - 14, PARK.y, 28, PARK.height);
    context.fillRect(PARK.x, PARK.y + PARK.height / 2 - 14, PARK.width, 28);
  }

  function drawBuildings(state) {
    for (const b of state.buildings) {
      context.fillStyle = 'rgba(0,0,0,0.18)';
      context.fillRect(b.x + 8, b.y + 10, b.width, b.height);
      context.fillStyle = b.color;
      context.fillRect(b.x, b.y, b.width, b.height);
      context.fillStyle = PALETTE.roof;
      context.fillRect(b.x + 8, b.y + 8, b.width - 16, b.height - 16);
      context.fillStyle = PALETTE.window;
      const cols = Math.max(1, Math.floor((b.width - 24) / 34));
      const rows = Math.max(1, Math.floor((b.height - 24) / 34));
      for (let c = 0; c < cols; c += 1) {
        for (let r = 0; r < rows; r += 1) {
          context.fillRect(b.x + 16 + c * 34, b.y + 16 + r * 34, 16, 16);
        }
      }
      if (b.hotel) {
        context.fillStyle = PALETTE.marker;
        context.fillRect(b.x + b.width / 2 - 26, b.y - 16, 52, 14);
      }
    }
    for (const tree of state.trees) {
      context.fillStyle = '#3f7d33';
      context.beginPath();
      context.arc(tree.x, tree.y, tree.park ? 16 : 12, 0, Math.PI * 2);
      context.fill();
      context.fillStyle = '#57a047';
      context.beginPath();
      context.arc(tree.x - 4, tree.y - 4, tree.park ? 10 : 7, 0, Math.PI * 2);
      context.fill();
    }
  }

  function drawMarker(state) {
    if (state.mission.done) return;
    const marker = state.mission.marker;
    const pulse = 1 + 0.18 * Math.sin(state.time * 5);
    context.save();
    context.translate(marker.x, marker.y);
    context.fillStyle = 'rgba(255,210,63,0.25)';
    context.beginPath();
    context.arc(0, 0, 46 * pulse, 0, Math.PI * 2);
    context.fill();
    context.rotate(Math.PI / 4);
    context.fillStyle = PALETTE.marker;
    context.fillRect(-13, -13, 26, 26);
    context.fillStyle = '#7a5b00';
    context.fillRect(-7, -7, 14, 14);
    context.restore();
    // A light pillar so the marker reads from across the city.
    context.fillStyle = 'rgba(255,210,63,0.18)';
    context.fillRect(marker.x - 8, marker.y - 260, 16, 260);
  }

  function drawSkidsAndParticles(state) {
    for (const skid of state.skids) {
      context.strokeStyle = `rgba(20,20,24,${Math.max(0, skid.life / skid.max)})`;
      context.lineWidth = 5;
      context.beginPath();
      context.moveTo(skid.x1, skid.y1);
      context.lineTo(skid.x2, skid.y2);
      context.stroke();
    }
    for (const p of state.particles) {
      context.fillStyle = p.color;
      context.globalAlpha = Math.max(0, p.life / p.max);
      context.beginPath();
      context.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      context.fill();
    }
    context.globalAlpha = 1;
  }

  function drawCar(car, isPlayer) {
    context.save();
    context.translate(car.x, car.y);
    context.rotate(car.angle);
    context.fillStyle = 'rgba(0,0,0,0.25)';
    roundRectPath(-30, -12, 66, 32, 10);
    context.fill();
    context.fillStyle = car.color;
    roundRectPath(-33, -16, 66, 32, 10);
    context.fill();
    context.fillStyle = '#202a36';
    roundRectPath(-8, -13, 20, 26, 5);
    context.fill();
    context.fillStyle = '#ffe9a8';
    context.fillRect(30, -13, 4, 8);
    context.fillRect(30, 5, 4, 8);
    context.fillStyle = '#ff5a4e';
    context.fillRect(-33, -13, 4, 8);
    context.fillRect(-33, 5, 4, 8);
    if (car.kind === 'police') {
      const flash = Math.floor(stateTime(car) * 8) % 2 === 0;
      context.fillStyle = flash ? PALETTE.policeLight : PALETTE.policeLight2;
      context.fillRect(-6, -14, 12, 6);
      context.fillStyle = flash ? PALETTE.policeLight2 : PALETTE.policeLight;
      context.fillRect(-6, 8, 12, 6);
      context.fillStyle = '#f4f6f8';
      text('PD', 0, 5, 13, '#f4f6f8', 'center', 'middle');
    }
    context.restore();
    if (isPlayer) {
      context.fillStyle = PALETTE.marker;
      context.beginPath();
      context.arc(car.x, car.y - 34, 5, 0, Math.PI * 2);
      context.fill();
    }
  }

  // The police light bar flashes on the world's clock, not the car's own time.
  function stateTime(car) {
    return car._t || 0;
  }

  function drawPed(ped) {
    context.save();
    context.translate(ped.x, ped.y);
    if (ped.down > 0) {
      context.rotate(Math.PI / 2);
      context.globalAlpha = 0.75;
    }
    context.fillStyle = ped.color;
    context.beginPath();
    context.arc(0, 0, PEDESTRIAN_RADIUS, 0, Math.PI * 2);
    context.fill();
    context.fillStyle = '#f2c9a0';
    context.beginPath();
    context.arc(0, -2, 5, 0, Math.PI * 2);
    context.fill();
    context.restore();
    context.globalAlpha = 1;
  }

  const PEDESTRIAN_RADIUS = 11;

  function drawPlayer(state) {
    const player = state.player;
    if (!player.onFoot) return;
    const blink = player.invulnerable > 0 && Math.floor(player.invulnerable * 10) % 2 === 0;
    if (blink) return;
    context.save();
    context.translate(player.x, player.y);
    context.fillStyle = 'rgba(0,0,0,0.25)';
    context.beginPath();
    context.ellipse(0, 10, 13, 6, 0, 0, Math.PI * 2);
    context.fill();
    context.rotate(player.angle);
    context.fillStyle = PALETTE.player;
    context.beginPath();
    context.arc(0, 0, player.radius, 0, Math.PI * 2);
    context.fill();
    context.fillStyle = PALETTE.playerDark;
    context.fillRect(6, -6, 12, 12);
    context.fillStyle = '#202a36';
    context.beginPath();
    context.arc(4, 0, 4, 0, Math.PI * 2);
    context.fill();
    context.restore();
    // Punch arc, while the fist is out.
    if (player.punchCooldown > 0.25) {
      context.save();
      context.translate(player.x, player.y);
      context.rotate(player.angle);
      context.strokeStyle = 'rgba(255,207,63,0.9)';
      context.lineWidth = 6;
      context.beginPath();
      context.arc(0, 0, 34, -0.7, 0.7);
      context.stroke();
      context.restore();
    }
  }

  function drawWorld(state) {
    drawGround(state);
    drawBuildings(state);
    drawMarker(state);
    for (const pickup of state.pickups) {
      context.fillStyle = PALETTE.cash;
      context.beginPath();
      context.arc(pickup.x, pickup.y, 9, 0, Math.PI * 2);
      context.fill();
      text('$', pickup.x, pickup.y + 5, 13, '#083d1e', 'center', 'middle');
    }
    drawSkidsAndParticles(state);
    for (const car of state.cars) {
      if (!car.active) continue;
      drawCar(car, state.player.car === car);
    }
    for (const ped of state.peds) drawPed(ped);
    drawPlayer(state);
  }

  function drawMinimap(state) {
    const mx = VIEW.width - MINIMAP.width - MINIMAP.margin;
    const my = MINIMAP.margin;
    const sx = MINIMAP.width / WORLD.width;
    const sy = MINIMAP.height / WORLD.height;
    context.fillStyle = 'rgba(14,20,32,0.82)';
    context.fillRect(mx - 4, my - 4, MINIMAP.width + 8, MINIMAP.height + 8);
    context.fillStyle = '#20303f';
    context.fillRect(mx, my, MINIMAP.width, MINIMAP.height);
    context.fillStyle = '#2fa8c9';
    context.fillRect(mx, my + (WATER_TOP * sy), MINIMAP.width, MINIMAP.height - WATER_TOP * sy);
    context.fillStyle = '#5da24a';
    context.fillRect(mx + PARK.x * sx, my + PARK.y * sy, PARK.width * sx, PARK.height * sy);
    context.strokeStyle = '#8b93a3';
    context.lineWidth = 2;
    for (const x of STREET_X) {
      context.beginPath();
      context.moveTo(mx + x * sx, my);
      context.lineTo(mx + x * sx, my + MINIMAP.height);
      context.stroke();
    }
    for (const y of STREET_Y) {
      context.beginPath();
      context.moveTo(mx, my + y * sy);
      context.lineTo(mx + MINIMAP.width, my + y * sy);
      context.stroke();
    }
    for (const car of state.cars) {
      if (!car.active || car.kind === 'parked') continue;
      context.fillStyle = car.kind === 'police' ? '#ff5a4e' : '#f4f6f8';
      context.fillRect(mx + car.x * sx - 2, my + car.y * sy - 2, 4, 4);
    }
    if (!state.mission.done) {
      context.fillStyle = PALETTE.marker;
      context.save();
      context.translate(mx + state.mission.marker.x * sx, my + state.mission.marker.y * sy);
      context.rotate(Math.PI / 4);
      context.fillRect(-4, -4, 8, 8);
      context.restore();
    }
    const px = mx + state.player.x * sx;
    const py = my + state.player.y * sy;
    context.fillStyle = PALETTE.player;
    context.beginPath();
    context.arc(px, py, 5, 0, Math.PI * 2);
    context.fill();
    context.strokeStyle = '#0e1420';
    context.lineWidth = 1;
    context.stroke();
  }

  function drawHud(state, ui) {
    context.setTransform(1, 0, 0, 1, 0, 0);
    const scale = Math.min(canvas.width / VIEW.width, canvas.height / VIEW.height);
    context.setTransform(scale, 0, 0, scale, (canvas.width - VIEW.width * scale) / 2, (canvas.height - VIEW.height * scale) / 2);
    context.textBaseline = 'top';
    // Cash and the mission objective, top left, on a dark pill so they read over light roofs.
    context.fillStyle = 'rgba(14,20,32,0.7)';
    context.fillRect(12, 10, 480, 72);
    text(`$${state.cash}`, 20, 16, 30, PALETTE.text, 'left', 'top');
    text(state.mission.done ? 'Free roam — explore Solmar City' : state.mission.text, 20, 52, 19, PALETTE.marker, 'left', 'top');
    // Clock, top centre, on a dark pill so it reads over light roofs.
    const hours = Math.floor(state.clockMinutes / 60) % 24;
    const minutes = Math.floor(state.clockMinutes % 60);
    const clockText = `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
    context.fillStyle = 'rgba(14,20,32,0.7)';
    context.fillRect(VIEW.width / 2 - 52, 10, 104, 36);
    text(clockText, VIEW.width / 2, 16, 26, PALETTE.text, 'center', 'top');
    // Minimap and wanted stars, top right.
    drawMinimap(state);
    const starY = MINIMAP.margin + MINIMAP.height + 26;
    for (let i = 0; i < 5; i += 1) {
      const x = VIEW.width - MINIMAP.margin - 14 - i * 30;
      starPath(context, x, starY, 13);
      context.fillStyle = i < state.wanted ? PALETTE.star : 'rgba(244,246,248,0.25)';
      context.fill();
    }
    // Health, bottom left, on a dark pill so it reads over sand and water.
    context.fillStyle = 'rgba(14,20,32,0.7)';
    context.fillRect(12, VIEW.height - 60, 236, 48);
    text('HEALTH', 20, VIEW.height - 52, 16, PALETTE.muted, 'left', 'top');
    context.fillStyle = 'rgba(14,20,32,0.7)';
    context.fillRect(20, VIEW.height - 30, 220, 16);
    context.fillStyle = state.player.health > 30 ? PALETTE.health : PALETTE.danger;
    context.fillRect(20, VIEW.height - 30, 220 * (state.player.health / 100), 16);
    // Speed, bottom right, while driving, on a dark pill so it reads over light roofs.
    if (!state.player.onFoot && state.player.car) {
      const mph = Math.round(Math.abs(state.player.car.speed) * 0.12);
      context.fillStyle = 'rgba(14,20,32,0.7)';
      context.fillRect(VIEW.width - 140, VIEW.height - 62, 128, 42);
      text(`${mph} mph`, VIEW.width - 20, VIEW.height - 56, 30, PALETTE.text, 'right', 'top');
    }
    // Mission banner, centre.
    if (state.mission.banner > 0) {
      context.fillStyle = 'rgba(14,20,32,0.8)';
      const bw = 560;
      context.fillRect((VIEW.width - bw) / 2, 110, bw, 64);
      text(state.mission.bannerText, VIEW.width / 2, 130, 30, PALETTE.marker, 'center', 'top');
    }
    // Save flash.
    if (ui.saveFlash > 0) {
      context.globalAlpha = Math.min(1, ui.saveFlash);
      text('Saved ✓', VIEW.width / 2, VIEW.height - 40, 18, PALETTE.cash, 'center', 'top');
      context.globalAlpha = 1;
    }
    if (ui.muted) text('Muted (M)', 20, VIEW.height - 84, 16, PALETTE.muted, 'left', 'top');
  }

  function drawPanel(title, lines, prompt) {
    const height = PANEL.top + lines.length * PANEL.line + PANEL.bottom;
    const x = (VIEW.width - PANEL.width) / 2;
    const y = (VIEW.height - height) / 2;
    context.fillStyle = PALETTE.panel;
    context.fillRect(x, y, PANEL.width, height);
    context.strokeStyle = PALETTE.panelEdge;
    context.lineWidth = 2;
    context.strokeRect(x, y, PANEL.width, height);
    context.textBaseline = 'alphabetic';
    text(title, VIEW.width / 2, y + 78, 46, PALETTE.text, 'center');
    for (let index = 0; index < lines.length; index += 1) {
      text(lines[index], VIEW.width / 2, y + PANEL.top + index * PANEL.line, 21, PALETTE.muted, 'center');
    }
    text(prompt, VIEW.width / 2, y + height - 36, 23, PALETTE.marker, 'center');
  }

  const TITLE_LINES = [
    'Solmar City, 10:00 AM. The sun is up, the streets are full,',
    'and one package needs a driver who asks no questions.',
    'Steal a car, lose the heat, get paid.',
    '',
    'Move WASD / arrows · Run Shift · Enter car E · Punch F',
    'Handbrake Space · Pause P · Mute M',
  ];
  const PAUSED_LINES = ['The city waits for you.'];
  const OVER_LINES = ['', ''];

  /** Paint one frame: the world through the camera, then the HUD or a panel for the screen. */
  function draw(state, screen, ui) {
    context.setTransform(1, 0, 0, 1, 0, 0);
    context.fillStyle = PALETTE.backdrop;
    context.fillRect(0, 0, canvas.width, canvas.height);
    const scale = Math.min(canvas.width / VIEW.width, canvas.height / VIEW.height);
    const halfW = canvas.width / scale / 2;
    const halfH = canvas.height / scale / 2;
    const camX = Math.max(halfW, Math.min(WORLD.width - halfW, state.camera.x));
    const camY = Math.max(halfH, Math.min(WORLD.height - halfH, state.camera.y));
    // Screen shake: a hard crash jolts the camera for a moment.
    const shakeX = state.shake > 0 ? (Math.random() - 0.5) * state.shake * 16 : 0;
    const shakeY = state.shake > 0 ? (Math.random() - 0.5) * state.shake * 16 : 0;
    context.setTransform(scale, 0, 0, scale, canvas.width / 2 - (camX + shakeX) * scale, canvas.height / 2 - (camY + shakeY) * scale);
    // The police light bar flashes on the world clock: stamp it on the cars before drawing.
    for (const car of state.cars) car._t = state.time;
    drawWorld(state);
    if (screen === SCREEN_TITLE) {
      context.setTransform(1, 0, 0, 1, 0, 0);
      const s = Math.min(canvas.width / VIEW.width, canvas.height / VIEW.height);
      context.setTransform(s, 0, 0, s, (canvas.width - VIEW.width * s) / 2, (canvas.height - VIEW.height * s) / 2);
      TITLE_LINES[3] = ui.hasSave ? `Continue: $${ui.saveCash} · ${ui.saveMission}` : '';
      drawPanel('SOLMAR HEAT', TITLE_LINES, ui.hasSave ? 'Enter: continue · N: new game' : 'Press Enter or click to start');
      return;
    }
    drawHud(state, ui);
    if (screen === SCREEN_PAUSED) {
      context.setTransform(1, 0, 0, 1, 0, 0);
      const s = Math.min(canvas.width / VIEW.width, canvas.height / VIEW.height);
      context.setTransform(s, 0, 0, s, (canvas.width - VIEW.width * s) / 2, (canvas.height - VIEW.height * s) / 2);
      drawPanel('Paused', PAUSED_LINES, 'Press P to resume');
    } else if (screen === SCREEN_OVER) {
      context.setTransform(1, 0, 0, 1, 0, 0);
      const s = Math.min(canvas.width / VIEW.width, canvas.height / VIEW.height);
      context.setTransform(s, 0, 0, s, (canvas.width - VIEW.width * s) / 2, (canvas.height - VIEW.height * s) / 2);
      OVER_LINES[0] = ui.overTitle || 'BUSTED';
      OVER_LINES[1] = `Cash $${state.cash} · Best $${ui.best}`;
      drawPanel(ui.overTitle || 'BUSTED', OVER_LINES, 'Press Enter or click to play again');
    }
  }

  resize();
  window.addEventListener('resize', resize);
  return { draw };
}
