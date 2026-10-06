# 🧩 Multiplayer Web Scrabble

A full-stack browser-based Scrabble game featuring online multiplayer, user accounts, persistent game state, automatic scoring, and dictionary validation.

🎮 **Play online:**  
https://nour-mistrah.github.io/Scrabble-Game/

## 🚀 Features

- **Online Multiplayer** — Create and join games with up to 4 players.
- **User Accounts** — Register and log in with your own account.
- **Game Codes** — Create a game and share its short game code with other players.
- **Persistent Games** — Exit an active game and continue it later from the lobby.
- **Cross-Device Play** — Players can play together from different browsers and devices.
- **Turn Synchronization** — Moves, scores, and turns are synchronized between players.
- **Dictionary Validation** — Words are checked before being accepted.
- **Automatic Scoring** — Automatically calculates letter and word multipliers.
- **Bingo Bonus** — Awards 50 bonus points for using all 7 rack tiles.
- **Pass & Exchange** — Players can pass their turn or exchange tiles.
- **Scoreless Turn Limit** — The game ends after 6 consecutive scoreless turns.
- **Game Restoration** — Board, racks, scores, and current turn are restored when continuing a game.
- **Desktop & Mobile Support** — Supports mouse and touch-based gameplay.

## 🎮 How to Play

1. Visit the live game:  
   https://nour-mistrah.github.io/Scrabble-Game/
2. Create an account or log in.
3. From the lobby, create a new online game.
4. Choose the number of players.
5. Share the generated game code with the other players.
6. Other players log in and join using the game code.
7. Once all required players have joined, the game begins.
8. Place tiles from your rack onto the board.
9. The first word must cross the center ⭐ square.
10. Later words must connect to tiles already on the board.
11. Click **Submit** to validate your word and finish your turn.
12. Players can also **Pass** or **Exchange** tiles.
13. You can exit an active game and return to it later through **Your Games**.

## 🏗️ Architecture

The deployed application uses:

**GitHub Pages → Render → Aiven MySQL**

- **GitHub Pages** hosts the frontend.
- **Render** hosts the Node.js/Express backend.
- **Aiven** hosts the MySQL database.

## 💻 Tech Stack

### Frontend

- HTML5
- CSS3
- JavaScript (ES6+)
- Fetch API
- Async/Await
- Browser session storage

### Backend

- Node.js
- Express.js
- REST API
- JWT authentication
- bcrypt password hashing
- MySQL2

### Database

- MySQL
- User accounts
- Game sessions
- Game players
- Persistent multiplayer game state

### Deployment

- GitHub Pages — Frontend
- Render — Backend
- Aiven — MySQL database

## 🔐 Authentication

Passwords are hashed before being stored in the database.

Authenticated requests use JSON Web Tokens (JWT) to identify the logged-in user and protect authenticated API endpoints.

## 🗄️ Online Game Persistence

Online game state is stored in MySQL, allowing players to:

- Refresh the browser without losing the game.
- Exit an active game.
- Return to the lobby.
- Find active games under **Your Games**.
- Continue an existing game.
- Restore the board, racks, scores, and current turn.

## 📁 Project Structure

```text
Scrabble-Game/
├── index.html
├── scrabble.css
├── scrabble.js
├── scrabble-db.sql
├── README.md
└── backend/
    ├── server.js
    ├── db.js
    ├── authMiddleware.js
    ├── package.json
    └── package-lock.json
```

## 🌐 Live Application

Play the deployed version here:

https://nour-mistrah.github.io/Scrabble-Game/