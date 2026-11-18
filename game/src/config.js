// Solmar Heat: every tuning number, colour and layout constant in one place.
// The world is a fixed 3200x2400 city; the renderer shows a 1280x720 window of it through a
// camera that follows the player. No rule below depends on the screen size.

export const WORLD = { width: 3200, height: 2400 };

/** The camera's logical viewport, in world units. */
export const VIEW = { width: 1280, height: 720 };

/** The simulation's fixed step, in seconds: 60 updates a second whatever the display's rate. */
export const STEP = 1 / 60;

/** Street centrelines. Vertical streets run the full height, horizontal ones the full width. */
export const STREET_X = [400, 1200, 2000, 2800];
export const STREET_Y = [400, 1200, 1900];
/** Half the asphalt width, and half the width out to the sidewalk's outer edge. */
export const ROAD_HALF = 62;
export const WALK_HALF = 90;

/** The beach: sand is walkable (slow), water is blocked. */
export const SAND_TOP = 2160;
export const WATER_TOP = 2320;

/** The park block, between the 1200 and 2000 streets, rows 400-1200: no buildings, just trees. */
export const PARK = { x: 1290, y: 490, width: 620, height: 620 };

export const PLAYER = {
  radius: 14,
  walk: 205,
  run: 330,
  /** Speed multiplier on sand. */
  sand: 0.55,
  /** Seconds of invulnerability after taking a hit. */
  invulnerable: 1.2,
};

export const CAR = {
  length: 66,
  width: 32,
  /** Collision circle radius at the car's centre. */
  radius: 26,
  accel: 430,
  brake: 780,
  maxSpeed: 540,
  maxReverse: 190,
  /** Steering, radians per second at full lock and full speed. */
  turnRate: 2.9,
  /** How fast speed bleeds off with no input. */
  drag: 0.55,
  /** Handbrake deceleration. */
  handbrake: 1100,
};

export const TRAFFIC = { count: 10, cruiseMin: 190, cruiseMax: 245, radius: 26 };
export const PEDESTRIAN = { count: 14, speedMin: 45, speedMax: 78, radius: 11 };
export const POLICE = { max: 4, cruise: 460, ramDamage: 14, ramCooldown: 1.0 };

export const WANTED = {
  max: 5,
  /** Seconds with no crime and no police nearby before one star fades. */
  decaySeconds: 14,
  /** How close police must be to keep the heat from cooling off. */
  nearPolice: 560,
};

export const HEALTH = { max: 100, regenPerSecond: 2 };

/** One mission chain, three objectives: pickup, deliver, escape. Markers sit on streets and in the park. */
export const MISSION = {
  pickup: { x: 2880, y: 2240, text: 'Pick up the package at Marina Docks' },
  deliver: { x: 2400, y: 1900, text: 'Deliver the package to the Sunset Motel' },
  escape: { x: 1600, y: 800, text: 'Lose the heat — reach the Safehouse in the park' },
  reward: 500,
};

export const CASH = { start: 120, pedDropMin: 10, pedDropMax: 30, pickupLife: 20 };

/** Game clock: starts 10:00, one game minute per real second. */
export const CLOCK = { startMinutes: 10 * 60, minutesPerSecond: 1 };

export const PALETTE = {
  backdrop: '#0e1420',
  grass: '#8fce6e',
  grassDark: '#7cbd5e',
  sand: '#f2d8a0',
  water: '#2fa8c9',
  waterDeep: '#1e86ad',
  road: '#3d4450',
  roadEdge: '#333947',
  roadLine: '#f5d76e',
  sidewalk: '#c9ced2',
  park: '#5da24a',
  pond: '#3fa7c4',
  building: ['#e8836b', '#f2b04e', '#6fb7d6', '#e86a92', '#9b7ede', '#5ec4a7', '#f27d5c', '#d96a4f'],
  roof: '#f7f3e8',
  window: '#2b3a4a',
  player: '#ffcf3f',
  playerDark: '#d9a400',
  police: '#1c2733',
  policeLight: '#ff3b30',
  policeLight2: '#2f7bff',
  traffic: ['#c94f4f', '#4f7ec9', '#c9a44f', '#6a4fc9', '#4fc98a', '#c96a9b', '#8a8f96'],
  ped: ['#e86a92', '#4f7ec9', '#f2b04e', '#6a4fc9', '#5ec4a7', '#c94f4f'],
  cash: '#37d67a',
  marker: '#ffd23f',
  text: '#f4f6f8',
  muted: '#aab2bd',
  panel: '#161d29',
  panelEdge: '#2b3547',
  danger: '#ff5a4e',
  health: '#43d17c',
  star: '#ffd23f',
};

export const FONT = 'system-ui, -apple-system, "Segoe UI", sans-serif';

/** Where the save (cash, mission, position, health) is kept between visits (this browser only). */
export const SAVE_KEY = 'solmar-heat.save.v1';
/** Best cash earned in one visit. */
export const BEST_KEY = 'solmar-heat.best-cash';
