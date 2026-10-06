const express = require("express");
const cors = require("cors");
const db = require("./db");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const app = express();
const authenticateToken = require("./authMiddleware");
const gameStates = new Map();

const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

app.get("/", (req, res) => {
    res.json({
        message: "Scrabble backend is running!"
    });
});

app.get("/api/test", (req, res) => {
    res.json({
        success: true,
        message: "API is working!"
    });
});

app.get("/api/db-test", async (req, res) => {
    try {
        const [rows] = await db.query("SELECT 1 AS result");

        res.json({
            success: true,
            message: "MySQL connection works!",
            result: rows[0].result
        });
    } catch (error) {
        console.error(error);

        res.status(500).json({
            success: false,
            message: "MySQL connection failed"
        });
    }
});

app.get("/api/users-test", async (req, res) => {
    try {
        const [rows] = await db.query(
            "SELECT id, username, created_at FROM users"
        );

        res.json({
            success: true,
            users: rows
        });
    } catch (error) {
        console.error(error);

        res.status(500).json({
            success: false,
            message: "Could not read users table"
        });
    }
});

app.post("/api/register", async (req, res) => {
    try {
        const { username, password } = req.body;

        if (!username || !password) {
            return res.status(400).json({
                success: false,
                message: "Username and password are required"
            });
        }

        const [existingUsers] = await db.query(
            "SELECT id FROM users WHERE username = ?",
            [username]
        );

        if (existingUsers.length > 0) {
            return res.status(409).json({
                success: false,
                message: "Username already exists"
            });
        }

        const hashedPassword = await bcrypt.hash(password, 10);

        const [result] = await db.query(
    "INSERT INTO users (username, password) VALUES (?, ?)",
    [username, hashedPassword]
);

        res.status(201).json({
            success: true,
            message: "User registered successfully",
            userId: result.insertId
        });

    } catch (error) {
        console.error(error);

        res.status(500).json({
            success: false,
            message: "Registration failed"
        });
    }
    
});

app.post("/api/login", async (req, res) => {
    try {
        const { username, password } = req.body;

        if (!username || !password) {
            return res.status(400).json({
                success: false,
                message: "Username and password are required"
            });
        }

        const [users] = await db.query(
            "SELECT id, username, password FROM users WHERE username = ?",
            [username]
        );

        if (users.length === 0) {
            return res.status(401).json({
                success: false,
                message: "Invalid username or password"
            });
        }

        const user = users[0];

        const passwordMatches = await bcrypt.compare(
            password,
            user.password
        );

        if (!passwordMatches) {
            return res.status(401).json({
                success: false,
                message: "Invalid username or password"
            });
        }

        const token = jwt.sign(
    {
        userId: user.id,
        username: user.username
    },
    process.env.JWT_SECRET,
    {
        expiresIn: "1h"
    }
);

res.json({
    success: true,
    message: "Login successful",
    token: token,
    user: {
        id: user.id,
        username: user.username
    }
});

    } catch (error) {
        console.error(error);

        res.status(500).json({
            success: false,
            message: "Login failed"
        });
    }
});

app.get("/api/profile", authenticateToken, async (req, res) => {
    try {
        const [users] = await db.query(
            "SELECT id, username, created_at FROM users WHERE id = ?",
            [req.user.userId]
        );

        if (users.length === 0) {
            return res.status(404).json({
                success: false,
                message: "User not found"
            });
        }

        res.json({
            success: true,
            user: users[0]
        });
    } catch (error) {
        console.error(error);

        res.status(500).json({
            success: false,
            message: "Could not get profile"
        });
    }
});

// Create a new game session
app.post("/api/game-sessions", authenticateToken, async (req, res) => {
  try {
    const { requiredPlayers } = req.body;

    // Validate the number of players
    const playerCount = Number(requiredPlayers);

    if (![2, 3, 4].includes(playerCount)) {
      return res.status(400).json({
        success: false,
        message: "Number of players must be 2, 3, or 4."
      });
    }

    // Create a unique room ID
    const roomId =
      "room-" +
      Date.now() +
      "-" +
      Math.random().toString(36).substring(2, 8);

      const gameCode =
  Math.random()
    .toString(36)
    .substring(2, 7)
    .toUpperCase();

    // Save the game session
   const [result] = await db.query(
  `INSERT INTO game_sessions
   (
     room_id,
     game_code,
     status,
     host_user_id,
     required_players
   )
   VALUES (?, ?, ?, ?, ?)`,
  [
    roomId,
    gameCode,
    "active",
    req.user.userId,
    playerCount
  ]
);

    // Add the host as the first player
    await db.query(
      `INSERT INTO game_players
       (game_session_id, user_id)
       VALUES (?, ?)`,
      [
        result.insertId,
        req.user.userId
      ]
    );

res.status(201).json({
  success: true,
  gameSession: {
  id: result.insertId,
  roomId,
  gameCode,
  status: "active",
  hostUserId: req.user.userId,
  requiredPlayers: playerCount,
  playerNumber: 1
}
});

  } catch (error) {
    console.error("Create game session error:", error);

    res.status(500).json({
      success: false,
      message: "Failed to create game session."
    });
  }
});


app.get(
  "/api/game-sessions/code/:gameCode",
  authenticateToken,
  async (req, res) => {
    try {
      const gameCode =
        req.params.gameCode
          .trim()
          .toUpperCase();

      const [sessions] = await db.query(
        `SELECT
            id,
            room_id,
            game_code,
            status,
            host_user_id,
            required_players
         FROM game_sessions
         WHERE game_code = ?`,
        [gameCode]
      );

      if (sessions.length === 0) {
        return res.status(404).json({
          success: false,
          message: "Game code not found."
        });
      }

      const gameSession =
        sessions[0];

      if (gameSession.status !== "active") {
        return res.status(400).json({
          success: false,
          message:
            "This game is no longer active."
        });
      }

      return res.json({
        success: true,
        gameSession: {
          id: gameSession.id,
          roomId: gameSession.room_id,
          gameCode: gameSession.game_code,
          status: gameSession.status,
          hostUserId:
            Number(gameSession.host_user_id),
          requiredPlayers:
            Number(gameSession.required_players)
        }
      });

    } catch (error) {
      console.error(
        "Find game by code error:",
        error
      );

      return res.status(500).json({
        success: false,
        message:
          "Could not find the game."
      });
    }
  }
);

// Join an existing game session
// Join an existing game session
app.post(
  "/api/game-sessions/:roomId/join",
  authenticateToken,
  async (req, res) => {
    try {
      const { roomId } = req.params;
      const userId = req.user.userId;

      // 1. Find the room
      const [sessions] = await db.query(
        `SELECT
            id,
            room_id,
            status,
            host_user_id,
            required_players
         FROM game_sessions
         WHERE room_id = ?`,
        [roomId]
      );

      if (sessions.length === 0) {
        return res.status(404).json({
          success: false,
          message: "Room not found."
        });
      }

      const gameSession = sessions[0];

      // 2. Make sure the room is active
      if (gameSession.status !== "active") {
        return res.status(400).json({
          success: false,
          message: "This game is no longer active."
        });
      }

      // 3. Check whether this user is already in the room
      const [existingPlayers] = await db.query(
        `SELECT id
         FROM game_players
         WHERE game_session_id = ?
         AND user_id = ?`,
        [
          gameSession.id,
          userId
        ]
      );

      // If already in the room, return their existing player number
      // instead of inserting them again.
      if (existingPlayers.length > 0) {
        const [roomPlayers] = await db.query(
          `SELECT user_id
           FROM game_players
           WHERE game_session_id = ?
           ORDER BY id ASC`,
          [gameSession.id]
        );

        const playerIndex =
          roomPlayers.findIndex(
            player =>
              Number(player.user_id) ===
              Number(userId)
          );

        const playerNumber =
          playerIndex + 1;

        return res.status(200).json({
          success: true,
          message: "Rejoined game session.",
          gameSession: {
            id: gameSession.id,
            roomId: gameSession.room_id,
            status: gameSession.status,
            hostUserId: gameSession.host_user_id,
            requiredPlayers: gameSession.required_players,
            playerNumber: playerNumber
          },
          playerCount: roomPlayers.length
        });
      }

      // 4. Count players currently in the room
      const [countRows] = await db.query(
        `SELECT COUNT(*) AS playerCount
         FROM game_players
         WHERE game_session_id = ?`,
        [gameSession.id]
      );

      const currentPlayerCount =
        Number(countRows[0].playerCount);

      // 5. Prevent players from joining a full room
      if (
        currentPlayerCount >=
        gameSession.required_players
      ) {
        return res.status(409).json({
          success: false,
          message: "This room is full."
        });
      }

      // 6. Add the new player
      await db.query(
        `INSERT INTO game_players
         (game_session_id, user_id)
         VALUES (?, ?)`,
        [
          gameSession.id,
          userId
        ]
      );

      // Because players are inserted in order,
      // the new count is this player's number.
      const newPlayerCount =
        currentPlayerCount + 1;

      const playerNumber =
        newPlayerCount;

      console.log(
        `Player ${userId} joined ${roomId}. ` +
        `${newPlayerCount}/${gameSession.required_players} players.`
      );

      return res.status(200).json({
        success: true,
        message: "Joined game session.",
        gameSession: {
          id: gameSession.id,
          roomId: gameSession.room_id,
          status: gameSession.status,
          hostUserId: gameSession.host_user_id,
          requiredPlayers: gameSession.required_players,
          playerNumber: playerNumber
        },
        playerCount: newPlayerCount
      });

    } catch (error) {
      console.error(
        "Join game session error:",
        error
      );

      return res.status(500).json({
        success: false,
        message: "Failed to join game session."
      });
    }
  }
);

// Get players in a game session
app.get("/api/game-sessions/:roomId/players", authenticateToken, async (req, res) => {
    try {
        const { roomId } = req.params;
const [rows] = await db.query(
    `
    SELECT users.id, users.username
    FROM game_players
    JOIN game_sessions
        ON game_players.game_session_id = game_sessions.id
    JOIN users
        ON game_players.user_id = users.id
    WHERE game_sessions.room_id = ?
    ORDER BY game_players.id ASC
    `,
    [roomId]
);

        if (rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: "Game session not found"
            });
        }

        res.json({
            success: true,
            players: rows
        });

    } catch (error) {
        console.error(error);

        res.status(500).json({
            success: false,
            message: "Could not get game players"
        });
    }
});

// Get shared game state
app.get(
    "/api/game-sessions/:roomId/state",
    authenticateToken,
    async (req, res) => {
        try {
            const { roomId } = req.params;

            // Get the room, including its permanently saved game state.
            const [sessions] = await db.query(
                `SELECT
                    id,
                    room_id,
                    status,
                    host_user_id,
                    required_players,
                    game_state
                 FROM game_sessions
                 WHERE room_id = ?`,
                [roomId]
            );

            if (sessions.length === 0) {
                return res.status(404).json({
                    success: false,
                    message: "Room not found."
                });
            }

            const gameSession = sessions[0];
            const userId = req.user.userId;

            // Get all players in their stable join order.
            const [roomPlayers] = await db.query(
                `SELECT user_id
                 FROM game_players
                 WHERE game_session_id = ?
                 ORDER BY id ASC`,
                [gameSession.id]
            );

            const playerIndex =
                roomPlayers.findIndex(
                    player =>
                        Number(player.user_id) ===
                        Number(userId)
                );

            if (playerIndex === -1) {
                return res.status(403).json({
                    success: false,
                    message:
                        "You are not a player in this room."
                });
            }

            const playerNumber =
                playerIndex + 1;

            // First try the fast in-memory state.
            let state =
                gameStates.get(roomId);

            // If Node was restarted, the Map will be empty.
            // Restore the state from MySQL instead.
            if (!state && gameSession.game_state) {

                state = gameSession.game_state;

                // Depending on mysql2/MySQL configuration,
                // JSON may already be an object or may be a string.
                if (typeof state === "string") {
                    state = JSON.parse(state);
                }

                // Put it back into memory so future syncing is fast.
                gameStates.set(
                    roomId,
                    state
                );

                console.log(
                    "Game state restored from MySQL for room:",
                    roomId
                );
            }

            // Room exists but no game state has ever been created.
            if (!state) {
                return res.status(200).json({
                    success: true,
                    gameStarted: false,
                    playerNumber: playerNumber,
                    state: null,
                    gameSession: {
                        id: gameSession.id,
                        roomId:
                            gameSession.room_id,
                        status:
                            gameSession.status,
                        hostUserId:
                            gameSession.host_user_id,
                        requiredPlayers:
                            gameSession.required_players
                    }
                });
            }

            // Room exists and has a shared game state.
            return res.status(200).json({
                success: true,
                gameStarted: true,
                playerNumber: playerNumber,
                state: state,
                gameSession: {
                    id: gameSession.id,
                    roomId:
                        gameSession.room_id,
                    status:
                        gameSession.status,
                    hostUserId:
                        gameSession.host_user_id,
                    requiredPlayers:
                        gameSession.required_players
                }
            });

        } catch (error) {
            console.error(
                "Get game state error:",
                error
            );

            return res.status(500).json({
                success: false,
                message:
                    "Could not get game state."
            });
        }
    }
);

// Save shared game state
app.post(
    "/api/game-sessions/:roomId/state",
    authenticateToken,
    async (req, res) => {
        try {

            const { roomId } = req.params;
            const state = req.body;

            if (!state) {
                return res.status(400).json({
                    success: false,
                    message: "Game state is required"
                });
            }

            const incomingVersion =
                Number(state.onlineStateVersion);

            if (
                !Number.isInteger(incomingVersion) ||
                incomingVersion < 1
            ) {
                return res.status(400).json({
                    success: false,
                    message: "Invalid game state version."
                });
            }

            // Save only if this state is newer than
            // the version currently stored in MySQL.
            const [result] = await db.query(
                `UPDATE game_sessions
                 SET game_state = ?,
                     state_version = ?
                 WHERE room_id = ?
                 AND state_version < ?`,
                [
                    JSON.stringify(state),
                    incomingVersion,
                    roomId,
                    incomingVersion
                ]
            );

            if (result.affectedRows === 0) {

                // Find out whether the room is missing
                // or this was simply an old/stale state.
                const [sessions] = await db.query(
                    `SELECT state_version
                     FROM game_sessions
                     WHERE room_id = ?`,
                    [roomId]
                );

                if (sessions.length === 0) {
                    return res.status(404).json({
                        success: false,
                        message: "Room not found."
                    });
                }

                return res.status(409).json({
                    success: false,
                    message:
                        "This game state is older than the current server state.",
                    currentVersion:
                        Number(
                            sessions[0].state_version
                        )
                });
            }

            // Update memory only AFTER MySQL accepted
            // this version.
            gameStates.set(roomId, state);

            console.log(
                "Game state saved for room:",
                roomId,
                "version:",
                incomingVersion
            );

            return res.json({
                success: true,
                message: "Game state saved",
                version: incomingVersion
            });

        } catch (error) {

            console.error(
                "Save game state error:",
                error
            );

            return res.status(500).json({
                success: false,
                message: "Could not save game state"
            });
        }
    }
);

app.delete(
    "/api/game-sessions/:roomId",
    authenticateToken,
    async (req, res) => {
        try {
            const { roomId } = req.params;
            const userId = req.user.userId;

            const [sessions] = await db.query(
                `SELECT
                    id,
                    host_user_id,
                    game_state
                 FROM game_sessions
                 WHERE room_id = ?`,
                [roomId]
            );

            if (sessions.length === 0) {
                return res.status(404).json({
                    success: false,
                    message: "Room not found."
                });
            }

            const gameSession = sessions[0];

            // Only the host can cancel the waiting room.
            if (
                Number(gameSession.host_user_id) !==
                Number(userId)
            ) {
                return res.status(403).json({
                    success: false,
                    message:
                        "Only the host can cancel this room."
                });
            }

            // Do not use this endpoint to delete a game
            // that has already started.
            if (gameSession.game_state) {
                return res.status(400).json({
                    success: false,
                    message:
                        "The game has already started."
                });
            }

            // Remove players first because they reference
            // the game session.
            await db.query(
                `DELETE FROM game_players
                 WHERE game_session_id = ?`,
                [gameSession.id]
            );

            await db.query(
                `DELETE FROM game_sessions
                 WHERE id = ?`,
                [gameSession.id]
            );

            // Clean up any accidental in-memory state too.
            gameStates.delete(roomId);

            console.log(
                "Waiting room cancelled:",
                roomId
            );

            return res.json({
                success: true,
                message: "Waiting room cancelled."
            });

        } catch (error) {
            console.error(
                "Cancel waiting room error:",
                error
            );

            return res.status(500).json({
                success: false,
                message:
                    "Could not cancel waiting room."
            });
        }
    }
);

app.get(
    "/api/my-games",
    authenticateToken,
    async (req, res) => {
        try {
            const userId =
                req.user.userId;

            const [games] =
                await db.query(
                    `SELECT
                        gs.id,
                        gs.game_code,
                        gs.room_id,
                        gs.status,
                        gs.host_user_id,
                        gs.required_players,
                        gs.created_at,
                        gs.game_state,
                        gp.id AS membership_id
                     FROM game_players gp
                     INNER JOIN game_sessions gs
                        ON gs.id = gp.game_session_id
                     WHERE gp.user_id = ?
                     ORDER BY gs.created_at DESC`,
                    [userId]
                );

            const result = [];

            for (const game of games) {

                let state =
                    game.game_state;

                if (
                    state &&
                    typeof state === "string"
                ) {
                    try {
                        state =
                            JSON.parse(state);
                    } catch {
                        state = null;
                    }
                }

                let currentPlayer = null;
                let gameOver = false;

                if (state) {
                    currentPlayer =
                        Number(
                            state.currentPlayer
                        ) || null;

                    gameOver =
                        Boolean(
                            state.gameOver
                        );
                }

                // Get all players in their stable
                // player-number order.
                const [playerRows] =
                    await db.query(
                        `SELECT
                            gp.user_id,
                            u.username
                         FROM game_players gp
                         INNER JOIN users u
                            ON u.id = gp.user_id
                         WHERE gp.game_session_id = ?
                         ORDER BY gp.id ASC`,
                        [game.id]
                    );

                const players =
                    playerRows.map(
                        (player, index) => ({
                            userId:
                                Number(
                                    player.user_id
                                ),

                            username:
                                player.username,

                            playerNumber:
                                index + 1
                        })
                    );

                const myPlayer =
                    players.find(
                        player =>
                            Number(
                                player.userId
                            ) ===
                            Number(userId)
                    );

                result.push({
                    id:
                        game.id,

                    roomId:
                        game.room_id,

                    status:
                        game.status,

                    hostUserId:
                        Number(
                            game.host_user_id
                        ),

                    requiredPlayers:
                        Number(
                            game.required_players
                        ),

                    createdAt:
                        game.created_at,

                    gameStarted:
                        Boolean(state),

                    currentPlayer:
                        currentPlayer,

                    gameOver:
                        gameOver,

                    playerCount:
                        players.length,

                    playerNumber:
                        myPlayer
                            ? myPlayer.playerNumber
                            : null,

                    players:
                        players
                });
            }

            return res.json({
                success: true,
                games: result
            });

        } catch (error) {

            console.error(
                "Get my games error:",
                error
            );

            return res.status(500).json({
                success: false,
                message:
                    "Could not get your games."
            });
        }
    }
);

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});