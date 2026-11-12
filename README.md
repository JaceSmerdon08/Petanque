# Pétanque Together

A private, live 1-v-1 pétanque game. Each player has three boules per mène; the first to 13 wins. No accounts or email invitations.

## Local setup

Requirements: Node.js 20+ and npm.

```sh
npm install
npm run dev
```

Open [http://localhost:5173](http://localhost:5173). The API listens at `http://localhost:3001`. Create a match and share the **friend's seat link**. Open the two seat links in separate browser sessions to play. Both seats can be refreshed and rejoined through their saved link.

Optional environment settings are in `.env.example` (copy it to the repository-root `.env`). `DATABASE_PATH` defaults to `./data/petanque.sqlite` relative to the repository root; room states and hashed seat credentials persist in SQLite. Seat links are bearer credentials embedded in the URL fragment (not sent to the web server in HTTP requests). The creator's browser stores the private seat links locally. Keep them private.

## Play without installing software on your computer

The repository includes a GitHub Codespaces configuration. If Codespaces is
enabled for your GitHub account and allowed by your school, open the repository
on GitHub, choose **Code → Codespaces → Create codespace**, and wait for setup
to finish. The hosted workspace provides Node.js and installs the project
dependencies; nothing needs to be installed on your computer.

In the Codespaces terminal, run:

```sh
npm run dev
```

Open the forwarded **Petanque web** port (5173). To let a friend outside your
Codespace access it, open the **Ports** tab and change port 5173's visibility to
**Public**, if your organization permits that. Keep port 3001 private. Share
only the friend's seat link from the game; it grants access to that seat. Anyone
who obtains the public website URL can open the site, but cannot join your
private match without a seat link.

Codespaces is a development environment, not always-on hosting: it can stop
when idle, and the game will be unavailable while stopped. The SQLite database
is in the Codespace workspace. For a permanent game link, the server and
persistent database need a separately approved hosting service.

```sh
npm test       # backend rule tests
npm run build  # type-check and production-build both applications
```

The Node server validates seat ownership and turn legality. The piste uses normalized coordinates, direction (angle) and power controls. Once both players use all three boules, the closest player scores one point per boule closer than the opponent's closest boule. The mène winner opens the next end.

## Hosting

Local development and Codespaces are not always-on hosting. A Codespace can
stop when idle, and a friend can join only while it is running and the web port
is reachable. A permanent game link requires deploying the backend to a
reachable host and selecting persistent hosted storage; this project does not
provision cloud resources or define a production deployment target. Use
HTTPS/WSS, restrict origins, protect and rotate bearer links, and choose a
durable database before hosting.
