# Petanque Together

## Goal

Build a browser-based, live 1-v-1 pétanque game that follows classic singles
rules and lets two friends return to the same private match without accounts or
repeated email invitations.

## Approved scope

- Live, turn-by-turn play for two players.
- Three boules per player; the first player to reach 13 points wins.
- A digital piste with simple aiming and throwing controls.
- Clear turn, boule, end (mène), score, and connection status.
- Create a private room and share a reusable, seat-specific link.
- Restore a player's seat and match state after a refresh or temporary
  disconnect; reject duplicate, out-of-turn, or invalid actions.
- Responsive, accessible browser UI.

## Rules and game flow

- A match starts with one player opening the mène and throwing the jack.
- Players alternate ends; the player whose boule is not currently closest to
  the jack throws next. If a throw takes the point, the other player throws.
- A player may throw up to three boules in a mène. After both players have used
  all boules, award one point for each boule belonging to the player closest
  to the jack that is closer than the opponent's closest boule.
- The winner of a mène starts the next one. Play ends when a player reaches 13.
- Model throws on a fixed digital piste, with aiming and power controls. Show
  the resulting boule positions and make the closest-boule comparison visible.

## Proposed implementation

- **Frontend:** React and TypeScript, built as a responsive single-page web app.
- **Realtime backend:** TypeScript on Node.js with Socket.IO. The server owns
  room membership, turns, legal actions, boule positions, and scoring; clients
  submit throw intents and render authoritative updates.
- **Persistence:** SQLite for local development and match/room restoration. Keep
  persistence behind a small boundary so a durable hosted database can replace
  it when a deployment target is chosen.
- **Room access:** Generate a room ID and separate, unguessable seat credentials.
  The creator keeps a rejoin link and shares the opponent's reusable link.
  Treat links as bearer credentials: anyone with a seat link can use that seat.
  Do not put player email or personal data in room records.
- **Local-first:** Provide a local development setup for the browser app and
  backend. A local server alone does not make the game reachable by a friend on
  another network; internet play requires deploying the backend and persistent
  storage to a reachable host. No cloud provider or paid service is selected by
  this plan.

## Not in the first version

- Accounts, email invitations, chat, public matchmaking, spectators, doubles,
  tournaments, or payment features.
- Production hosting or cloud provisioning. The app should be deployable later,
  but hosting and any associated costs require a separate decision.

## Acceptance checks

- Two browser sessions can create/join a private room and receive updates after
  each legal throw without manual refresh.
- Refreshing or reconnecting restores each player to the same seat and current
  match state using their reusable link.
- The server rejects actions from the wrong seat, out-of-turn throws, and
  attempts to throw more than three boules in a mène.
- Tests cover closest-boule selection, tied distances, point counting, mène
  transitions, and winning at 13.
- The UI clearly communicates whose turn it is, remaining boules, current score,
  reconnect status, and match completion.
- The project can be started locally using documented commands.

## Delivery sequence

1. Scaffold the frontend and backend, local configuration, and test setup.
2. Implement and test the authoritative rules engine.
3. Add persisted private rooms, seat links, and realtime reconnect behavior.
4. Build the game board, lobby, controls, score display, and responsive states.
5. Run focused rules and integration tests and verify two-session local play.
