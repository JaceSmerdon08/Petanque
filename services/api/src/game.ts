import { randomUUID } from "node:crypto";

export type Seat = "one" | "two";
export type Player = { seat: Seat; boulesThrown: number };
export type Boule = { id: string; seat: Seat; x: number; y: number; end: number };
export type GameState = {
  roomId: string;
  players: Record<Seat, Player | null>;
  scores: Record<Seat, number>;
  end: number;
  activeSeat: Seat;
  openingSeat: Seat;
  jack: { x: number; y: number };
  jackPlaced: boolean;
  boules: Boule[];
  winner: Seat | null;
  updatedAt: string;
};

export type ThrowIntent = { angle: number; power: number };
export type GameErrorCode = "NOT_YOUR_TURN" | "GAME_OVER" | "ROOM_NOT_FULL" | "BOULES_EXHAUSTED" | "INVALID_THROW" | "JACK_NOT_THROWN" | "JACK_ALREADY_THROWN" | "INVALID_JACK_DISTANCE";
export class GameError extends Error {
  constructor(public code: GameErrorCode, message: string) { super(message); }
}

export const PISTE = { width: 100, height: 60 };
export const MAX_BOULES = 3;
export const TARGET_SCORE = 13;

export function newGame(roomId: string, createdAt = new Date().toISOString()): GameState {
  return {
    roomId, players: { one: { seat: "one", boulesThrown: 0 }, two: null },
    scores: { one: 0, two: 0 }, end: 1, activeSeat: "one", openingSeat: "one",
    jack: { x: 74, y: 30 }, jackPlaced: false, boules: [], winner: null, updatedAt: createdAt,
  };
}

export function distance(a: { x: number; y: number }, b: { x: number; y: number }): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

export function closestDistances(state: GameState): Record<Seat, number> {
  const result: Record<Seat, number> = { one: Infinity, two: Infinity };
  for (const boule of state.boules) result[boule.seat] = Math.min(result[boule.seat], distance(boule, state.jack));
  return result;
}

export function scoreEnd(state: GameState): { points: number; seat: Seat | null } {
  const closest = closestDistances(state);
  if (!Number.isFinite(closest.one) || !Number.isFinite(closest.two) || closest.one === closest.two) {
    return { points: 0, seat: null };
  }
  const seat: Seat = closest.one < closest.two ? "one" : "two";
  const opponentDistance = closest[seat === "one" ? "two" : "one"];
  return {
    seat,
    points: state.boules.filter(b => b.seat === seat && distance(b, state.jack) < opponentDistance).length,
  };
}

function throwPosition(state: GameState, intent: ThrowIntent, phaseOffset = 0): { x: number; y: number } {
  const radians = (intent.angle * Math.PI) / 180;
  // Throws launch from the left-hand end of the piste; power controls distance.
  const travel = intent.power * 0.7;
  const spread = (1 - intent.power / 100) * 2.8;
  const x = 8 + travel;
  const y = 30 + Math.tan(radians) * travel * 0.35 + spread * Math.sin((state.end + state.boules.length + phaseOffset) * 2.17);
  return {
    x: Math.max(2, Math.min(98, x)),
    y: Math.max(2, Math.min(58, y)),
  };
}

function validateIntent(intent: ThrowIntent): void {
  if (!Number.isFinite(intent.angle) || intent.angle < -80 || intent.angle > 80 ||
      !Number.isFinite(intent.power) || intent.power < 1 || intent.power > 100) {
    throw new GameError("INVALID_THROW", "Angle must be -80 to 80 and power 1 to 100.");
  }
}

export function applyJackThrow(state: GameState, seat: Seat, intent: ThrowIntent, now = new Date().toISOString()): GameState {
  if (state.winner) throw new GameError("GAME_OVER", "This match is already complete.");
  if (!state.players.one || !state.players.two) throw new GameError("ROOM_NOT_FULL", "Wait for both seats to join before playing.");
  if (state.activeSeat !== seat) throw new GameError("NOT_YOUR_TURN", "It is not your turn.");
  if (state.jackPlaced) throw new GameError("JACK_ALREADY_THROWN", "The jack has already been thrown this end.");
  validateIntent(intent);
  const next = structuredClone(state);
  const jack = throwPosition(next, intent, 1);
  const throwDistance = distance(jack, { x: 8, y: 30 });
  if (throwDistance < 40 || throwDistance > 70) {
    throw new GameError("INVALID_JACK_DISTANCE", "The jack must land between 6 and 10 metres from the throwing circle.");
  }
  next.jack = jack;
  next.jackPlaced = true;
  next.updatedAt = now;
  return next;
}

export function applyThrow(state: GameState, seat: Seat, intent: ThrowIntent, now = new Date().toISOString()): GameState {
  if (state.winner) throw new GameError("GAME_OVER", "This match is already complete.");
  if (!state.players.one || !state.players.two) throw new GameError("ROOM_NOT_FULL", "Wait for both seats to join before playing.");
  if (state.activeSeat !== seat) throw new GameError("NOT_YOUR_TURN", "It is not your turn.");
  if (!state.jackPlaced) throw new GameError("JACK_NOT_THROWN", "Throw the jack to open this end first.");
  const player = state.players[seat];
  if (!player || player.boulesThrown >= MAX_BOULES) throw new GameError("BOULES_EXHAUSTED", "No boules remain this end.");
  validateIntent(intent);
  const next: GameState = structuredClone(state);
  const position = throwPosition(next, intent);
  next.boules.push({ id: randomUUID(), seat, ...position, end: next.end });
  next.players[seat]!.boulesThrown += 1;
  next.updatedAt = now;

  const other: Seat = seat === "one" ? "two" : "one";
  const count = (s: Seat) => next.players[s]?.boulesThrown ?? MAX_BOULES;
  if (count("one") >= MAX_BOULES && count("two") >= MAX_BOULES) {
    const result = scoreEnd(next);
    if (result.seat) next.scores[result.seat] += result.points;
    if (next.scores.one >= TARGET_SCORE) next.winner = "one";
    if (next.scores.two >= TARGET_SCORE) next.winner = "two";
    if (!next.winner) {
      next.end += 1;
      next.jack = { x: 70 + ((next.end * 7) % 18), y: 12 + ((next.end * 11) % 36) };
      next.jackPlaced = false;
      next.openingSeat = result.seat ?? next.openingSeat;
      next.activeSeat = next.openingSeat;
      next.boules = [];
      next.players.one!.boulesThrown = 0;
      next.players.two!.boulesThrown = 0;
    }
  } else {
    const positions = closestDistances(next);
    if (count(other) >= MAX_BOULES) next.activeSeat = seat;
    else if (!Number.isFinite(positions.one) || !Number.isFinite(positions.two)) next.activeSeat = other;
    else if (positions.one === positions.two) next.activeSeat = other;
    else next.activeSeat = positions.one < positions.two ? "two" : "one";
  }
  return next;
}

export function publicGame(state: GameState): GameState {
  return structuredClone(state);
}
