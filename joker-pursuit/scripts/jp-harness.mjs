#!/usr/bin/env node

import fs from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';
import { chromium } from 'playwright';

const ROOT_DIR = process.cwd();
const DEFAULT_CLIENT_URL = 'http://127.0.0.1:3100';
const DEFAULT_SERVER_URL = 'http://127.0.0.1:8080';
const DEFAULT_TIMEOUT_MS = 18_000;

const RANK_MAP = {
  a: 'ace',
  ace: 'ace',
  '2': '2',
  '3': '3',
  '4': '4',
  '5': '5',
  '6': '6',
  '7': '7',
  '8': '8',
  '9': '9',
  '10': '10',
  j: 'jack',
  jack: 'jack',
  q: 'queen',
  queen: 'queen',
  k: 'king',
  king: 'king',
  joker: 'joker'
};

const SUIT_MAP = {
  h: 'hearts',
  heart: 'hearts',
  hearts: 'hearts',
  d: 'diamonds',
  diamond: 'diamonds',
  diamonds: 'diamonds',
  c: 'clubs',
  club: 'clubs',
  clubs: 'clubs',
  s: 'spades',
  spade: 'spades',
  spades: 'spades',
  none: 'none'
};

const BUILTIN_SCENARIOS = [
  {
    id: 'offline-smoke-regular-two',
    mode: 'offline',
    name: 'Offline smoke: regular 2-card move',
    setup: {
      currentPlayer: 'player-1',
      resetToHome: true,
      hands: {
        'player-1': ['2h', '3h', '4h', '5h', '6h'],
        'player-2': ['2c', '3c', '4c', '5c', '6c']
      },
      placements: {
        'player-1:1': 'section1_9'
      }
    },
    steps: [
      { action: 'clickCard', rank: '2' },
      { action: 'clickPeg', peg: 'player-1:1' }
    ],
    expect: [
      { type: 'pegAt', peg: 'player-1:1', space: 'section1_11' },
      { type: 'currentPlayer', player: 'player-2' }
    ]
  },
  {
    id: 'offline-seven-split-two-pegs',
    mode: 'offline',
    name: 'Offline 7 split enforces second-peg selection',
    setup: {
      currentPlayer: 'player-1',
      resetToHome: true,
      hands: {
        'player-1': ['7h', '2h', '3h', '4h', '5h'],
        'player-2': ['2c', '3c', '4c', '5c', '6c']
      },
      placements: {
        'player-1:1': 'section1_9',
        'player-1:2': 'section1_13',
        'player-2:1': 'section2_9'
      }
    },
    steps: [
      { action: 'clickCard', rank: '7' },
      { action: 'clickTestId', id: 'seven-option-split' },
      { action: 'clickTestId', id: 'seven-step-3' },
      { action: 'clickPeg', peg: 'player-1:1' },
      { action: 'clickPeg', peg: 'player-1:1' },
      { action: 'waitForPromptIncludes', text: 'second part of the split' },
      { action: 'clickPeg', peg: 'player-1:2' }
    ],
    expect: [
      { type: 'pegAt', peg: 'player-1:1', space: 'section1_12' },
      { type: 'pegAt', peg: 'player-1:2', space: 'section1_17' },
      { type: 'currentPlayer', player: 'player-2' }
    ]
  },
  {
    id: 'offline-nine-split-forward',
    mode: 'offline',
    name: 'Offline 9 split forward-then-backward flow',
    setup: {
      currentPlayer: 'player-1',
      resetToHome: true,
      hands: {
        'player-1': ['9h', '2h', '3h', '4h', '5h'],
        'player-2': ['2c', '3c', '4c', '5c', '6c']
      },
      placements: {
        'player-1:1': 'section1_11',
        'player-1:2': 'section1_6'
      }
    },
    steps: [
      { action: 'clickCard', rank: '9' },
      { action: 'clickTestId', id: 'nine-option-split' },
      { action: 'clickTestId', id: 'nine-direction-forward' },
      { action: 'clickTestId', id: 'nine-step-4' },
      { action: 'clickPeg', peg: 'player-1:1' },
      { action: 'clickPeg', peg: 'player-1:2' }
    ],
    expect: [
      { type: 'pegAt', peg: 'player-1:1', space: 'section1_15' },
      { type: 'pegAt', peg: 'player-1:2', space: 'section1_1' },
      { type: 'currentPlayer', player: 'player-2' }
    ]
  },
  {
    id: 'offline-nine-split-backward',
    mode: 'offline',
    name: 'Offline 9 split backward-first flow',
    setup: {
      currentPlayer: 'player-1',
      resetToHome: true,
      hands: {
        'player-1': ['9s', '2h', '3h', '4h', '5h'],
        'player-2': ['2c', '3c', '4c', '5c', '6c']
      },
      placements: {
        'player-1:1': 'section1_16',
        'player-1:2': 'section1_5'
      }
    },
    steps: [
      { action: 'clickCard', rank: '9' },
      { action: 'clickTestId', id: 'nine-option-split' },
      { action: 'clickTestId', id: 'nine-direction-backward' },
      { action: 'clickTestId', id: 'nine-step-3' },
      { action: 'clickPeg', peg: 'player-1:1' },
      { action: 'clickPeg', peg: 'player-1:2' }
    ],
    expect: [
      { type: 'pegAt', peg: 'player-1:1', space: 'section1_13' },
      { type: 'pegAt', peg: 'player-1:2', space: 'section1_11' },
      { type: 'currentPlayer', player: 'player-2' }
    ]
  },
  {
    id: 'online-smoke-regular-two',
    mode: 'online',
    name: 'Online smoke: regular 2-card move syncs',
    setup: {
      currentPlayer: 'host',
      resetToHome: true,
      hands: {
        host: ['2h', '3h', '4h', '5h', '6h'],
        joiner: ['2c', '3c', '4c', '5c', '6c']
      },
      placements: {
        'host:1': 'section1_9'
      }
    },
    steps: [
      { action: 'clickCard', actor: 'host', rank: '2' },
      { action: 'clickPeg', actor: 'host', peg: 'host:1' },
      { action: 'sync', actor: 'joiner' }
    ],
    expect: [
      { type: 'pegAt', page: 'host', peg: 'host:1', space: 'section1_11' },
      { type: 'pegAt', page: 'joiner', peg: 'host:1', space: 'section1_11' },
      { type: 'currentPlayer', page: 'host', player: 'joiner' },
      { type: 'currentPlayer', page: 'joiner', player: 'joiner' }
    ]
  },
  {
    id: 'online-seven-regular-sync',
    mode: 'online',
    name: 'Online 7 regular move syncs host -> joiner',
    setup: {
      currentPlayer: 'host',
      resetToHome: true,
      hands: {
        host: ['7h', '2h', '3h', '4h', '5h'],
        joiner: ['2c', '3c', '4c', '5c', '6c']
      },
      placements: {
        'host:1': 'section1_9'
      }
    },
    steps: [
      { action: 'clickCard', actor: 'host', rank: '7' },
      { action: 'clickTestId', actor: 'host', id: 'seven-option-move' },
      { action: 'clickPeg', actor: 'host', peg: 'host:1' },
      { action: 'sync', actor: 'joiner' }
    ],
    expect: [
      { type: 'pegAt', page: 'host', peg: 'host:1', space: 'section1_16' },
      { type: 'pegAt', page: 'joiner', peg: 'host:1', space: 'section1_16' },
      { type: 'currentPlayer', page: 'host', player: 'joiner' },
      { type: 'currentPlayer', page: 'joiner', player: 'joiner' }
    ]
  },
  {
    id: 'online-nine-split-forward-sync',
    mode: 'online',
    name: 'Online 9 split flow syncs host -> joiner',
    setup: {
      currentPlayer: 'host',
      resetToHome: true,
      hands: {
        host: ['9h', '2h', '3h', '4h', '5h'],
        joiner: ['2c', '3c', '4c', '5c', '6c']
      },
      placements: {
        'host:1': 'section1_11',
        'host:2': 'section1_6'
      }
    },
    steps: [
      { action: 'clickCard', actor: 'host', rank: '9' },
      { action: 'clickTestId', actor: 'host', id: 'nine-option-split' },
      { action: 'clickTestId', actor: 'host', id: 'nine-direction-forward' },
      { action: 'clickTestId', actor: 'host', id: 'nine-step-4' },
      { action: 'clickPeg', actor: 'host', peg: 'host:1' },
      { action: 'clickPeg', actor: 'host', peg: 'host:2' },
      { action: 'sync', actor: 'joiner' }
    ],
    expect: [
      { type: 'pegAt', page: 'host', peg: 'host:1', space: 'section1_15' },
      { type: 'pegAt', page: 'host', peg: 'host:2', space: 'section1_1' },
      { type: 'pegAt', page: 'joiner', peg: 'host:1', space: 'section1_15' },
      { type: 'pegAt', page: 'joiner', peg: 'host:2', space: 'section1_1' },
      { type: 'currentPlayer', page: 'host', player: 'joiner' },
      { type: 'currentPlayer', page: 'joiner', player: 'joiner' }
    ]
  },
  {
    id: 'online-nine-no-second-move-skip',
    mode: 'online',
    name: 'Online 9 split handles no-valid-second-move via skip',
    setup: {
      currentPlayer: 'host',
      resetToHome: true,
      hands: {
        host: ['9s', '2h', '3h', '4h', '5h'],
        joiner: ['2c', '3c', '4c', '5c', '6c']
      },
      placements: {
        'host:1': 'section1_11',
        'host:2': 'section1_home_0',
        'host:3': 'section1_home_1',
        'host:4': 'section1_home_2',
        'host:5': 'section1_home_3'
      }
    },
    steps: [
      { action: 'clickCard', actor: 'host', rank: '9' },
      { action: 'clickTestId', actor: 'host', id: 'nine-option-split' },
      { action: 'clickTestId', actor: 'host', id: 'nine-direction-forward' },
      { action: 'clickTestId', actor: 'host', id: 'nine-step-4' },
      { action: 'clickPeg', actor: 'host', peg: 'host:1' },
      { action: 'clickTestId', actor: 'host', id: 'nine-skip-second-move' },
      { action: 'sync', actor: 'joiner' }
    ],
    expect: [
      { type: 'pegAt', page: 'host', peg: 'host:1', space: 'section1_15' },
      { type: 'pegAt', page: 'joiner', peg: 'host:1', space: 'section1_15' },
      { type: 'currentPlayer', page: 'host', player: 'joiner' },
      { type: 'currentPlayer', page: 'joiner', player: 'joiner' }
    ]
  },
  {
    id: 'offline-full-game-autoplay',
    mode: 'offline',
    name: 'Offline full lifecycle autoplay reaches game over',
    setup: {
      currentPlayer: 'player-1',
      resetToHome: true,
      hands: {
        'player-1': ['9h', '7h', 'ah', '2h', '3h'],
        'player-2': ['9c', '7c', 'ac', '2c', '3c']
      },
      placements: {
        'player-1:1': 'section1_9',
        'player-1:2': 'section1_12',
        'player-2:1': 'section2_9',
        'player-2:2': 'section2_12'
      }
    },
    steps: [
      { action: 'autoPlayUntilGameOver', maxTurns: 900 }
    ],
    expect: [
      { type: 'phaseIs', phase: 'gameOver' },
      { type: 'winnerExists' }
    ]
  },
  {
    id: 'online-full-game-autoplay',
    mode: 'online',
    name: 'Online full lifecycle autoplay syncs host/joiner to game over',
    setup: {
      currentPlayer: 'host',
      resetToHome: true,
      hands: {
        host: ['9h', '7h', 'ah', '2h', '3h'],
        joiner: ['9c', '7c', 'ac', '2c', '3c']
      },
      placements: {
        'host:1': 'section1_9',
        'host:2': 'section1_12',
        'joiner:1': 'section2_9',
        'joiner:2': 'section2_12'
      }
    },
    steps: [
      { action: 'autoPlayUntilGameOver', actor: 'auto', maxTurns: 1100 }
    ],
    expect: [
      { type: 'phaseIs', page: 'host', phase: 'gameOver' },
      { type: 'phaseIs', page: 'joiner', phase: 'gameOver' },
      { type: 'winnerExists', page: 'host' },
      { type: 'winnerExists', page: 'joiner' }
    ]
  }
];

function timestampLabel() {
  const now = new Date();
  const pad = (value) => String(value).padStart(2, '0');
  return `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
}

function log(message) {
  const time = new Date().toISOString().slice(11, 19);
  process.stdout.write(`[${time}] ${message}\n`);
}

function deepClone(value) {
  return JSON.parse(JSON.stringify(value));
}

function parseArgs(argv) {
  const parsed = {
    command: 'all',
    headed: false,
    skipStart: false,
    scenarioFile: null,
    clientUrl: DEFAULT_CLIENT_URL,
    serverUrl: DEFAULT_SERVER_URL
  };

  const positional = [];

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg.startsWith('--')) {
      if (arg === '--headed') {
        parsed.headed = true;
      } else if (arg === '--skip-start') {
        parsed.skipStart = true;
      } else if (arg === '--scenario-file') {
        parsed.scenarioFile = argv[i + 1] || null;
        i += 1;
      } else if (arg === '--client-url') {
        parsed.clientUrl = argv[i + 1] || parsed.clientUrl;
        i += 1;
      } else if (arg === '--server-url') {
        parsed.serverUrl = argv[i + 1] || parsed.serverUrl;
        i += 1;
      }
    } else {
      positional.push(arg);
    }
  }

  if (positional.length > 0) {
    parsed.command = positional[0];
  }

  return parsed;
}

async function waitForUrl(url, timeoutMs = 120_000) {
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    try {
      const response = await fetch(url);
      if (response.status < 500) {
        return;
      }
    } catch (_error) {
      // Keep polling.
    }

    await delay(750);
  }

  throw new Error(`Timed out waiting for ${url}`);
}

function startProcess(label, command, args, options = {}) {
  const child = spawn(command, args, {
    cwd: options.cwd || ROOT_DIR,
    env: {
      ...process.env,
      ...(options.env || {})
    },
    stdio: ['ignore', 'pipe', 'pipe']
  });

  child.stdout.on('data', chunk => {
    process.stdout.write(`[${label}] ${String(chunk)}`);
  });

  child.stderr.on('data', chunk => {
    process.stderr.write(`[${label}:err] ${String(chunk)}`);
  });

  return child;
}

async function stopProcess(child) {
  if (!child || child.killed) {
    return;
  }

  child.kill('SIGTERM');

  await Promise.race([
    new Promise(resolve => child.once('exit', resolve)),
    delay(5_000)
  ]);

  if (!child.killed) {
    child.kill('SIGKILL');
  }
}

async function waitForCondition(checkFn, timeoutMs = DEFAULT_TIMEOUT_MS, intervalMs = 150) {
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    const result = await checkFn();
    if (result) {
      return result;
    }
    await delay(intervalMs);
  }

  throw new Error('Timed out waiting for condition.');
}

function normalizeRankToken(rawRank) {
  if (!rawRank) {
    return 'joker';
  }

  const normalized = String(rawRank).trim().toLowerCase();
  return RANK_MAP[normalized] || 'joker';
}

function normalizeSuitToken(rawSuit, rank) {
  if (rank === 'joker') {
    return 'none';
  }

  if (!rawSuit) {
    return 'hearts';
  }

  const normalized = String(rawSuit).trim().toLowerCase();
  return SUIT_MAP[normalized] || 'hearts';
}

function parseCardSpec(spec, idPrefix) {
  if (typeof spec === 'object' && spec) {
    const rank = normalizeRankToken(spec.rank);
    const suit = normalizeSuitToken(spec.suit, rank);
    return {
      id: spec.id || `${idPrefix}-${rank}-${suit}`,
      rank,
      suit,
      value: spec.value ?? cardValue(rank),
      isFace: spec.isFace ?? isFace(rank)
    };
  }

  const token = String(spec).trim();
  if (token.toLowerCase() === 'joker') {
    return {
      id: `${idPrefix}-joker-none`,
      rank: 'joker',
      suit: 'none',
      value: 0,
      isFace: false
    };
  }

  const suffix = token.slice(-1).toLowerCase();
  const hasSuit = ['h', 'd', 'c', 's'].includes(suffix);
  const rankToken = hasSuit ? token.slice(0, -1) : token;
  const rank = normalizeRankToken(rankToken);
  const suit = normalizeSuitToken(hasSuit ? suffix : undefined, rank);

  return {
    id: `${idPrefix}-${rank}-${suit}`,
    rank,
    suit,
    value: cardValue(rank),
    isFace: isFace(rank)
  };
}

function cardValue(rank) {
  if (rank === 'ace') return 1;
  if (rank === 'joker') return 0;
  if (rank === 'jack' || rank === 'queen' || rank === 'king') return 10;
  return Number(rank);
}

function isFace(rank) {
  return rank === 'jack' || rank === 'queen' || rank === 'king';
}

function getAllSpaces(gameState) {
  if (!gameState?.board?.allSpaces) {
    return [];
  }

  if (Array.isArray(gameState.board.allSpaces)) {
    return gameState.board.allSpaces;
  }

  if (gameState.board.allSpaces instanceof Map) {
    return [...gameState.board.allSpaces.values()];
  }

  return Object.values(gameState.board.allSpaces);
}

function getSpaceById(gameState, spaceId) {
  if (!gameState?.board?.allSpaces) {
    return null;
  }

  if (gameState.board.allSpaces instanceof Map) {
    return gameState.board.allSpaces.get(spaceId) || null;
  }

  return gameState.board.allSpaces[spaceId] || null;
}

function clearPeg(gameState, pegId) {
  for (const space of getAllSpaces(gameState)) {
    space.pegs = (space.pegs || []).filter(existing => existing !== pegId);
  }
}

function resetPegsToHome(gameState) {
  const spaces = getAllSpaces(gameState);
  spaces.forEach(space => {
    space.pegs = [];
  });

  const sectionByPlayer = new Map();
  gameState.board.sections.forEach((section, index) => {
    (section.playerIds || []).forEach(playerId => {
      sectionByPlayer.set(playerId, section.index ?? index);
    });
  });

  gameState.players.forEach((player, playerIndex) => {
    const sectionIndex = sectionByPlayer.get(player.id) ?? playerIndex;
    const homeSpaces = spaces
      .filter(space => space.type === 'home' && space.sectionIndex === sectionIndex)
      .sort((left, right) => left.index - right.index);

    player.pegs.forEach((pegId, pegIndex) => {
      const homeSpace = homeSpaces[pegIndex] || homeSpaces[homeSpaces.length - 1];
      if (homeSpace) {
        homeSpace.pegs.push(pegId);
      }
    });
  });
}

function findPegLocation(gameState, pegId) {
  const space = getAllSpaces(gameState).find(candidate =>
    (candidate.pegs || []).includes(pegId)
  );

  return space?.id;
}

function resolvePlayerAlias(alias, gameState, roles) {
  if (!alias || alias === 'current') {
    return gameState.players[gameState.currentPlayerIndex]?.id;
  }

  if (alias === 'opponent') {
    const current = gameState.players[gameState.currentPlayerIndex]?.id;
    return gameState.players.find(player => player.id !== current)?.id;
  }

  if (alias === 'host' || alias === 'joiner') {
    return roles[alias];
  }

  const direct = gameState.players.find(player => player.id === alias);
  if (direct) {
    return direct.id;
  }

  const fallback = roles[alias];
  if (fallback) {
    return fallback;
  }

  throw new Error(`Unknown player alias: ${alias}`);
}

function resolvePegReference(reference, gameState, roles) {
  if (reference.includes('-peg-')) {
    return reference;
  }

  const [playerAlias, pegIndexToken] = reference.split(':');
  const playerId = resolvePlayerAlias(playerAlias, gameState, roles);
  const pegIndex = Number(pegIndexToken);

  if (!playerId || !Number.isFinite(pegIndex)) {
    throw new Error(`Invalid peg reference: ${reference}`);
  }

  return `${playerId}-peg-${pegIndex}`;
}

function applyScenarioSetup(state, scenario, roles) {
  const next = deepClone(state);
  const setup = scenario.setup || {};

  if (setup.resetToHome !== false) {
    resetPegsToHome(next);
  }

  if (setup.hands) {
    Object.entries(setup.hands).forEach(([playerAlias, cards]) => {
      const playerId = resolvePlayerAlias(playerAlias, next, roles);
      const player = next.players.find(entry => entry.id === playerId);
      if (!player) {
        throw new Error(`Cannot set hand for unknown player: ${playerAlias}`);
      }

      player.hand = cards.map((cardSpec, index) =>
        parseCardSpec(cardSpec, `${scenario.id}-${playerId}-${index}`)
      );
    });
  }

  if (setup.placements) {
    Object.entries(setup.placements).forEach(([pegRef, spaceId]) => {
      const pegId = resolvePegReference(pegRef, next, roles);
      const destination = getSpaceById(next, spaceId);
      if (!destination) {
        throw new Error(`Cannot place ${pegRef} on missing space ${spaceId}`);
      }

      clearPeg(next, pegId);
      destination.pegs.push(pegId);
    });
  }

  if (setup.currentPlayer) {
    const currentPlayerId = resolvePlayerAlias(setup.currentPlayer, next, roles);
    const nextIndex = next.players.findIndex(player => player.id === currentPlayerId);
    if (nextIndex < 0) {
      throw new Error(`Cannot set current player to ${setup.currentPlayer}`);
    }
    next.currentPlayerIndex = nextIndex;
  }

  next.id = `${next.id}-scenario-${scenario.id}-${Date.now()}`;
  next.moves = [];
  next.discardPile = [];

  return next;
}

async function getHarnessSnapshot(page) {
  const snapshot = await page.evaluate(() => {
    return window.__JP_HARNESS__?.getSnapshot() || null;
  });

  if (!snapshot) {
    throw new Error('Harness snapshot is unavailable.');
  }

  return snapshot;
}

async function invokeHarness(page, method, args = []) {
  const result = await page.evaluate(async ({ methodName, methodArgs }) => {
    const harness = window.__JP_HARNESS__;
    if (!harness) {
      return { ok: false, error: 'Harness bridge is unavailable.' };
    }

    const method = harness[methodName];
    if (typeof method !== 'function') {
      return { ok: false, error: `Harness method ${methodName} is unavailable.` };
    }

    const response = await method(...methodArgs);
    if (response === undefined) {
      return { ok: true };
    }

    return response;
  }, { methodName: method, methodArgs: args });

  if (!result?.ok) {
    throw new Error(result?.error || `Harness method ${method} failed.`);
  }

  return result;
}

async function waitForHarness(page) {
  await page.waitForFunction(() => Boolean(window.__JP_HARNESS__), { timeout: 30_000 });
}

async function ensureCardsVisible(page) {
  const revealButton = page.getByTestId('game-reveal-hand');
  if (await revealButton.count() > 0) {
    const visible = await revealButton.first().isVisible().catch(() => false);
    if (visible) {
      await revealButton.first().click();
    }
  }
}

async function bootstrapOffline(browser, clientUrl) {
  const context = await browser.newContext();
  const page = await context.newPage();

  await page.goto(clientUrl, { waitUntil: 'domcontentloaded' });
  await page.getByTestId('home-local-game').click();
  await page.getByTestId('setup-start-game').click();
  await page.getByTestId('game-shuffle-cards').click();
  await waitForHarness(page);
  await waitForCondition(async () => {
    try {
      const snapshot = await getHarnessSnapshot(page);
      return snapshot?.gameState?.phase === 'playing';
    } catch (_error) {
      return false;
    }
  }, 12_000, 180);

  return {
    mode: 'offline',
    context,
    page,
    roles: {
      host: 'player-1',
      joiner: 'player-2'
    }
  };
}

async function selectColor(page, preferredColors) {
  for (const color of preferredColors) {
    const locator = page.getByTestId(`multiplayer-color-${color}`);
    if ((await locator.count()) > 0) {
      const visible = await locator.first().isVisible().catch(() => false);
      if (visible) {
        await locator.first().click();
        return color;
      }
    }
  }

  throw new Error('No selectable multiplayer color button was found.');
}

async function bootstrapOnline(browser, clientUrl) {
  const hostName = 'HarnessHost';
  const joinerName = 'HarnessJoiner';

  const hostContext = await browser.newContext();
  const hostPage = await hostContext.newPage();

  await hostPage.goto(clientUrl, { waitUntil: 'domcontentloaded' });
  await hostPage.getByTestId('home-play-online').click();
  await hostPage.getByTestId('online-host-game').click();
  await hostPage.getByTestId('create-room-player-name').fill(hostName);
  await hostPage.getByTestId('create-room-submit').click();

  const roomCode = (await hostPage.getByTestId('create-room-code').innerText()).trim();

  const joinerContext = await browser.newContext();
  const joinerPage = await joinerContext.newPage();
  await joinerPage.goto(`${clientUrl}/?room=${encodeURIComponent(roomCode)}`, {
    waitUntil: 'domcontentloaded'
  });

  await joinerPage.getByTestId('join-room-player-name').fill(joinerName);
  await joinerPage.getByTestId('join-room-code-input').fill(roomCode);
  await joinerPage.getByTestId('join-room-submit').click();

  await hostPage.getByTestId('create-room-start-game').click();

  await hostPage.getByTestId('multiplayer-color-red').click();
  await selectColor(joinerPage, ['blue', 'green', 'yellow', 'pink', 'cyan', 'orange']);
  await hostPage.getByTestId('multiplayer-start-game').click();

  await waitForHarness(hostPage);
  await waitForHarness(joinerPage);

  const hostSnapshot = await getHarnessSnapshot(hostPage);
  const hostPlayer = hostSnapshot.gameState.players.find(player => player.name === hostName);
  const joinerPlayer = hostSnapshot.gameState.players.find(player => player.name === joinerName);

  if (!hostPlayer || !joinerPlayer) {
    throw new Error('Failed to resolve host/joiner player ids from multiplayer snapshot.');
  }

  return {
    mode: 'online',
    hostContext,
    joinerContext,
    hostPage,
    joinerPage,
    roomCode,
    roles: {
      host: hostPlayer.id,
      joiner: joinerPlayer.id
    }
  };
}

function choosePage(session, requestedPage) {
  if (session.mode === 'offline') {
    return session.page;
  }

  if (requestedPage === 'joiner') {
    return session.joinerPage;
  }

  return session.hostPage;
}

async function chooseAutoPlayPage(session, roles) {
  if (session.mode === 'offline') {
    return {
      page: session.page,
      actor: 'primary'
    };
  }

  const hostSnapshot = await getHarnessSnapshot(session.hostPage);
  const currentPlayerId = hostSnapshot.gameState.players[hostSnapshot.gameState.currentPlayerIndex]?.id;
  const actor = currentPlayerId === roles.joiner ? 'joiner' : 'host';
  return {
    page: actor === 'joiner' ? session.joinerPage : session.hostPage,
    actor
  };
}

async function executeStep(step, scenario, session, roles, runtimeNotes) {
  const actor = step.actor || (session.mode === 'online' ? 'host' : 'primary');
  const page = choosePage(session, actor === 'auto' ? 'host' : actor);

  switch (step.action) {
    case 'clickTestId': {
      await page.getByTestId(step.id).click({
        timeout: step.timeoutMs || DEFAULT_TIMEOUT_MS,
        force: true
      });
      break;
    }
    case 'clickCard': {
      await ensureCardsVisible(page);
      const rank = normalizeRankToken(step.rank);
      const suit = step.suit ? normalizeSuitToken(step.suit, rank) : null;
      const selector = suit
        ? `[data-card-rank="${rank}"][data-card-suit="${suit}"]`
        : `[data-card-rank="${rank}"]`;
      const locator = page.locator(selector);
      const count = await locator.count();

      if (count === 0) {
        const snapshot = await getHarnessSnapshot(page);
        const currentPlayer = snapshot.gameState.players[snapshot.gameState.currentPlayerIndex];
        const fallbackCard = (currentPlayer?.hand || []).find(card => {
          if (card.rank !== rank) {
            return false;
          }
          if (!suit) {
            return true;
          }
          return card.suit === suit;
        });

        if (!fallbackCard) {
          throw new Error(`Could not find card ${rank}${suit ? `/${suit}` : ''} in current hand.`);
        }

        await invokeHarness(page, 'selectCard', [fallbackCard.id]);
        runtimeNotes.push(
          `Card ${rank}${suit ? `/${suit}` : ''} was not clickable in UI; selected via harness fallback.`
        );
        break;
      }

      await locator.first().click({
        timeout: step.timeoutMs || DEFAULT_TIMEOUT_MS,
        force: true
      });
      break;
    }
    case 'clickPeg': {
      const snapshot = await getHarnessSnapshot(page);
      const pegId = resolvePegReference(step.peg, snapshot.gameState, roles);
      await invokeHarness(page, 'selectPeg', [pegId]);
      break;
    }
    case 'clickSpace': {
      await invokeHarness(page, 'selectSpace', [step.space]);
      break;
    }
    case 'sync': {
      await invokeHarness(page, 'syncToServer');
      break;
    }
    case 'autoPlaySingleTurn': {
      const target = actor === 'auto'
        ? await chooseAutoPlayPage(session, roles)
        : { page, actor };
      const result = await invokeHarness(target.page, 'autoPlaySingleTurn');
      const value = result?.value || {};
      runtimeNotes.push(
        `autoPlaySingleTurn actor=${target.actor} player=${value.playerId || 'unknown'} action=${value.action || 'unknown'} card=${value.cardId || '-'} peg=${value.pegId || '-'} destination=${value.destination || '-'}`
      );

      if (session.mode === 'online' && value.action === 'game_over') {
        const actorSnapshot = await getHarnessSnapshot(target.page);
        await invokeHarness(session.hostPage, 'commitGameStateToServer', [actorSnapshot.gameState]);
      }

      if (session.mode === 'online' && step.sync !== false) {
        await invokeHarness(session.hostPage, 'syncToServer');
        await invokeHarness(session.joinerPage, 'syncToServer');
      }
      break;
    }
    case 'autoPlayUntilGameOver': {
      const maxTurns = Number(step.maxTurns) || 600;
      let completed = false;

      for (let turn = 1; turn <= maxTurns; turn += 1) {
        const referencePage = session.mode === 'online' ? session.hostPage : page;
        const beforeSnapshot = await getHarnessSnapshot(referencePage);
        if (beforeSnapshot.gameState.phase === 'gameOver') {
          runtimeNotes.push(`autoPlayUntilGameOver: game already over before turn ${turn}.`);
          completed = true;
          break;
        }

        const target = actor === 'auto'
          ? await chooseAutoPlayPage(session, roles)
          : { page, actor };
        const result = await invokeHarness(target.page, 'autoPlaySingleTurn');
        const value = result?.value || {};
        runtimeNotes.push(
          `Auto turn ${turn}: actor=${target.actor} player=${value.playerId || 'unknown'} action=${value.action || 'unknown'} card=${value.cardId || '-'} peg=${value.pegId || '-'} destination=${value.destination || '-'}`
        );

        if (session.mode === 'online' && value.action === 'game_over') {
          const actorSnapshot = await getHarnessSnapshot(target.page);
          await invokeHarness(session.hostPage, 'commitGameStateToServer', [actorSnapshot.gameState]);
        }

        if (session.mode === 'online' && step.sync !== false) {
          await invokeHarness(session.hostPage, 'syncToServer');
          await invokeHarness(session.joinerPage, 'syncToServer');
        }

        if (value.action === 'game_over') {
          const verificationPage = session.mode === 'online' ? session.hostPage : target.page;
          await waitForCondition(async () => {
            const phaseSnapshot = await getHarnessSnapshot(verificationPage);
            return phaseSnapshot.gameState.phase === 'gameOver';
          }, step.timeoutMs || 12_000, 150);
        }

        const afterSnapshot = await getHarnessSnapshot(
          session.mode === 'online' ? session.hostPage : target.page
        );
        if (afterSnapshot.gameState.phase === 'gameOver') {
          if (session.mode === 'online' && step.sync !== false) {
            await invokeHarness(session.hostPage, 'syncToServer');
            await invokeHarness(session.joinerPage, 'syncToServer');
            await waitForCondition(async () => {
              const joinerSnapshot = await getHarnessSnapshot(session.joinerPage);
              return joinerSnapshot.gameState.phase === 'gameOver';
            }, step.timeoutMs || 12_000, 150);
          }

          runtimeNotes.push(`autoPlayUntilGameOver completed in ${turn} turns.`);
          completed = true;
          break;
        }

        if (step.delayMs) {
          await delay(step.delayMs);
        }
      }

      if (!completed) {
        throw new Error(`autoPlayUntilGameOver did not reach gameOver within ${maxTurns} turns.`);
      }
      break;
    }
    case 'waitForPromptIncludes': {
      await waitForCondition(async () => {
        const snapshot = await getHarnessSnapshot(page);
        const prompt = String(snapshot.promptMessage || '').toLowerCase();
        return prompt.includes(String(step.text).toLowerCase());
      }, step.timeoutMs || DEFAULT_TIMEOUT_MS);
      break;
    }
    case 'waitForCurrentPlayer': {
      await waitForCondition(async () => {
        const snapshot = await getHarnessSnapshot(page);
        const currentId = snapshot.gameState.players[snapshot.gameState.currentPlayerIndex]?.id;
        const expectedId = resolvePlayerAlias(step.player, snapshot.gameState, roles);
        return currentId === expectedId;
      }, step.timeoutMs || DEFAULT_TIMEOUT_MS);
      break;
    }
    case 'wait': {
      await delay(step.ms || 300);
      break;
    }
    default:
      throw new Error(`Unsupported step action: ${step.action}`);
  }

  if (step.afterMs) {
    await delay(step.afterMs);
  }

  if (scenario.mode === 'online' && actor === 'host' && step.action !== 'sync') {
    await delay(120);
  }
}

function validateExpectation(expectation, snapshot, roles) {
  const errors = [];

  if (expectation.type === 'pegAt') {
    const pegId = resolvePegReference(expectation.peg, snapshot.gameState, roles);
    const actualSpace = findPegLocation(snapshot.gameState, pegId);
    if (actualSpace !== expectation.space) {
      errors.push(`Expected ${pegId} to be on ${expectation.space}, got ${actualSpace || 'unknown'}`);
    }
  } else if (expectation.type === 'currentPlayer') {
    const currentId = snapshot.gameState.players[snapshot.gameState.currentPlayerIndex]?.id;
    const expectedId = resolvePlayerAlias(expectation.player, snapshot.gameState, roles);
    if (currentId !== expectedId) {
      errors.push(`Expected current player ${expectedId}, got ${currentId || 'none'}`);
    }
  } else if (expectation.type === 'promptContains') {
    const prompt = String(snapshot.promptMessage || '').toLowerCase();
    if (!prompt.includes(String(expectation.text).toLowerCase())) {
      errors.push(`Expected prompt to contain "${expectation.text}", got "${snapshot.promptMessage || ''}"`);
    }
  } else if (expectation.type === 'phaseIs') {
    if (snapshot.gameState.phase !== expectation.phase) {
      errors.push(`Expected phase ${expectation.phase}, got ${snapshot.gameState.phase}`);
    }
  } else if (expectation.type === 'winnerExists') {
    if (!snapshot.gameState.winner || typeof snapshot.gameState.winner.teamId !== 'number') {
      errors.push('Expected winner to be set, but gameState.winner is missing.');
    }
  } else if (expectation.type === 'winnerTeam') {
    const actualTeamId = snapshot.gameState.winner?.teamId;
    if (actualTeamId !== expectation.teamId) {
      errors.push(`Expected winner team ${expectation.teamId}, got ${actualTeamId ?? 'none'}`);
    }
  } else {
    errors.push(`Unsupported expectation type: ${expectation.type}`);
  }

  return errors;
}

async function runScenario(session, scenario) {
  const startedAt = Date.now();
  const failures = [];
  const notes = [];

  try {
    const setupPage = session.mode === 'online' ? session.hostPage : session.page;
    const snapshot = await getHarnessSnapshot(setupPage);
    const preparedState = applyScenarioSetup(snapshot.gameState, scenario, session.roles);

    if (session.mode === 'offline') {
      await invokeHarness(setupPage, 'replaceGameState', [preparedState]);
      await waitForCondition(async () => {
        const localSnapshot = await getHarnessSnapshot(setupPage);
        return localSnapshot.gameState.id === preparedState.id;
      }, 8_000, 120);
    } else {
      await invokeHarness(setupPage, 'commitGameStateToServer', [preparedState]);
      await waitForCondition(async () => {
        const hostSnapshot = await getHarnessSnapshot(setupPage);
        return hostSnapshot.gameState.id === preparedState.id;
      }, 8_000, 120);
      await invokeHarness(session.joinerPage, 'syncToServer');
      await waitForCondition(async () => {
        const joinerSnapshot = await getHarnessSnapshot(session.joinerPage);
        return joinerSnapshot.gameState.id === preparedState.id;
      }, 12_000, 180);
    }

    if (scenario.setup?.placements) {
      const setupSnapshot = await getHarnessSnapshot(setupPage);
      for (const [pegRef, expectedSpace] of Object.entries(scenario.setup.placements)) {
        const pegId = resolvePegReference(pegRef, setupSnapshot.gameState, session.roles);
        const actualSpace = findPegLocation(setupSnapshot.gameState, pegId);
        notes.push(`Setup check: ${pegRef} -> ${actualSpace || 'unknown'} (expected ${expectedSpace})`);
      }
    }

    for (const step of scenario.steps || []) {
      await executeStep(step, scenario, session, session.roles, notes);
      const stepActor = step.actor || (session.mode === 'online' ? 'host' : 'primary');
      const stepPage = stepActor === 'auto'
        ? (session.mode === 'online' ? session.hostPage : session.page)
        : choosePage(session, stepActor);
      const stepSnapshot = await getHarnessSnapshot(stepPage);
      notes.push(
        `After ${step.action}: selectedCard=${stepSnapshot.selectedCardId || 'none'}, ` +
        `prompt=\"${stepSnapshot.promptMessage || ''}\", ` +
        `currentPlayer=${stepSnapshot.gameState.players[stepSnapshot.gameState.currentPlayerIndex]?.id || 'none'}`
      );
    }

    for (const expectation of scenario.expect || []) {
      const page = choosePage(session, expectation.page);
      const currentSnapshot = await getHarnessSnapshot(page);
      const expectationErrors = validateExpectation(expectation, currentSnapshot, session.roles);
      failures.push(...expectationErrors);
    }

    if (scenario.mode === 'online') {
      const hostSnapshot = await getHarnessSnapshot(session.hostPage);
      const joinerSnapshot = await getHarnessSnapshot(session.joinerPage);
      const hostCurrent = hostSnapshot.gameState.players[hostSnapshot.gameState.currentPlayerIndex]?.id;
      const joinerCurrent = joinerSnapshot.gameState.players[joinerSnapshot.gameState.currentPlayerIndex]?.id;
      if (hostCurrent !== joinerCurrent) {
        failures.push(`Host/joiner current-player mismatch (${hostCurrent} vs ${joinerCurrent})`);
      }
    }
  } catch (error) {
    failures.push(error instanceof Error ? error.message : String(error));
  }

  if (failures.length > 0) {
    notes.push('Scenario failed; inspect harness report and rerun with --headed for UI inspection.');
  }

  return {
    id: scenario.id,
    name: scenario.name,
    mode: scenario.mode,
    status: failures.length === 0 ? 'passed' : 'failed',
    durationMs: Date.now() - startedAt,
    failures,
    notes
  };
}

async function loadScenariosFromFile(filePath) {
  const absolutePath = path.isAbsolute(filePath)
    ? filePath
    : path.join(ROOT_DIR, filePath);
  const raw = await fs.readFile(absolutePath, 'utf8');
  const parsed = JSON.parse(raw);

  if (Array.isArray(parsed)) {
    return parsed;
  }

  if (Array.isArray(parsed.scenarios)) {
    return parsed.scenarios;
  }

  throw new Error('Scenario file must be an array or an object with a scenarios array.');
}

function selectScenarios(command, allScenarios) {
  if (command === 'offline') {
    return allScenarios.filter(scenario => scenario.mode === 'offline');
  }

  if (command === 'online') {
    return allScenarios.filter(scenario => scenario.mode === 'online');
  }

  if (command === 'all') {
    return allScenarios;
  }

  const byId = allScenarios.find(scenario => scenario.id === command);
  if (byId) {
    return [byId];
  }

  throw new Error(`Unknown command or scenario id: ${command}`);
}

async function writeReport(report) {
  const stamp = timestampLabel();
  const reportDir = path.join(ROOT_DIR, 'reports', 'harness');
  await fs.mkdir(reportDir, { recursive: true });

  const jsonPath = path.join(reportDir, `jp-harness-${stamp}.json`);
  const markdownPath = path.join(reportDir, `jp-harness-${stamp}.md`);

  await fs.writeFile(jsonPath, JSON.stringify(report, null, 2), 'utf8');

  const lines = [];
  lines.push('# Joker Pursuit Harness Report');
  lines.push('');
  lines.push(`- Started: ${report.startedAt}`);
  lines.push(`- Finished: ${report.finishedAt}`);
  lines.push(`- Client URL: ${report.clientUrl}`);
  lines.push(`- Server URL: ${report.serverUrl}`);
  lines.push(`- Total: ${report.summary.total}`);
  lines.push(`- Passed: ${report.summary.passed}`);
  lines.push(`- Failed: ${report.summary.failed}`);
  lines.push('');

  for (const result of report.results) {
    lines.push(`## ${result.id} (${result.status.toUpperCase()})`);
    lines.push('');
    lines.push(`- Name: ${result.name}`);
    lines.push(`- Mode: ${result.mode}`);
    lines.push(`- Duration: ${result.durationMs}ms`);
    if (result.failures.length > 0) {
      lines.push('- Failures:');
      result.failures.forEach(failure => lines.push(`  - ${failure}`));
    } else {
      lines.push('- Failures: none');
    }
    if (result.notes.length > 0) {
      lines.push('- Notes:');
      result.notes.forEach(note => lines.push(`  - ${note}`));
    }
    lines.push('');
  }

  await fs.writeFile(markdownPath, `${lines.join('\n')}\n`, 'utf8');

  return { jsonPath, markdownPath };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const runStartedAt = new Date().toISOString();
  const loadedScenarios = args.scenarioFile
    ? await loadScenariosFromFile(args.scenarioFile)
    : BUILTIN_SCENARIOS;

  const selectedScenarios = selectScenarios(args.command, loadedScenarios);
  if (selectedScenarios.length === 0) {
    throw new Error('No scenarios selected.');
  }

  const needsOffline = selectedScenarios.some(scenario => scenario.mode === 'offline');
  const needsOnline = selectedScenarios.some(scenario => scenario.mode === 'online');

  const children = [];

  try {
    if (!args.skipStart) {
      log('Starting frontend dev server...');
      const clientProcess = startProcess('client', 'npm', ['run', 'start'], {
        env: {
          BROWSER: 'none',
          CI: 'true',
          HOST: '127.0.0.1',
          PORT: '3100'
        }
      });
      children.push(clientProcess);

      if (needsOnline) {
        log('Starting multiplayer server...');
        const serverProcess = startProcess('server', 'npm', ['run', 'dev'], {
          cwd: path.join(ROOT_DIR, 'server'),
          env: {
            PORT: '8080'
          }
        });
        children.push(serverProcess);
      }
    }

    log('Waiting for frontend...');
    await waitForUrl(args.clientUrl, 180_000);

    if (needsOnline) {
      log('Waiting for multiplayer server...');
      await waitForUrl(`${args.serverUrl}/healthz`, 180_000);
    }

    const browser = await chromium.launch({ headless: !args.headed });

    let offlineSession = null;
    let onlineSession = null;

    if (needsOffline) {
      log('Bootstrapping offline session...');
      offlineSession = await bootstrapOffline(browser, args.clientUrl);
    }

    if (needsOnline) {
      log('Bootstrapping online session...');
      onlineSession = await bootstrapOnline(browser, args.clientUrl);
      log(`Online room created: ${onlineSession.roomCode}`);
    }

    const results = [];

    for (const scenario of selectedScenarios) {
      log(`Running ${scenario.id} ...`);
      const session = scenario.mode === 'offline' ? offlineSession : onlineSession;
      if (!session) {
        results.push({
          id: scenario.id,
          name: scenario.name,
          mode: scenario.mode,
          status: 'failed',
          durationMs: 0,
          failures: [`Session for mode ${scenario.mode} is unavailable.`],
          notes: []
        });
        continue;
      }

      const result = await runScenario(session, scenario);
      results.push(result);
      log(`${scenario.id}: ${result.status.toUpperCase()}`);
    }

    await browser.close();

    const summary = {
      total: results.length,
      passed: results.filter(result => result.status === 'passed').length,
      failed: results.filter(result => result.status === 'failed').length
    };

    const report = {
      startedAt: runStartedAt,
      finishedAt: new Date().toISOString(),
      command: args.command,
      clientUrl: args.clientUrl,
      serverUrl: args.serverUrl,
      scenarioFile: args.scenarioFile,
      summary,
      results
    };

    const paths = await writeReport(report);
    log(`Report written: ${paths.jsonPath}`);
    log(`Report written: ${paths.markdownPath}`);

    if (summary.failed > 0) {
      process.exitCode = 1;
    }
  } finally {
    await Promise.all(children.map(child => stopProcess(child)));
  }
}

main()
  .then(() => {
    process.exit(process.exitCode ?? 0);
  })
  .catch(error => {
    console.error(error);
    process.exit(1);
  });
