import { createServer } from "node:http";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import cors from "cors";
import dotenv from "dotenv";
import express from "express";
import { Server } from "socket.io";
import { z } from "zod";
import { applyJackThrow, applyThrow, GameError, type GameState, type Seat } from "./game.js";
import { RoomStore } from "./store.js";

dotenv.config({ path: resolve(dirname(fileURLToPath(import.meta.url)), "../../../.env") });
const app = express();
const httpServer = createServer(app);
const allowedOrigin = process.env.WEB_ORIGIN ?? "http://localhost:5173";
app.use(cors({ origin: allowedOrigin }));
app.use(express.json());
const io = new Server(httpServer, { cors: { origin: allowedOrigin, methods: ["GET", "POST"] } });
const store = new RoomStore();
const connectedSeats = new Map<string, string>();
const seatKey = (roomId: string, seat: Seat) => `${roomId}:${seat}`;
const actionSchema = z.object({ actionId: z.string().uuid(), angle: z.number(), power: z.number() });

app.get("/health", (_req, res) => res.json({ status: "ok" }));
app.post("/api/rooms", (_req, res) => {
  const { room, credentials } = store.create();
  res.status(201).json({ roomId: room.id, seatLinks: credentials });
});
const joinSchema = z.object({ roomId: z.string().regex(/^[a-f0-9]{12}$/), token: z.string().min(32).max(64) });
io.on("connection", socket => {
  let roomId: string | null = null;
  let seat: Seat | null = null;
  socket.on("room:join", (payload: unknown, ack?: (result: unknown) => void) => {
    const parsed = joinSchema.safeParse(payload);
    if (!parsed.success) return ack?.({ ok: false, error: "Invalid room credentials." });
    const authorizedSeat = store.authenticate(parsed.data.roomId, parsed.data.token);
    const room = store.get(parsed.data.roomId);
    if (!authorizedSeat || !room) return ack?.({ ok: false, error: "This private seat link is invalid." });
    if (roomId && seat) connectedSeats.delete(seatKey(roomId, seat));
    const key = seatKey(parsed.data.roomId, authorizedSeat);
    const previousSocketId = connectedSeats.get(key);
    if (previousSocketId && previousSocketId !== socket.id) {
      io.sockets.sockets.get(previousSocketId)?.disconnect(true);
    }
    if (roomId) socket.leave(roomId);
    roomId = parsed.data.roomId;
    seat = authorizedSeat;
    connectedSeats.set(key, socket.id);
    socket.join(roomId);
    if (seat === "two" && !room.state.players.two) {
      room.state.players.two = { seat: "two", boulesThrown: 0 };
      room.state.updatedAt = new Date().toISOString();
      store.save(room.state);
    }
    ack?.({ ok: true, seat, state: room.state });
    io.to(roomId).emit("game:state", room.state);
    socket.to(roomId).emit("player:connected", { seat });
  });
  socket.on("game:throw", (payload: unknown, ack?: (result: unknown) => void) => {
    if (!roomId || !seat) return ack?.({ ok: false, error: "Join your seat link first." });
    const intent = actionSchema.safeParse(payload);
    if (!intent.success) return ack?.({ ok: false, error: "Invalid throw controls." });
    try {
      const current = store.get(roomId)?.state;
      if (!current) return ack?.({ ok: false, error: "Room not found." });
      const { actionId, ...controls } = intent.data;
      const state: GameState = applyThrow(current, seat, controls);
      if (!store.saveAction(state, actionId)) return ack?.({ ok: false, code: "DUPLICATE_ACTION", error: "This action was already processed." });
      io.to(roomId).emit("game:state", state);
      ack?.({ ok: true, state });
    } catch (error) {
      if (error instanceof GameError) return ack?.({ ok: false, code: error.code, error: error.message });
      console.error("Unexpected game action failure", error);
      ack?.({ ok: false, error: "The throw could not be processed." });
    }
  });
  socket.on("game:throw-jack", (payload: unknown, ack?: (result: unknown) => void) => {
    if (!roomId || !seat) return ack?.({ ok: false, error: "Join your seat link first." });
    const intent = actionSchema.safeParse(payload);
    if (!intent.success) return ack?.({ ok: false, error: "Invalid throw controls." });
    try {
      const current = store.get(roomId)?.state;
      if (!current) return ack?.({ ok: false, error: "Room not found." });
      const { actionId, ...controls } = intent.data;
      const state = applyJackThrow(current, seat, controls);
      if (!store.saveAction(state, actionId)) return ack?.({ ok: false, code: "DUPLICATE_ACTION", error: "This action was already processed." });
      io.to(roomId).emit("game:state", state);
      ack?.({ ok: true, state });
    } catch (error) {
      if (error instanceof GameError) return ack?.({ ok: false, code: error.code, error: error.message });
      console.error("Unexpected jack action failure", error);
      ack?.({ ok: false, error: "The jack throw could not be processed." });
    }
  });
  socket.on("disconnect", () => {
    if (roomId && seat && connectedSeats.get(seatKey(roomId, seat)) === socket.id) {
      connectedSeats.delete(seatKey(roomId, seat));
    }
    if (roomId && seat) socket.to(roomId).emit("player:disconnected", { seat });
  });
});

const port = Number(process.env.PORT ?? 3001);
httpServer.listen(port, "0.0.0.0", () => console.log(`Petanque API listening on http://localhost:${port}`));
