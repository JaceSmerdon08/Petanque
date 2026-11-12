import assert from "node:assert/strict";
import test from "node:test";
import { RoomStore } from "./store.js";

test("private rooms persist state and authenticate opaque seat credentials", () => {
  const store = new RoomStore(":memory:");
  try {
    const { room, credentials } = store.create();
    assert.equal(store.authenticate(room.id, credentials.one), "one");
    assert.equal(store.authenticate(room.id, credentials.two), "two");
    assert.equal(store.authenticate(room.id, "not-a-seat-token"), null);

    room.state.players.two = { seat: "two", boulesThrown: 0 };
    assert.equal(store.saveAction(room.state, "6ec8916a-4e31-4c0d-a4b4-9f4f14d80d8b"), true);
    const replay = structuredClone(room.state);
    replay.scores.one = 99;
    assert.equal(store.saveAction(room.state, "6ec8916a-4e31-4c0d-a4b4-9f4f14d80d8b"), false);
    assert.equal(store.saveAction(replay, "6ec8916a-4e31-4c0d-a4b4-9f4f14d80d8b"), false);
    assert.deepEqual(store.get(room.id)?.state, room.state);
    assert.equal(store.get("000000000000"), null);
  } finally {
    store.close();
  }
});
