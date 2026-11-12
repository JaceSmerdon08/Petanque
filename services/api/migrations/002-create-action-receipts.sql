CREATE TABLE action_receipts (
  room_id TEXT NOT NULL,
  action_id TEXT NOT NULL,
  received_at TEXT NOT NULL,
  PRIMARY KEY (room_id, action_id)
);
