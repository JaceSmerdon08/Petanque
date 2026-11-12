import Database from "better-sqlite3";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { mkdirSync, readFileSync, readdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { newGame, type GameState, type Seat } from "./game.js";

export type Room = { id: string; state: GameState; seats: Record<Seat, string> };
const hash = (token: string) => createHash("sha256").update(token).digest("hex");

export class RoomStore {
  private db: Database.Database;
  constructor(filename = process.env.DATABASE_PATH ?? "./data/petanque.sqlite") {
    const path = filename === ":memory:" ? filename : resolve(filename);
    if (path !== ":memory:") mkdirSync(dirname(path), { recursive: true });
    this.db = new Database(path);
    this.db.pragma("journal_mode = WAL");
    this.migrate();
  }

  private migrate(): void {
    this.db.exec("CREATE TABLE IF NOT EXISTS schema_migrations (version TEXT PRIMARY KEY, applied_at TEXT NOT NULL)");
    const directory = resolve(dirname(fileURLToPath(import.meta.url)), "../migrations");
    const files = readdirSync(directory).filter(name => name.endsWith(".sql")).sort();
    const applied = this.db.prepare("SELECT version FROM schema_migrations").all() as { version: string }[];
    const hasVersion = new Set(applied.map(row => row.version));
    const record = this.db.prepare("INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)");
    for (const file of files) {
      if (hasVersion.has(file)) continue;
      const sql = readFileSync(resolve(directory, file), "utf8");
      this.db.transaction(() => {
        this.db.exec(sql);
        record.run(file, new Date().toISOString());
      })();
    }
  }

  create(): { room: Room; credentials: Record<Seat, string> } {
    const id = randomUUID().replaceAll("-", "").slice(0, 12);
    const credentials = { one: randomBytes(32).toString("base64url"), two: randomBytes(32).toString("base64url") };
    const state = newGame(id);
    this.db.prepare("INSERT INTO rooms VALUES (?, ?, ?, ?, ?, ?)").run(
      id, JSON.stringify(state), hash(credentials.one), hash(credentials.two), state.updatedAt, state.updatedAt,
    );
    return { room: { id, state, seats: credentials }, credentials };
  }

  get(id: string): Room | null {
    const row = this.db.prepare("SELECT * FROM rooms WHERE id = ?").get(id) as
      { id: string; state: string; seat_one_hash: string; seat_two_hash: string } | undefined;
    if (!row) return null;
    return {
      id: row.id,
      state: JSON.parse(row.state) as GameState,
      seats: { one: row.seat_one_hash, two: row.seat_two_hash },
    };
  }

  authenticate(id: string, token: string): Seat | null {
    const room = this.get(id);
    if (!room) return null;
    const digest = hash(token);
    if (digest === room.seats.one) return "one";
    if (digest === room.seats.two) return "two";
    return null;
  }

  save(state: GameState): void {
    this.db.prepare("UPDATE rooms SET state = ?, updated_at = ? WHERE id = ?")
      .run(JSON.stringify(state), state.updatedAt, state.roomId);
  }

  saveAction(state: GameState, actionId: string): boolean {
    return this.db.transaction(() => {
      const inserted = this.db.prepare(`INSERT INTO action_receipts (room_id, action_id, received_at)
        VALUES (?, ?, ?) ON CONFLICT (room_id, action_id) DO NOTHING`)
        .run(state.roomId, actionId, new Date().toISOString());
      if (inserted.changes === 0) return false;
      this.db.prepare("UPDATE rooms SET state = ?, updated_at = ? WHERE id = ?")
        .run(JSON.stringify(state), state.updatedAt, state.roomId);
      return true;
    })();
  }
  close(): void { this.db.close(); }
}
