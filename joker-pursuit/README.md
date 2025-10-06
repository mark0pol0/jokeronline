# Joker Pursuit - Multiplayer Card Game

A digital implementation of the classic Joker Pursuit board game with both local and online multiplayer modes.

## Features

- Play locally with 2-8 players on the same device
- Play online with friends using a simple room code system
- Beautiful, intuitive user interface
- Full implementation of all game rules and special card actions

## Getting Started

### Prerequisites

- Node.js (v14 or higher)
- npm (v6 or higher)

### Installation

1. Clone the repository:
```
git clone https://github.com/yourusername/joker-pursuit.git
cd joker-pursuit
```

2. Install dependencies for the client:
```
npm install
```

3. Install dependencies for the server:
```
cd server
npm install
cd ..
```

### Running the Game

#### Local Development

1. Start the client:
```
npm start
```

2. Start the server (in a separate terminal):
```
cd server
npm run dev
```

3. Open your browser and navigate to `http://localhost:3000`

#### Production Build

1. Build the client:
```
npm run build
```

2. Build the server:
```
cd server
npm run build
```

3. Start the server:
```
cd server
npm start
```

### Environment Configuration

Copy the provided `.env.example` files to `.env` and update the variables for your deployment targets:

```
cp .env.example .env
cp server/.env.example server/.env
```

- `REACT_APP_SOCKET_URL` — the public URL of your Socket.IO server. For the built-in Vercel function you can omit this and the app will connect to the current origin.
- `REACT_APP_SOCKET_PATH` — the Socket.IO path exposed by the backend. Defaults to `/api/socket`, which matches both the bundled Node server and the Vercel function.
- `ALLOWED_ORIGINS` — a comma-separated list of origins that are allowed to connect to the Socket.IO server (configure this in `server/.env`). Include your Vercel domain (e.g. `https://your-app.vercel.app`) so the backend accepts production connections.
- `SOCKET_IO_PATH` — override the Socket.IO path on the Node server. Leave as `/api/socket` to mirror the serverless handler.

### Configuring the multiplayer connection

- Use the **Connection Settings** card in the online lobby to update the Socket.IO endpoint without rebuilding the client. Paste the public URL of your hosted server (or a tunnel) and the app will reconnect automatically.
- The selection is stored in `localStorage`, so a mobile browser will remember your choice between sessions.
- Connection errors are surfaced directly in the banner so it's obvious when the backend is offline or blocked by CORS.

### Hosting on Vercel

Vercel can now serve both the static React build **and** the Socket.IO backend through a serverless API route:

1. The provided `vercel.json` builds the client from `joker-pursuit`, exposes the `api/socket.ts` function, and rewrites SPA routes back to `index.html` without affecting `/api/*` paths.
2. Add `ALLOWED_ORIGINS` (comma-separated) and, if you use a custom domain, update it whenever the deployment URL changes. The serverless function respects these origins.
3. Optionally override `REACT_APP_SOCKET_URL` when you want the client to connect to a different host (for example, a locally running dev server). Leave it unset in production so browsers connect back to the same Vercel origin.
4. If you self-host the Node server instead, keep `SOCKET_IO_PATH` and `REACT_APP_SOCKET_PATH` aligned so the client and server agree on the WebSocket endpoint.

Need a dedicated always-on backend? The project still includes Fly.io deployment assets (`server/Dockerfile` and `server/fly.toml`) so you can launch the Socket.IO server on that platform, then point the client at the Fly URL via the Connection Settings panel or environment variables.

## How to Play

### Local Game

1. From the home screen, click "Local Game"
2. Set up the game by adding players, selecting colors, and configuring teams
3. Start the game and enjoy!

### Online Multiplayer

1. From the home screen, click "Play Online"
2. Choose to either "Host a Game" or "Join a Game"

#### Hosting a Game

1. Enter your name and click "Create Room"
2. Share the displayed room code with your friends
3. Wait for players to join
4. When everyone is ready, click "Start Game"
5. Select your color when prompted
6. As the host, you'll need to shuffle and deal the cards to begin

#### Joining a Game

1. Enter your name and the room code provided by the host
2. Click "Join Room"
3. Wait for the host to start the game
4. Select your color when prompted
5. Wait for the host to shuffle and deal the cards

## Game Rules

Joker Pursuit is a strategic board game where each player has 5 pegs and uses cards to move them from the starting circle into their castle.

### Setup
- Each player gets 5 pegs and a deck of 54 cards
- Players are dealt 5 cards each
- Players take turns in circular fashion, clockwise around the board to the left

### Card Actions
- **Ace:** Moves a peg one space, OR out of the starting circle, OR moves from one corner of the board to the next even if this skips over one's own pegs
- **Face Cards (J, Q, K):** Moves a peg forward ten spaces, OR out of the starting circle
- **Joker:** Moves a peg from the board or starting circle to bump another's peg on the board anywhere. Can skip one's own pegs, but can't attack others' circles or castles, and can't move to an empty space
- **Seven:** Moves one peg forward seven spaces, OR may be split between two pegs with both moving forward
- **Eight:** Moves eight spaces in reverse. If played right after getting out, the peg will end up on the back right corner
- **Nine:** Moves one peg forward nine spaces, OR may be split between two pegs with one moving forward and the other in reverse
- All other cards (2-6, 10) move a peg forward their numeric value

### Special Rules
- **Teams:** Players may play with two or more teams. Teammates sit opposite each other or alternate around the board.
- **Bump:** Landing on an opponent's peg bumps them back to the starting circle. Landing on a teammate's peg sends them to their castle entrance.
- **Jumping:** Players may move their own pegs past the pegs of their opponents, but may not pass their own pegs.
- **Discard:** If a player has no playable moves, they must discard all five cards and draw a new hand as their turn.
- **Castle:** Only a player's own pegs may enter their own castle. Pegs in castles are safe from attacks of other players.

## License

This project is licensed under the MIT License - see the LICENSE file for details.

## Acknowledgments

- Original Joker Pursuit game creators
- All contributors to this digital implementation
