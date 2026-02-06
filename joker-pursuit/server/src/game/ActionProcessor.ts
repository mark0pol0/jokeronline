import { ActionResult, GameActionV2, RoomStateV2 } from '../types/v2';

interface ProcessActionInput {
  room: RoomStateV2;
  actorPlayerId: string;
  baseVersion: number;
  action: GameActionV2;
}

const cloneRoom = (room: RoomStateV2): RoomStateV2 =>
  JSON.parse(JSON.stringify(room)) as RoomStateV2;

const isNonEmptyObject = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === 'object';

export class ActionProcessor {
  process(input: ProcessActionInput): ActionResult {
    const room = cloneRoom(input.room);

    if (input.baseVersion !== room.stateVersion) {
      return {
        success: false,
        reason: 'version_mismatch',
        room
      };
    }

    const actor = room.players.find(player => player.id === input.actorPlayerId);
    if (!actor) {
      return {
        success: false,
        reason: 'player_not_found',
        room
      };
    }

    if (input.action.type === 'phase_transition') {
      if (room.hostPlayerId !== actor.id) {
        return {
          success: false,
          reason: 'host_only_action',
          room
        };
      }

      if (input.action.nextGameState) {
        room.gameState = input.action.nextGameState;
      } else if (isNonEmptyObject(room.gameState)) {
        room.gameState.phase = input.action.phase;
      }

      room.isStarted = true;
      room.stateVersion += 1;
      room.updatedAt = Date.now();

      return {
        success: true,
        room
      };
    }

    if (!isNonEmptyObject(room.gameState) || !Array.isArray(room.gameState.players)) {
      return {
        success: false,
        reason: 'game_not_initialized',
        room
      };
    }

    const currentPlayerIndex = Number((room.gameState as any).currentPlayerIndex ?? 0);
    const currentPlayer = room.gameState.players[currentPlayerIndex];
    if (!currentPlayer || currentPlayer.id !== actor.id) {
      return {
        success: false,
        reason: 'not_your_turn',
        room
      };
    }

    const nextState = input.action.nextGameState;
    if (!isNonEmptyObject(nextState) || !Array.isArray(nextState.players)) {
      return {
        success: false,
        reason: 'invalid_next_state',
        room
      };
    }

    // Enforce turn progression for committed turn actions. This blocks
    // stale/split-brain client writes that keep the same active player.
    const nextPlayerIndex = Number((nextState as any).currentPlayerIndex ?? NaN);
    if (!Number.isFinite(nextPlayerIndex) || nextPlayerIndex === currentPlayerIndex) {
      return {
        success: false,
        reason: 'turn_not_advanced',
        room
      };
    }

    room.gameState = nextState;
    room.stateVersion += 1;
    room.updatedAt = Date.now();

    return {
      success: true,
      room
    };
  }
}
