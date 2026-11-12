import assert from "node:assert/strict";
import test from "node:test";
import { applyJackThrow, applyThrow, closestDistances, newGame, scoreEnd, type GameState } from "./game.js";

const ready = (): GameState => {
  const state = newGame("test");
  state.players.two = { seat: "two", boulesThrown: 0 };
  state.jackPlaced = true;
  return state;
};

test("closest boule uses Euclidean distance and handles tied distances", () => {
  const state = ready();
  state.boules = [
    { id: "a", seat: "one", x: 40, y: 30, end: 1 },
    { id: "b", seat: "two", x: 60, y: 30, end: 1 },
  ];
  assert.deepEqual(closestDistances(state), { one: 34, two: 14 });
  state.boules[0]!.x = 60;
  assert.deepEqual(closestDistances(state), { one: 14, two: 14 });
  assert.deepEqual(scoreEnd(state), { points: 0, seat: null });
});

test("point counting awards every boule closer than the opponent's closest", () => {
  const state = ready();
  state.jack = { x: 50, y: 30 };
  state.boules = [
    { id: "a", seat: "one", x: 51, y: 30, end: 1 },
    { id: "b", seat: "one", x: 52, y: 30, end: 1 },
    { id: "c", seat: "one", x: 54, y: 30, end: 1 },
    { id: "d", seat: "two", x: 53, y: 30, end: 1 },
  ];
  assert.deepEqual(scoreEnd(state), { points: 2, seat: "one" });
});

test("server validates turn and advances to the player not holding point", () => {
  const state = ready();
  assert.throws(() => applyThrow(state, "two", { angle: 0, power: 50 }), { code: "NOT_YOUR_TURN" });
  const after = applyThrow(state, "one", { angle: 0, power: 50 });
  assert.equal(after.activeSeat, "two");
  const afterTwo = applyThrow(after, "two", { angle: 0, power: 30 });
  assert.equal(afterTwo.activeSeat, "one");
});

test("the opener must throw the jack before a boule and only once per end", () => {
  const state = newGame("test");
  assert.throws(() => applyJackThrow(state, "one", { angle: 0, power: 50 }), { code: "ROOM_NOT_FULL" });
  const full = ready();
  full.jackPlaced = false;
  assert.throws(() => applyThrow(full, "one", { angle: 0, power: 50 }), { code: "JACK_NOT_THROWN" });
  assert.throws(() => applyJackThrow(full, "two", { angle: 0, power: 50 }), { code: "NOT_YOUR_TURN" });
  const opened = applyJackThrow(full, "one", { angle: 0, power: 80 });
  assert.equal(opened.jackPlaced, true);
  assert.equal(opened.activeSeat, "one");
  const firstBoule = applyThrow(opened, "one", { angle: 0, power: 80 }).boules[0]!;
  assert.notDeepEqual({ x: firstBoule.x, y: firstBoule.y }, opened.jack);
  assert.throws(() => applyJackThrow(opened, "one", { angle: 0, power: 50 }), { code: "JACK_ALREADY_THROWN" });
});

test("a player cannot throw more than three boules in a mène", () => {
  const state = ready();
  state.players.one!.boulesThrown = 3;
  assert.throws(() => applyThrow(state, "one", { angle: 0, power: 50 }), { code: "BOULES_EXHAUSTED" });
});

test("mene transition scores, resets boules, and the winner opens next end", () => {
  let state = ready();
  state.jack = { x: 50, y: 30 };
  state.boules = [
    { id: "a", seat: "one", x: 51, y: 30, end: 1 },
    { id: "b", seat: "one", x: 52, y: 30, end: 1 },
    { id: "c", seat: "two", x: 70, y: 30, end: 1 },
    { id: "d", seat: "two", x: 71, y: 30, end: 1 },
    { id: "e", seat: "two", x: 72, y: 30, end: 1 },
  ];
  state.players.one!.boulesThrown = 2;
  state.players.two!.boulesThrown = 3;
  state.activeSeat = "one";
  state = applyThrow(state, "one", { angle: 0, power: 50 });
  assert.equal(state.scores.one, 3);
  assert.equal(state.end, 2);
  assert.equal(state.activeSeat, "one");
  assert.equal(state.boules.length, 0);
  assert.equal(state.jackPlaced, false);
  assert.equal(state.players.one!.boulesThrown, 0);
});

test("a player wins as soon as an end takes the score to thirteen", () => {
  const state = ready();
  state.jack = { x: 50, y: 30 };
  state.scores.one = 11;
  state.players.one!.boulesThrown = 2;
  state.players.two!.boulesThrown = 3;
  state.boules = [
    { id: "a", seat: "one", x: 51, y: 30, end: 1 },
    { id: "b", seat: "two", x: 70, y: 30, end: 1 },
  ];
  state.activeSeat = "one";
  const after = applyThrow(state, "one", { angle: 0, power: 50 });
  assert.equal(after.scores.one, 13);
  assert.equal(after.winner, "one");
  assert.throws(() => applyThrow(after, "one", { angle: 0, power: 50 }), { code: "GAME_OVER" });
});
