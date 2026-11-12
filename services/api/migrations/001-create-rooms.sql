CREATE TABLE rooms (
  id TEXT PRIMARY KEY,
  state TEXT NOT NULL,
  seat_one_hash TEXT NOT NULL,
  seat_two_hash TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
