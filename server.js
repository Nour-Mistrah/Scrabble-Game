require('dotenv').config();
const express = require('express');
const http = require('http');
const path = require('path');
const crypto = require('crypto');
const { Server } = require('socket.io');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('./db');
const dictionary = require('./dictionary');
const gameEngine = require('./gameEngine');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const JWT_SECRET = process.env.JWT_SECRET || 'scrabble_secret_jwt_key_2026';

const rooms = new Map();
const socketToRoom = new Map();

function generateRoomId() {
  return crypto.randomBytes(3).toString('hex').toUpperCase();
}

function authMiddleware(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Unauthorized' });
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ error: 'Invalid token' });
  }
}

function broadcastRoomState(roomId) {
  const game = rooms.get(roomId);
  if (!game) return;
  for (const player of game.players) {
    if (!player.socketId) continue;
    io.to(player.socketId).emit('gameState', gameEngine.sanitizeView(game, player.userId));
  }
}

function emitLobby(roomId) {
  const game = rooms.get(roomId);
  if (!game) return;
  io.to(`room:${roomId}`).emit('lobbyUpdate', {
    roomId,
    status: game.status,
    hostUserId: game.hostUserId,
    players: game.players.map((p) => ({ userId: p.userId, username: p.username })),
  });
}

app.get('/api/health', (req, res) => {
  res.json({ status: 'OK', message: 'Scrabble backend is running successfully!' });
});

app.post('/api/register', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) return res.status(400).json({ error: 'Missing fields' });
  if (username.length < 3 || username.length > 50) {
    return res.status(400).json({ error: 'Username must be 3–50 characters' });
  }
  if (password.length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters' });

  try {
    const hashedPassword = await bcrypt.hash(password, 10);
    const [result] = await db.execute('INSERT INTO users (username, password) VALUES (?, ?)', [
      username.trim(),
      hashedPassword,
    ]);
    res.json({ message: 'User registered successfully', userId: result.insertId });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') return res.status(400).json({ error: 'Username already taken' });
    console.error(err);
    res.status(500).json({ error: 'Database error' });
  }
});

app.post('/api/login', async (req, res) => {
  const { username, password } = req.body;
  try {
    const [rows] = await db.execute('SELECT * FROM users WHERE username = ?', [username.trim()]);
    const user = rows[0];
    if (!user || !(await bcrypt.compare(password, user.password))) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    const token = jwt.sign({ id: user.id, username: user.username }, JWT_SECRET, { expiresIn: '12h' });
    res.json({ token, username: user.username, userId: user.id });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Database error' });
  }
});

app.get('/api/me', authMiddleware, (req, res) => {
  res.json({ userId: req.user.id, username: req.user.username });
});

app.post('/api/dictionary/check', authMiddleware, async (req, res) => {
  const { word, words } = req.body;
  if (Array.isArray(words)) {
    const results = await dictionary.checkWords(words);
    return res.json({ results });
  }
  if (!word) return res.status(400).json({ error: 'Missing word' });
  const valid = await dictionary.checkWord(word);
  res.json({ valid, word: String(word).trim().toUpperCase() });
});

io.use((socket, next) => {
  const token = socket.handshake.auth?.token;
  if (!token) return next(new Error('Authentication required'));
  try {
    socket.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    next(new Error('Invalid token'));
  }
});

io.on('connection', (socket) => {
  const userId = socket.user.id;
  const username = socket.user.username;

  socket.on('createRoom', async (cb) => {
    try {
      let roomId = generateRoomId();
      while (rooms.has(roomId)) roomId = generateRoomId();

      const player = { userId, username, socketId: socket.id };
      const game = gameEngine.createGame(roomId, player);
      rooms.set(roomId, game);
      socketToRoom.set(socket.id, roomId);
      socket.join(`room:${roomId}`);

      try {
        await db.execute('INSERT INTO game_sessions (room_id, status) VALUES (?, ?)', [roomId, 'active']);
      } catch (e) {
        console.warn('Could not persist game session:', e.message);
      }

      emitLobby(roomId);
      if (typeof cb === 'function') cb({ ok: true, roomId });
    } catch (e) {
      if (typeof cb === 'function') cb({ error: 'Could not create room' });
    }
  });

  socket.on('joinRoom', (roomId, cb) => {
    const id = String(roomId || '').trim().toUpperCase();
    const game = rooms.get(id);
    if (!game) {
      if (typeof cb === 'function') cb({ error: 'Room not found' });
      return;
    }

    const existing = game.players.find((p) => p.userId === userId);
    if (existing) {
      existing.socketId = socket.id;
    } else {
      const result = gameEngine.addPlayer(game, { userId, username, socketId: socket.id });
      if (result.error) {
        if (typeof cb === 'function') cb({ error: result.error });
        return;
      }
    }

    socketToRoom.set(socket.id, id);
    socket.join(`room:${id}`);
    emitLobby(id);
    if (typeof cb === 'function') cb({ ok: true, roomId: id });
  });

  socket.on('startGame', (cb) => {
    const roomId = socketToRoom.get(socket.id);
    const game = rooms.get(roomId);
    if (!game) {
      if (typeof cb === 'function') cb({ error: 'Not in a room' });
      return;
    }
    if (game.hostUserId !== userId) {
      if (typeof cb === 'function') cb({ error: 'Only the host can start' });
      return;
    }
    const result = gameEngine.startGame(game);
    if (result.error) {
      if (typeof cb === 'function') cb({ error: result.error });
      return;
    }
    broadcastRoomState(roomId);
    io.to(`room:${roomId}`).emit('gameStarted');
    if (typeof cb === 'function') cb({ ok: true });
  });

  socket.on('placeTile', (payload, cb) => {
    const roomId = socketToRoom.get(socket.id);
    const game = rooms.get(roomId);
    if (!game) return cb?.({ error: 'Not in a room' });
    const result = gameEngine.placePendingTile(game, userId, payload);
    if (result.error) return cb?.({ error: result.error });
    broadcastRoomState(roomId);
    cb?.({ ok: true });
  });

  socket.on('removeTile', (idx, cb) => {
    const roomId = socketToRoom.get(socket.id);
    const game = rooms.get(roomId);
    if (!game) return cb?.({ error: 'Not in a room' });
    const result = gameEngine.removePendingTile(game, userId, idx);
    if (result.error) return cb?.({ error: result.error });
    broadcastRoomState(roomId);
    cb?.({ ok: true });
  });

  socket.on('submitWord', async (cb) => {
    const roomId = socketToRoom.get(socket.id);
    const game = rooms.get(roomId);
    if (!game) return cb?.({ error: 'Not in a room' });
    const result = await gameEngine.submitPending(game, userId, dictionary.checkWord);
    if (result.error) {
      broadcastRoomState(roomId);
      return cb?.({ error: result.error });
    }
    broadcastRoomState(roomId);
    if (result.gameOver) {
      io.to(`room:${roomId}`).emit('gameOver', { message: result.message });
      db.execute('UPDATE game_sessions SET status = ? WHERE room_id = ?', ['completed', roomId]).catch(() => {});
    }
    cb?.({ ok: true, ...result });
  });

  socket.on('passTurn', (cb) => {
    const roomId = socketToRoom.get(socket.id);
    const game = rooms.get(roomId);
    if (!game) return cb?.({ error: 'Not in a room' });
    const result = gameEngine.passTurn(game, userId);
    if (result.error) return cb?.({ error: result.error });
    broadcastRoomState(roomId);
    if (result.gameOver) io.to(`room:${roomId}`).emit('gameOver', { message: result.message });
    cb?.({ ok: true });
  });

  socket.on('exchangeTiles', (rackIndices, cb) => {
    const roomId = socketToRoom.get(socket.id);
    const game = rooms.get(roomId);
    if (!game) return cb?.({ error: 'Not in a room' });
    const result = gameEngine.exchangeTiles(game, userId, rackIndices);
    if (result.error) return cb?.({ error: result.error });
    broadcastRoomState(roomId);
    if (result.gameOver) io.to(`room:${roomId}`).emit('gameOver', { message: result.message });
    cb?.({ ok: true });
  });

  socket.on('leaveRoom', () => {
    const roomId = socketToRoom.get(socket.id);
    if (!roomId) return;
    socket.leave(`room:${roomId}`);
    socketToRoom.delete(socket.id);
    const game = rooms.get(roomId);
    if (game) {
      const p = game.players.find((pl) => pl.userId === userId);
      if (p) p.socketId = null;
      if (game.status === 'waiting') {
        game.players = game.players.filter((pl) => pl.userId !== userId);
        if (game.players.length === 0) rooms.delete(roomId);
        else {
          if (game.hostUserId === userId) game.hostUserId = game.players[0].userId;
          emitLobby(roomId);
        }
      }
    }
  });

  socket.on('disconnect', () => {
    const roomId = socketToRoom.get(socket.id);
    socketToRoom.delete(socket.id);
    if (!roomId) return;
    const game = rooms.get(roomId);
    if (!game) return;
    const p = game.players.find((pl) => pl.userId === userId);
    if (p) p.socketId = null;
  });
});

app.get('/{*splat}', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`Scrabble server running at http://localhost:${PORT}`);
});
