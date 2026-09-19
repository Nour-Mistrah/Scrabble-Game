const distribution = {
  A: 9, B: 2, C: 2, D: 4, E: 12, F: 2, G: 3, H: 2, I: 9,
  J: 1, K: 1, L: 4, M: 2, N: 6, O: 8, P: 2, Q: 1, R: 6,
  S: 4, T: 6, U: 4, V: 2, W: 2, X: 1, Y: 2, Z: 1,
  '?': 2,
};

const letterValues = {
  A: 1, B: 3, C: 3, D: 2, E: 1, F: 4, G: 2, H: 4, I: 1,
  J: 8, K: 5, L: 1, M: 3, N: 1, O: 1, P: 3, Q: 10, R: 1,
  S: 1, T: 1, U: 1, V: 4, W: 4, X: 8, Y: 4, Z: 10,
  '?': 0,
};

const tw = [0, 7, 14, 105, 119, 210, 217, 224];
const dw = [16, 28, 32, 42, 48, 56, 64, 70, 154, 160, 168, 176, 182, 192, 196, 208];
const tl = [20, 24, 76, 80, 84, 88, 136, 140, 144, 148, 200, 204];
const dl = [3, 11, 36, 38, 45, 52, 59, 92, 96, 98, 102, 108, 116, 122, 126, 128, 132, 165, 172, 179, 186, 188, 213, 221];

const MAX_SCORELESS_TURNS = 6;

const idxToRC = (idx) => ({ r: Math.floor(idx / 15), c: idx % 15 });
const rcToIdx = (r, c) => r * 15 + c;
const inBounds = (r, c) => r >= 0 && r < 15 && c >= 0 && c < 15;

function createBag() {
  const bag = [];
  for (const letter of Object.keys(distribution)) {
    for (let i = 0; i < distribution[letter]; i++) bag.push(letter);
  }
  return bag;
}

function drawFromBag(bag) {
  if (bag.length === 0) return null;
  const i = Math.floor(Math.random() * bag.length);
  return bag.splice(i, 1)[0];
}

function fillRack(bag, rack) {
  while (rack.length < 7 && bag.length > 0) {
    rack.push(drawFromBag(bag));
  }
}

function createEmptyBoard() {
  return Array.from({ length: 225 }, () => null);
}

function createGame(roomId, hostPlayer) {
  const bag = createBag();
  const game = {
    roomId,
    status: 'waiting',
    maxPlayers: 4,
    players: [hostPlayer],
    hostUserId: hostPlayer.userId,
    currentPlayerIndex: 0,
    tileBag: bag,
    board: createEmptyBoard(),
    racks: [[]],
    scores: [0],
    history: [[]],
    consecutiveScorelessTurns: 0,
    gameOver: false,
    pendingPlacements: [],
  };
  fillRack(game.tileBag, game.racks[0]);
  return game;
}

function addPlayer(game, player) {
  if (game.status !== 'waiting') return { error: 'Game already started' };
  if (game.players.length >= game.maxPlayers) return { error: 'Room is full' };
  if (game.players.some((p) => p.userId === player.userId)) return { error: 'Already in room' };

  game.players.push(player);
  game.racks.push([]);
  game.scores.push(0);
  game.history.push([]);
  fillRack(game.tileBag, game.racks[game.racks.length - 1]);
  return { ok: true };
}

function startGame(game) {
  if (game.players.length < 2) return { error: 'Need at least 2 players' };
  game.status = 'active';
  game.currentPlayerIndex = 0;
  return { ok: true };
}

function getSquareType(idx) {
  if (tw.includes(idx)) return 'tw';
  if (dw.includes(idx)) return 'dw';
  if (tl.includes(idx)) return 'tl';
  if (dl.includes(idx)) return 'dl';
  if (idx === 112) return 'star';
  return 'normal';
}

function hasTile(board, idx) {
  return board[idx] !== null;
}

function getTileLetter(board, idx) {
  const cell = board[idx];
  if (!cell) return '';
  return cell.display;
}

function isBlankTile(board, idx) {
  return board[idx]?.isBlank === true;
}

function getWordFrom(board, idx, dr, dc) {
  const { r, c } = idxToRC(idx);
  let sr = r;
  let sc = c;
  while (inBounds(sr - dr, sc - dc) && hasTile(board, rcToIdx(sr - dr, sc - dc))) {
    sr -= dr;
    sc -= dc;
  }
  let letters = '';
  const indices = [];
  let cr = sr;
  let cc = sc;
  while (inBounds(cr, cc) && hasTile(board, rcToIdx(cr, cc))) {
    const i = rcToIdx(cr, cc);
    letters += getTileLetter(board, i);
    indices.push(i);
    cr += dr;
    cc += dc;
  }
  return { word: letters, indices };
}

function scoreWord(board, wordIndices) {
  let base = 0;
  let wordMult = 1;
  for (const idx of wordIndices) {
    const letter = getTileLetter(board, idx).toUpperCase();
    let val = isBlankTile(board, idx) ? 0 : (letterValues[letter] || 0);
    const cell = board[idx];
    const isNew = cell && !cell.locked;
    if (isNew) {
      const sqType = getSquareType(idx);
      if (sqType === 'dl') val *= 2;
      else if (sqType === 'tl') val *= 3;
      if (sqType === 'dw' || sqType === 'star') wordMult *= 2;
      else if (sqType === 'tw') wordMult *= 3;
    }
    base += val;
  }
  return base * wordMult;
}

function buildEffectiveBoard(game) {
  const board = game.board.map((c) => (c ? { ...c } : null));
  for (const p of game.pendingPlacements) {
    board[p.idx] = {
      display: p.display,
      rackLetter: p.rackLetter,
      isBlank: p.isBlank,
      locked: false,
    };
  }
  return board;
}

function isFirstMove(game) {
  return game.board.every((c) => c === null);
}

function getLockedBoardIndices(board) {
  const s = new Set();
  for (let i = 0; i < 225; i++) {
    if (board[i]?.locked) s.add(i);
  }
  return s;
}

function newTileIndicesFromPending(pending) {
  return pending.map((p) => p.idx);
}

function touchesLocked(board, newIdxs) {
  return newIdxs.some((idx) => {
    const { r, c } = idxToRC(idx);
    const neigh = [[r - 1, c], [r + 1, c], [r, c - 1], [r, c + 1]].filter(([rr, cc]) => inBounds(rr, cc));
    return neigh.some(([rr, cc]) => board[rcToIdx(rr, cc)]?.locked);
  });
}

function rackPointSum(rack) {
  return rack.reduce((sum, ch) => sum + (letterValues[ch] ?? 0), 0);
}

function endGameAdjustScores(game, wentOutPlayerIdx) {
  const leftovers = game.racks.map((r) => rackPointSum(r));
  const totalLeftover = leftovers.reduce((a, b) => a + b, 0);
  for (let i = 0; i < game.players.length; i++) {
    game.scores[i] -= leftovers[i];
  }
  if (wentOutPlayerIdx !== null) {
    game.scores[wentOutPlayerIdx] += totalLeftover - leftovers[wentOutPlayerIdx];
  }
  game.gameOver = true;
  game.status = 'completed';
}

function findPlayerIndex(game, userId) {
  return game.players.findIndex((p) => p.userId === userId);
}

function placePendingTile(game, userId, { idx, rackIndex, blankAs }) {
  if (game.gameOver || game.status !== 'active') return { error: 'Game not active' };
  const pi = findPlayerIndex(game, userId);
  if (pi !== game.currentPlayerIndex) return { error: 'Not your turn' };
  if (idx < 0 || idx > 224) return { error: 'Invalid square' };
  if (game.board[idx] !== null) return { error: 'Square occupied' };
  if (game.pendingPlacements.some((p) => p.idx === idx)) return { error: 'Already placed here' };

  const rack = game.racks[pi];
  if (rackIndex < 0 || rackIndex >= rack.length) return { error: 'Invalid rack tile' };

  const rackLetter = rack[rackIndex];
  let display = rackLetter;
  let isBlank = false;
  if (rackLetter === '?') {
    const letter = String(blankAs || '').toUpperCase();
    if (!/^[A-Z]$/.test(letter)) return { error: 'Invalid blank letter' };
    display = letter;
    isBlank = true;
  }

  const effective = buildEffectiveBoard(game);
  const pendingIdxs = game.pendingPlacements.map((p) => p.idx);
  const boardHasAny = game.board.some(Boolean) || pendingIdxs.length > 0;
  if (!boardHasAny && idx !== 112) return { error: 'Start on the star!' };

  if (pendingIdxs.length > 0) {
    const allIdxs = [...pendingIdxs, idx];
    const first = idxToRC(allIdxs[0]);
    const target = idxToRC(idx);
    if (allIdxs.length === 1) {
      if (first.r !== target.r && first.c !== target.c) return { error: 'Play in a straight line!' };
    } else {
      const second = idxToRC(allIdxs[1]);
      const isHoriz = first.r === second.r;
      if (isHoriz && target.r !== first.r) return { error: 'Stay in the row!' };
      if (!isHoriz && target.c !== first.c) return { error: 'Stay in the column!' };
    }
  }

  rack.splice(rackIndex, 1);
  game.pendingPlacements.push({ idx, display, rackLetter, isBlank, rackIndexUsed: rackIndex });
  return { ok: true, board: effective };
}

function removePendingTile(game, userId, idx) {
  if (game.gameOver || game.status !== 'active') return { error: 'Game not active' };
  const pi = findPlayerIndex(game, userId);
  if (pi !== game.currentPlayerIndex) return { error: 'Not your turn' };

  const placementIdx = game.pendingPlacements.findIndex((p) => p.idx === idx);
  if (placementIdx === -1) return { error: 'No tile there' };

  const p = game.pendingPlacements.splice(placementIdx, 1)[0];
  game.racks[pi].push(p.rackLetter);
  return { ok: true };
}

function clearPendingToRack(game) {
  const pi = game.currentPlayerIndex;
  for (const p of game.pendingPlacements) {
    game.racks[pi].push(p.rackLetter);
  }
  game.pendingPlacements = [];
}

async function submitPending(game, userId, isWordValidFn) {
  if (game.gameOver || game.status !== 'active') return { error: 'Game not active' };
  const pi = findPlayerIndex(game, userId);
  if (pi !== game.currentPlayerIndex) return { error: 'Not your turn' };

  const pending = game.pendingPlacements;
  if (pending.length === 0) return { error: 'No tiles placed' };

  const board = buildEffectiveBoard(game);
  const newIdxs = newTileIndicesFromPending(pending);
  const firstMove = isFirstMove(game);

  if (firstMove && !newIdxs.includes(112)) {
    clearPendingToRack(game);
    return { error: 'First move must cover the star!' };
  }

  let mainDr = 0;
  let mainDc = 1;
  let main = null;
  let extraSingleTileWord = null;

  if (newIdxs.length > 1) {
    const a = idxToRC(newIdxs[0]);
    const sameRow = newIdxs.every((i) => idxToRC(i).r === a.r);
    const sameCol = newIdxs.every((i) => idxToRC(i).c === a.c);
    if (!sameRow && !sameCol) {
      clearPendingToRack(game);
      return { error: 'Play in a straight line!' };
    }
    if (sameCol) {
      mainDr = 1;
      mainDc = 0;
    }
    main = getWordFrom(board, newIdxs[0], mainDr, mainDc);
    if (main.word.length < 2) {
      clearPendingToRack(game);
      return { error: 'Words must be 2+ letters.' };
    }
  } else {
    const idx = newIdxs[0];
    const horiz = getWordFrom(board, idx, 0, 1);
    const vert = getWordFrom(board, idx, 1, 0);
    const horizOk = horiz.word.length >= 2;
    const vertOk = vert.word.length >= 2;
    if (!horizOk && !vertOk) {
      clearPendingToRack(game);
      return { error: 'Words must be 2+ letters.' };
    }
    const horizWord = horizOk ? horiz : null;
    const vertWord = vertOk ? vert : null;
    const [horizValid, vertValid] = await Promise.all([
      horizWord ? isWordValidFn(horizWord.word) : Promise.resolve(false),
      vertWord ? isWordValidFn(vertWord.word) : Promise.resolve(false),
    ]);
    if (!horizValid && !vertValid) {
      clearPendingToRack(game);
      return { error: 'Neither horizontal nor vertical word is valid.' };
    }
    if (horizValid && vertValid) {
      const lockedBeforePick = getLockedBoardIndices(game.board);
      const hReuse = horizWord.indices.some((i) => lockedBeforePick.has(i));
      const vReuse = vertWord.indices.some((i) => lockedBeforePick.has(i));
      if (vReuse && !hReuse) {
        mainDr = 1;
        mainDc = 0;
        main = vertWord;
        extraSingleTileWord = horizWord;
      } else {
        main = horizWord;
        extraSingleTileWord = vertWord;
      }
    } else if (horizValid) {
      main = horizWord;
      if (vertWord) extraSingleTileWord = vertWord;
    } else {
      mainDr = 1;
      mainDc = 0;
      main = vertWord;
      if (horizWord) extraSingleTileWord = horizWord;
    }
  }

  if (!firstMove && !touchesLocked(board, newIdxs)) {
    clearPendingToRack(game);
    return { error: 'Connect to an existing word!' };
  }

  const mainSet = new Set(main.indices);
  if (!newIdxs.every((i) => mainSet.has(i))) {
    clearPendingToRack(game);
    return { error: 'All placed tiles must be part of one contiguous word.' };
  }

  const crossDr = mainDr === 0 ? 1 : 0;
  const crossDc = mainDr === 1 ? 0 : 1;
  const wordsFormed = [main];
  if (extraSingleTileWord) wordsFormed.push(extraSingleTileWord);
  for (const idx of newIdxs) {
    const w = getWordFrom(board, idx, crossDr, crossDc);
    if (w.word.length >= 2) wordsFormed.push(w);
  }

  const uniqueWords = [];
  const seen = new Set();
  for (const w of wordsFormed) {
    const key = w.indices.join(',');
    if (seen.has(key)) continue;
    seen.add(key);
    uniqueWords.push(w);
  }

  if (!firstMove) {
    const lockedBefore = getLockedBoardIndices(game.board);
    const mainUsesBoard = main.indices.some((idx) => lockedBefore.has(idx));
    const extraUsesBoard =
      extraSingleTileWord && extraSingleTileWord.indices.some((idx) => lockedBefore.has(idx));
    if (!mainUsesBoard && !extraUsesBoard) {
      clearPendingToRack(game);
      return {
        error:
          'Your play must cross an existing word—use at least one letter already on the board along your main line.',
      };
    }
  }

  const mainOk = await isWordValidFn(main.word);
  if (!mainOk) {
    clearPendingToRack(game);
    return { error: `"${main.word}" is invalid!` };
  }

  let turnScore = 0;
  const mainKey = main.indices.join(',');
  turnScore += scoreWord(board, main.indices);
  for (const w of uniqueWords) {
    if (w.indices.join(',') === mainKey) continue;
    const ok = await isWordValidFn(w.word);
    if (ok) turnScore += scoreWord(board, w.indices);
  }
  if (newIdxs.length === 7) turnScore += 50;

  for (const p of pending) {
    game.board[p.idx] = {
      display: p.display,
      rackLetter: p.rackLetter,
      isBlank: p.isBlank,
      locked: true,
    };
  }
  game.pendingPlacements = [];

  game.scores[pi] += turnScore;
  game.history[pi].unshift({ word: main.word, points: turnScore, bingo: newIdxs.length === 7 });
  game.consecutiveScorelessTurns = 0;

  fillRack(game.tileBag, game.racks[pi]);

  if (game.tileBag.length === 0 && game.racks[pi].length === 0) {
    endGameAdjustScores(game, pi);
    return { ok: true, gameOver: true, message: `${game.players[pi].username} used all tiles.` };
  }

  game.currentPlayerIndex = (game.currentPlayerIndex + 1) % game.players.length;
  return { ok: true, mainWord: main.word, turnScore };
}

function passTurn(game, userId) {
  if (game.gameOver || game.status !== 'active') return { error: 'Game not active' };
  const pi = findPlayerIndex(game, userId);
  if (pi !== game.currentPlayerIndex) return { error: 'Not your turn' };
  clearPendingToRack(game);
  game.consecutiveScorelessTurns += 1;
  if (game.consecutiveScorelessTurns >= MAX_SCORELESS_TURNS) {
    endGameAdjustScores(game, null);
    return { ok: true, gameOver: true, message: `Game ended after ${MAX_SCORELESS_TURNS} consecutive scoreless turns.` };
  }
  game.currentPlayerIndex = (game.currentPlayerIndex + 1) % game.players.length;
  return { ok: true };
}

function exchangeTiles(game, userId, rackIndices) {
  if (game.gameOver || game.status !== 'active') return { error: 'Game not active' };
  const pi = findPlayerIndex(game, userId);
  if (pi !== game.currentPlayerIndex) return { error: 'Not your turn' };
  clearPendingToRack(game);

  const indices = [...rackIndices].sort((a, b) => b - a);
  if (indices.length === 0) return { error: 'No tiles selected' };
  if (game.tileBag.length < indices.length) return { error: 'Not enough tiles in bag' };

  const rack = game.racks[pi];
  for (const idx of indices) {
    if (idx < 0 || idx >= rack.length) return { error: 'Invalid tile' };
  }

  for (const idx of indices) {
    const removed = rack.splice(idx, 1)[0];
    game.tileBag.push(removed);
  }
  fillRack(game.tileBag, rack);

  game.consecutiveScorelessTurns += 1;
  if (game.consecutiveScorelessTurns >= MAX_SCORELESS_TURNS) {
    endGameAdjustScores(game, null);
    return { ok: true, gameOver: true };
  }
  game.currentPlayerIndex = (game.currentPlayerIndex + 1) % game.players.length;
  return { ok: true };
}

function sanitizeView(game, viewerUserId) {
  const viewerIdx = findPlayerIndex(game, viewerUserId);
  const bagCounts = {};
  for (const ch of game.tileBag) bagCounts[ch] = (bagCounts[ch] || 0) + 1;

  return {
    roomId: game.roomId,
    status: game.status,
    gameOver: game.gameOver,
    hostUserId: game.hostUserId,
    currentPlayerIndex: game.currentPlayerIndex,
    consecutiveScorelessTurns: game.consecutiveScorelessTurns,
    tileBagTotal: game.tileBag.length,
    tileBagCounts: bagCounts,
    board: game.board.map((cell) =>
      cell
        ? { display: cell.display, isBlank: cell.isBlank, locked: cell.locked }
        : null
    ),
    pendingPlacements: game.pendingPlacements.map((p) => ({
      idx: p.idx,
      display: p.display,
      isBlank: p.isBlank,
    })),
    players: game.players.map((p, i) => ({
      userId: p.userId,
      username: p.username,
      score: game.scores[i],
      rackCount: game.racks[i].length,
      isYou: p.userId === viewerUserId,
      isCurrent: i === game.currentPlayerIndex,
    })),
    yourRack: viewerIdx >= 0 ? [...game.racks[viewerIdx]] : [],
    yourPlayerIndex: viewerIdx,
    history: game.history.map((h, i) => ({
      username: game.players[i].username,
      entries: h,
    })),
  };
}

module.exports = {
  letterValues,
  distribution,
  createGame,
  addPlayer,
  startGame,
  placePendingTile,
  removePendingTile,
  submitPending,
  passTurn,
  exchangeTiles,
  sanitizeView,
  findPlayerIndex,
};
