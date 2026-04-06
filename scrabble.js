// --- 1. Global State ---
let tileBag = [];
let numPlayers = 1;
let currentPlayer = 1;
let playerScores = [];
let playerRacks = [];

let consecutiveScorelessTurns = 0;
const MAX_SCORELESS_TURNS = 6;
let gameOver = false;

// History UI (one table per player)
let playerHistoryTBodies = [];

// --- Mobile-friendly input ---
// HTML drag/drop is unreliable on phones; support "tap-to-place".
function isTouchDevice() {
  return ('ontouchstart' in window) || (navigator.maxTouchPoints || 0) > 0;
}

let exchangeSelectionMode = false; // when true: taps on rack tiles select for exchanging
let tileForPlacement = null; // { playerIdx: number (0-based), rackIndex: number, letter: string }

function clearPlacementSelection() {
  tileForPlacement = null;
}

function clearExchangeSelection() {
  document.querySelectorAll('.selected-for-exchange').forEach(t => t.classList.remove('selected-for-exchange'));
}

const distribution = {
  'A': 9, 'B': 2, 'C': 2, 'D': 4, 'E': 12, 'F': 2, 'G': 3, 'H': 2, 'I': 9,
  'J': 1, 'K': 1, 'L': 4, 'M': 2, 'N': 6, 'O': 8, 'P': 2, 'Q': 1, 'R': 6,
  'S': 4, 'T': 6, 'U': 4, 'V': 2, 'W': 2, 'X': 1, 'Y': 2, 'Z': 1,
  '?': 2
};

const letterValues = {
  'A': 1, 'B': 3, 'C': 3, 'D': 2, 'E': 1, 'F': 4, 'G': 2, 'H': 4, 'I': 1,
  'J': 8, 'K': 5, 'L': 1, 'M': 3, 'N': 1, 'O': 1, 'P': 3, 'Q': 10, 'R': 1,
  'S': 1, 'T': 1, 'U': 1, 'V': 4, 'W': 4, 'X': 8, 'Y': 4, 'Z': 10,
  '?': 0
};

// Memoize dictionary lookups (dictionary is static, but lookups are frequent).
const wordValidityCache = new Map(); // key: UPPERCASE word, value: boolean

let dictionarySet = null; // Set<string> of valid words loaded from dictionary.txt
let dictionaryLoadPromise = null;
let dictionaryLoadErrorShown = false;

async function ensureDictionaryLoaded() {
  if (dictionarySet) return;
  if (dictionaryLoadPromise) return dictionaryLoadPromise;

  dictionaryLoadPromise = (async () => {
    try {
      const res = await fetch("./dictionary.txt");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const text = await res.text();

      // dictionary.txt is expected to be "one word per line", uppercase A-Z.
      const words = text
        .split(/\r?\n/)
        .map(l => l.trim())
        .filter(Boolean)
        .map(w => w.toUpperCase());

      dictionarySet = new Set(words);
    } catch (e) {
      // If the dictionary can't be loaded (common when opening via file://),
      // fall back to an empty set so all words are rejected instead of crashing.
      dictionarySet = new Set();
      if (!dictionaryLoadErrorShown) {
        dictionaryLoadErrorShown = true;
        alert(
          "Could not load dictionary.txt.\n" +
          "Please run the app from a local server (http://...) so fetch() can access dictionary.txt."
        );
      }
    }
  })();

  return dictionaryLoadPromise;
}

const tw = [0, 7, 14, 105, 119, 210, 217, 224];
const dw = [16, 28, 32, 42, 48, 56, 64, 70, 154, 160, 168, 176, 182, 192, 196, 208];
const tl = [20, 24, 76, 80, 84, 88, 136, 140, 144, 148, 200, 204];
const dl = [3, 11, 36, 38, 45, 52, 59, 92, 96, 98, 102, 108, 116, 122, 126, 128, 132, 165, 172, 179, 186, 188, 213, 221];

const board = document.getElementById('scrabble-board');

// --- Helpers for grid math ---
const idxToRC = (idx) => ({ r: Math.floor(idx / 15), c: idx % 15 });
const rcToIdx = (r, c) => r * 15 + c;
const inBounds = (r, c) => r >= 0 && r < 15 && c >= 0 && c < 15;

// --- Endgame + turn helpers ---
function endTurnNoScore(reason = "pass") {
  if (gameOver) return;

  exchangeSelectionMode = false;
  clearPlacementSelection();
  clearExchangeSelection();

  consecutiveScorelessTurns += 1;

  if (consecutiveScorelessTurns >= MAX_SCORELESS_TURNS) {
    endGame(null, `Game ended after ${MAX_SCORELESS_TURNS} consecutive scoreless turns.`);
    return;
  }

  currentPlayer = (currentPlayer % numPlayers) + 1;
  updateTurnUI();
  renderAllRacks();
}

const passBtn = document.getElementById('pass-turn');
if (passBtn) passBtn.addEventListener('click', () => endTurnNoScore("pass"));

// Scores modal
const scoresBtn = document.getElementById('scores');
const scoresModal = document.getElementById('scores-modal');
const closeScoresBtn = document.getElementById('close-scores');
const scoresTbody = document.getElementById('scores-tbody');

function renderScoresTable() {
  if (!scoresTbody) return;
  scoresTbody.innerHTML = "";
  for (let i = 0; i < numPlayers; i++) {
    const tr = document.createElement("tr");
    tr.innerHTML = `<td>Player ${i + 1}</td><td>${playerScores[i]}</td>`;
    scoresTbody.appendChild(tr);
  }
}

function openScoresModal() {
  if (!scoresModal) return;
  renderScoresTable();
  scoresModal.style.display = "flex";
}

function closeScoresModal() {
  if (!scoresModal) return;
  scoresModal.style.display = "none";
}

if (scoresBtn) scoresBtn.addEventListener('click', openScoresModal);
if (closeScoresBtn) closeScoresBtn.addEventListener('click', closeScoresModal);

if (scoresModal) {
  scoresModal.addEventListener('click', (e) => {
    if (e.target === scoresModal) closeScoresModal();
  });
}

function rackPointSum(playerIdx) {
  return playerRacks[playerIdx].reduce((sum, ch) => sum + (letterValues[ch] ?? 0), 0);
}

function disableGameUI() {
  gameOver = true;

  const submitBtn = document.getElementById('submit-word');
  const exchangeBtn = document.getElementById('exchange-tiles');
  const passBtn = document.getElementById('pass-turn');

  if (submitBtn) submitBtn.disabled = true;
  if (exchangeBtn) exchangeBtn.disabled = true;
  if (passBtn) passBtn.disabled = true;

  renderAllRacks();
}

function endGame(wentOutPlayerIdx /* 0-based or null */, message) {
  if (gameOver) return;

  const leftovers = playerRacks.map((_, i) => rackPointSum(i));
  const totalLeftover = leftovers.reduce((a, b) => a + b, 0);

  for (let i = 0; i < numPlayers; i++) {
    playerScores[i] -= leftovers[i];
  }

  if (wentOutPlayerIdx !== null) {
    playerScores[wentOutPlayerIdx] += (totalLeftover - leftovers[wentOutPlayerIdx]);
  }

  updateTurnUI();
  disableGameUI();

  const maxScore = Math.max(...playerScores);
  const winners = [];
  for (let i = 0; i < numPlayers; i++) {
    if (playerScores[i] === maxScore) winners.push(i + 1);
  }

  alert(
    `${message}\n\nFinal scores:\n` +
    playerScores.map((s, i) => `Player ${i + 1}: ${s}`).join('\n') +
    `
\nWinner: Player ${winners.join(', ')}`
  );
}

// --- Board helpers ---
function getSquare(idx) {
  return board.children[idx];
}
function hasTile(idx) {
  return getSquare(idx).classList.contains("tile-placed");
}
function getTileLetter(idx) {
  return getSquare(idx).innerText;
}
function isBlankTile(idx) {
  return getSquare(idx).dataset.isBlank === "true";
}

function getWordFrom(idx, dr, dc) {
  const { r, c } = idxToRC(idx);

  let sr = r, sc = c;
  while (inBounds(sr - dr, sc - dc) && hasTile(rcToIdx(sr - dr, sc - dc))) {
    sr -= dr;
    sc -= dc;
  }

  let letters = "";
  let indices = [];
  let cr = sr, cc = sc;
  while (inBounds(cr, cc) && hasTile(rcToIdx(cr, cc))) {
    const i = rcToIdx(cr, cc);
    letters += getTileLetter(i);
    indices.push(i);
    cr += dr;
    cc += dc;
  }

  return { word: letters, indices };
}

function scoreWord(wordIndices) {
  let base = 0;
  let wordMult = 1;

  for (const idx of wordIndices) {
    const sq = getSquare(idx);
    const letter = getTileLetter(idx).toUpperCase();

    let val = isBlankTile(idx) ? 0 : (letterValues[letter] || 0);
    const isNew = sq.classList.contains("tile-placed") && !sq.classList.contains("locked");

    if (isNew) {
      if (sq.classList.contains("dl")) val *= 2;
      else if (sq.classList.contains("tl")) val *= 3;

      if (sq.classList.contains("dw") || sq.classList.contains("star")) wordMult *= 2;
      else if (sq.classList.contains("tw")) wordMult *= 3;
    }

    base += val;
  }

  return base * wordMult;
}

function isFirstMove() {
  return document.querySelectorAll('.locked').length === 0;
}

/** Square indices that already had tiles locked before this turn (existing board letters). */
function getLockedBoardIndices() {
  const s = new Set();
  for (let i = 0; i < 225; i++) {
    if (getSquare(i).classList.contains("locked")) s.add(i);
  }
  return s;
}

function newTileIndices() {
  const allSquares = [...board.children];
  const newTiles = [...document.querySelectorAll('.tile-placed:not(.locked)')];
  return newTiles.map(t => allSquares.indexOf(t));
}

function touchesLocked(newIdxs) {
  return newIdxs.some(idx => {
    const { r, c } = idxToRC(idx);
    const neigh = [[r - 1, c], [r + 1, c], [r, c - 1], [r, c + 1]]
      .filter(([rr, cc]) => inBounds(rr, cc));
    return neigh.some(([rr, cc]) => getSquare(rcToIdx(rr, cc)).classList.contains("locked"));
  });
}

function rollbackNewTilesToRack() {
  const newTiles = [...document.querySelectorAll('.tile-placed:not(.locked)')];

  newTiles.forEach(sq => {
    const isBlank = sq.dataset.isBlank === "true";
    const returnChar = isBlank ? "?" : sq.innerText;

    sq.innerText = "";
    sq.classList.remove("tile-placed");
    sq.dataset.isBlank = "false";
    delete sq.dataset.score;

    playerRacks[currentPlayer - 1].push(returnChar);
  });

  renderAllRacks();
}

// --- 2. Initialization & Setup ---
window.startGame = function (count) {
  numPlayers = parseInt(count, 10);
  currentPlayer = 1;
  playerScores = new Array(numPlayers).fill(0);
  playerRacks = new Array(numPlayers).fill(null).map(() => []);

  consecutiveScorelessTurns = 0;
  gameOver = false;

  document.getElementById('setup-overlay').style.display = 'none';
  document.getElementById('game-container').style.display = 'block';

  document.querySelectorAll('.player-side').forEach(el => el.style.display = 'none');
  for (let i = 0; i < numPlayers; i++) {
    const area = document.getElementById(`player-area-${i + 1}`);
    if (area) {
      area.style.display = 'flex';
      setupPlayerArea(i + 1);
    }
  }

  initializeBag();
  createBoard();

  initHistoryTables();

  for (let i = 0; i < numPlayers; i++) {
    fillRackArray(i);
  }

  updateTurnUI();
  renderAllRacks();
};

function initHistoryTables() {
  const container = document.getElementById("history-tables");
  if (!container) return;

  container.innerHTML = "";
  playerHistoryTBodies = [];

  for (let i = 0; i < numPlayers; i++) {
    const playerNum = i + 1;

    const table = document.createElement("table");
    table.classList.add("player-history-table");
    table.id = `history-table-${playerNum}`;

    table.innerHTML = `
      <thead>
        <tr>
          <th colspan="2">Player ${playerNum} History</th>
        </tr>
      </thead>
      <tbody id="history-tbody-${playerNum}"></tbody>
    `;

    container.appendChild(table);
    playerHistoryTBodies[i] = table.querySelector(`#history-tbody-${playerNum}`);
  }
}

function setupPlayerArea(pNum) {
  const area = document.getElementById(`player-area-${pNum}`);
  if (!area) return;
  area.innerHTML = `
    <div class="player-card">
      <h4>Player ${pNum}</h4>
      <div class="score-display" id="score-${pNum}">0</div>
      <div class="turn-badge">Your Turn</div>
      <div id="rack-${pNum}" class="rack-grid"></div>
    </div>
  `;
}

function initializeBag() {
  tileBag = [];
  for (let letter in distribution) {
    for (let i = 0; i < distribution[letter]; i++) tileBag.push(letter);
  }
}

function drawTile() {
  if (tileBag.length === 0) return null;
  const randomIndex = Math.floor(Math.random() * tileBag.length);
  return tileBag.splice(randomIndex, 1)[0];
}

function fillRackArray(playerIdx) {
  while (playerRacks[playerIdx].length < 7 && tileBag.length > 0) {
    playerRacks[playerIdx].push(drawTile());
  }
}

const BAG_LETTER_ORDER = "ABCDEFGHIJKLMNOPQRSTUVWXYZ?".split("");

function renderBagDisplay() {
  const grid = document.getElementById("tile-bag-display");
  const totalEl = document.getElementById("tile-bag-total");
  if (!grid) return;

  const counts = {};
  for (const ch of tileBag) counts[ch] = (counts[ch] || 0) + 1;

  grid.innerHTML = BAG_LETTER_ORDER.map((letter) => {
    const n = counts[letter] ?? 0;
    const displayLetter = letter === "?" ? "□" : letter;
    return `<div class="bag-cell${n === 0 ? " bag-cell--empty" : ""}" title="${letter === "?" ? "Blank" : letter}: ${n} remaining">
      <span class="bag-cell-letter">${displayLetter}</span>
      <span class="bag-cell-count">${n}</span>
    </div>`;
  }).join("");

  if (totalEl) totalEl.textContent = String(tileBag.length);
}

// --- 3. Rendering ---
function createBoard() {
  if (!board) return;
  board.innerHTML = '';
  for (let i = 0; i < 225; i++) {
    const square = document.createElement('div');
    square.classList.add('square');

    if (tw.includes(i)) { square.classList.add('tw'); square.innerText = 'TW'; }
    else if (dw.includes(i)) { square.classList.add('dw'); square.innerText = 'DW'; }
    else if (tl.includes(i)) { square.classList.add('tl'); square.innerText = 'TL'; }
    else if (dl.includes(i)) { square.classList.add('dl'); square.innerText = 'DL'; }
    else if (i === 112) { square.classList.add('star'); square.innerText = '★'; }

    board.appendChild(square);
  }
  setupDropZones();
}

function renderAllRacks() {
  for (let i = 0; i < numPlayers; i++) {
    const rackElement = document.getElementById(`rack-${i + 1}`);
    if (!rackElement) continue;

    rackElement.innerHTML = '';
    const isCurrent = (currentPlayer === i + 1);
    const playerArea = document.getElementById(`player-area-${i + 1}`);
    if (playerArea) playerArea.classList.toggle('active-turn', isCurrent);

    playerRacks[i].forEach((letter, index) => {
      const tile = document.createElement('div');
      tile.classList.add('tile');

      tile.innerText = letter;
      tile.dataset.score = letterValues[letter] ?? 0;

      if (isCurrent && !gameOver) {
        tile.dataset.index = index;

        const touch = isTouchDevice();
        if (touch) {
          // Visual selection for tap-to-place
          if (
            !exchangeSelectionMode &&
            tileForPlacement &&
            tileForPlacement.playerIdx === i &&
            tileForPlacement.rackIndex === index
          ) {
            tile.classList.add('selected-for-place');
          }

          tile.addEventListener('click', () => {
            if (exchangeSelectionMode) {
              // In exchange mode: tapping toggles exchange selection
              tile.classList.toggle('selected-for-exchange');
              tile.classList.remove('selected-for-place');
              return;
            }

            // Normal touch play: tap a rack tile to select it for placement.
            tileForPlacement = { playerIdx: i, rackIndex: index, letter };
            clearExchangeSelection();
            exchangeSelectionMode = false;
            renderAllRacks();
          });
        } else {
          // Desktop: drag-drop placement, click toggles exchange selection
          tile.setAttribute('draggable', true);

          tile.addEventListener('click', () => tile.classList.toggle('selected-for-exchange'));

          tile.addEventListener('dragstart', (e) => {
            e.dataTransfer.setData('text/plain', letter);
            e.dataTransfer.setData('source-index', String(index));
            tile.id = "dragging-now";
          });

          tile.addEventListener('dragend', () => {
            if (tile.id === "dragging-now") tile.id = "";
          });
        }
      } else {
        tile.classList.add('inactive-tile');
      }

      rackElement.appendChild(tile);
    });
  }
  renderBagDisplay();
}

function updateTurnUI() {
  const indicator = document.getElementById('player-turn-indicator');
  if (indicator) indicator.innerText = `Player ${currentPlayer}'s Turn`;

  for (let i = 0; i < numPlayers; i++) {
    const s = document.getElementById(`score-${i + 1}`);
    if (s) s.innerText = playerScores[i];
  }
}

// --- 4. Drop Logic ---
function setupDropZones() {
  const squares = document.querySelectorAll('.square');
  const allSquares = Array.from(board.children);

  squares.forEach(square => {
    square.addEventListener('dragover', (e) => e.preventDefault());

    square.addEventListener('drop', (e) => {
      e.preventDefault();
      if (gameOver) return;

      let letter = e.dataTransfer.getData('text/plain');
      const sourceIndex = parseInt(e.dataTransfer.getData('source-index'), 10);

      // blank tile prompt
      let blankAs = null;
      if (letter === '?') {
        blankAs = (prompt("Blank tile: choose a letter A-Z") || "").toUpperCase();
        if (!/^[A-Z]$/.test(blankAs)) {
          alert("Invalid blank letter.");
          return;
        }
      }

      const draggingTile = document.getElementById('dragging-now');
      const targetIdx = allSquares.indexOf(square);

      if (square.classList.contains('tile-placed')) return alert("Occupied!");

      const boardHasAnyTiles = document.querySelectorAll('.tile-placed').length > 0;
      if (!boardHasAnyTiles && targetIdx !== 112) return alert("Start on the star!");

      // Simple straight-line enforcement while placing (submit validates full rules)
      const currentTurnSquares = Array.from(document.querySelectorAll('.tile-placed:not(.locked)'));
      if (currentTurnSquares.length > 0) {
        const firstIdx = allSquares.indexOf(currentTurnSquares[0]);
        const a = idxToRC(firstIdx);
        const b = idxToRC(targetIdx);

        if (currentTurnSquares.length === 1) {
          if (a.r !== b.r && a.c !== b.c) return alert("Play in a straight line!");
        } else {
          const secondIdx = allSquares.indexOf(currentTurnSquares[1]);
          const s = idxToRC(secondIdx);
          const isHoriz = a.r === s.r;
          if (isHoriz && b.r !== a.r) return alert("Stay in the row!");
          if (!isHoriz && b.c !== a.c) return alert("Stay in the column!");
        }
      }

      // Place on board
      square.innerText = (letter === '?' ? blankAs : letter);
      square.dataset.isBlank = (letter === '?' ? "true" : "false");
      square.classList.add('tile-placed');
      square.dataset.score = letterValues[letter] ?? 0;

      // remove from rack
      playerRacks[currentPlayer - 1].splice(sourceIndex, 1);
      if (draggingTile) draggingTile.remove();

      // click to return tile (only if not locked)
      square.onclick = () => {
        if (square.classList.contains('locked') || gameOver) return;

        const returnLetter = (square.dataset.isBlank === "true") ? "?" : square.innerText;

        square.innerText = '';
        square.classList.remove('tile-placed');
        square.dataset.isBlank = "false";
        delete square.dataset.score;
        square.onclick = null;

        playerRacks[currentPlayer - 1].push(returnLetter);
        renderAllRacks();
      };

      renderAllRacks();
    });

    // Touch/click placement: tap a rack tile first, then tap a square.
    square.addEventListener('click', () => {
      if (gameOver) return;
      if (!isTouchDevice()) return;
      if (square.classList.contains('tile-placed')) return; // occupied (tap-to-return is handled after placement)
      if (!tileForPlacement) return;
      if (tileForPlacement.playerIdx !== currentPlayer - 1) return;

      let letter = tileForPlacement.letter;
      const sourceIndex = tileForPlacement.rackIndex;
      const targetIdx = allSquares.indexOf(square);

      // blank tile prompt
      let blankAs = null;
      if (letter === '?') {
        blankAs = (prompt("Blank tile: choose a letter A-Z") || "").toUpperCase();
        if (!/^[A-Z]$/.test(blankAs)) {
          alert("Invalid blank letter.");
          return;
        }
      }

      const boardHasAnyTiles = document.querySelectorAll('.tile-placed').length > 0;
      if (!boardHasAnyTiles && targetIdx !== 112) return alert("Start on the star!");

      // Simple straight-line enforcement while placing
      const currentTurnSquares = Array.from(document.querySelectorAll('.tile-placed:not(.locked)'));
      if (currentTurnSquares.length > 0) {
        const firstIdx = allSquares.indexOf(currentTurnSquares[0]);
        const a = idxToRC(firstIdx);
        const b = idxToRC(targetIdx);

        if (currentTurnSquares.length === 1) {
          if (a.r !== b.r && a.c !== b.c) return alert("Play in a straight line!");
        } else {
          const secondIdx = allSquares.indexOf(currentTurnSquares[1]);
          const s = idxToRC(secondIdx);
          const isHoriz = a.r === s.r;
          if (isHoriz && b.r !== a.r) return alert("Stay in the row!");
          if (!isHoriz && b.c !== a.c) return alert("Stay in the column!");
        }
      }

      // Place on board
      square.innerText = (letter === '?' ? blankAs : letter);
      square.dataset.isBlank = (letter === '?' ? "true" : "false");
      square.classList.add('tile-placed');
      square.dataset.score = letterValues[letter] ?? 0;

      // remove from rack
      playerRacks[currentPlayer - 1].splice(sourceIndex, 1);
      clearPlacementSelection();

      // click to return tile (only if not locked)
      square.onclick = () => {
        if (square.classList.contains('locked') || gameOver) return;

        const returnLetter = (square.dataset.isBlank === "true") ? "?" : square.innerText;

        square.innerText = '';
        square.classList.remove('tile-placed');
        square.dataset.isBlank = "false";
        delete square.dataset.score;
        square.onclick = null;

        playerRacks[currentPlayer - 1].push(returnLetter);
        renderAllRacks();
      };

      renderAllRacks();
    });
  });
}

// --- 5. Handlers ---
async function exchangeSelectedTiles() {
  if (gameOver) return;
  const touch = isTouchDevice();
  const selected = document.querySelectorAll('.selected-for-exchange');

  if (!exchangeSelectionMode) {
    // Touch UX: first tap enters "exchange selection mode"
    if (selected.length === 0) {
      if (touch) {
        exchangeSelectionMode = true;
        clearPlacementSelection();
        renderAllRacks();
        alert("Tap the rack tiles you want to exchange, then press Exchange again.");
        return;
      }
      return alert("Select tiles to exchange first.");
    }
  } else {
    // Exchange mode: require at least one tile selected
    if (selected.length === 0) return alert("Select tiles to exchange first.");
  }

  clearPlacementSelection();

  if (tileBag.length === 0) return alert("Tile bag is empty—cannot exchange.");
  if (tileBag.length < selected.length) {
    return alert(`Not enough tiles in the bag to exchange ${selected.length} tiles.`);
  }

  if (!confirm(`Exchange ${selected.length} tiles and skip turn?`)) return;

  const indices = Array.from(selected).map(t => parseInt(t.dataset.index, 10)).sort((a, b) => b - a);
  indices.forEach(idx => {
    const removed = playerRacks[currentPlayer - 1].splice(idx, 1)[0];
    tileBag.push(removed);
  });

  fillRackArray(currentPlayer - 1);

  // exchange counts as scoreless turn
  consecutiveScorelessTurns += 1;
  if (consecutiveScorelessTurns >= MAX_SCORELESS_TURNS) {
    endGame(null, `Game ended after ${MAX_SCORELESS_TURNS} consecutive scoreless turns.`);
    return;
  }

  exchangeSelectionMode = false;
  currentPlayer = (currentPlayer % numPlayers) + 1;
  updateTurnUI();
  renderAllRacks();
}

const exchangeBtn = document.getElementById('exchange-tiles');
if (exchangeBtn) exchangeBtn.addEventListener('click', exchangeSelectedTiles);

async function isWordValid(word) {
  const normalized = String(word || "").trim().toUpperCase();
  if (!normalized) return false;

  if (wordValidityCache.has(normalized)) return wordValidityCache.get(normalized);

  await ensureDictionaryLoaded();
  const ok = dictionarySet ? dictionarySet.has(normalized) : false;
  wordValidityCache.set(normalized, ok);
  return ok;
}

const submitBtn = document.getElementById('submit-word');
if (submitBtn) submitBtn.addEventListener('click', async () => {
  if (gameOver) return;

  exchangeSelectionMode = false;
  clearPlacementSelection();
  clearExchangeSelection();

  const newIdxs = newTileIndices();
  if (newIdxs.length === 0) return;

  const firstMove = isFirstMove();

  if (firstMove && !newIdxs.includes(112)) {
    alert("First move must cover the star!");
    return;
  }

  // Determine direction + build words correctly
  let mainDr = 0, mainDc = 1; // default horizontal
  let main = null;
  let extraSingleTileWord = null; // if 1 tile forms BOTH horiz and vert

  if (newIdxs.length > 1) {
    const a = idxToRC(newIdxs[0]);
    const sameRow = newIdxs.every(i => idxToRC(i).r === a.r);
    const sameCol = newIdxs.every(i => idxToRC(i).c === a.c);

    if (!sameRow && !sameCol) {
      alert("Play in a straight line!");
      return;
    }

    if (sameCol) { mainDr = 1; mainDc = 0; }
    else { mainDr = 0; mainDc = 1; }

    main = getWordFrom(newIdxs[0], mainDr, mainDc);
    if (main.word.length < 2) {
      alert("Words must be 2+ letters.");
      rollbackNewTilesToRack();
      return;
    }
  } else {
    // One tile: compute BOTH possible words (horiz + vert).
    // Your rule: accept the move if at least ONE of them is valid.
    const idx = newIdxs[0];
    const horiz = getWordFrom(idx, 0, 1);
    const vert = getWordFrom(idx, 1, 0);

    const horizOk = horiz.word.length >= 2;
    const vertOk = vert.word.length >= 2;

    if (!horizOk && !vertOk) {
      alert("Words must be 2+ letters.");
      rollbackNewTilesToRack();
      return;
    }

    const horizWord = horizOk ? horiz : null;
    const vertWord = vertOk ? vert : null;

    // Choose a valid main direction (accept if either is valid).
    const [horizValid, vertValid] = await Promise.all([
      horizWord ? isWordValid(horizWord.word) : Promise.resolve(false),
      vertWord ? isWordValid(vertWord.word) : Promise.resolve(false),
    ]);

    if (!horizValid && !vertValid) {
      alert("Neither horizontal nor vertical word is valid.");
      rollbackNewTilesToRack();
      return;
    }

    if (horizValid && vertValid) {
      // Prefer the direction that reuses a board letter so the main line matches standard
      // "hook/cross" scoring when both words are valid.
      const lockedBeforePick = getLockedBoardIndices();
      const hReuse = horizWord.indices.some((i) => lockedBeforePick.has(i));
      const vReuse = vertWord.indices.some((i) => lockedBeforePick.has(i));
      if (vReuse && !hReuse) {
        mainDr = 1;
        mainDc = 0;
        main = vertWord;
        extraSingleTileWord = horizWord;
      } else {
        mainDr = 0;
        mainDc = 1;
        main = horizWord;
        extraSingleTileWord = vertWord;
      }
    } else if (horizValid) {
      mainDr = 0;
      mainDc = 1;
      main = horizWord;
      if (vertWord) extraSingleTileWord = vertWord;
    } else {
      mainDr = 1;
      mainDc = 0;
      main = vertWord;
      if (horizWord) extraSingleTileWord = horizWord;
    }
  }

  // Must connect to locked tiles after first move
  if (!firstMove && !touchesLocked(newIdxs)) {
    alert("Connect to an existing word!");
    rollbackNewTilesToRack();
    return;
  }

  // Ensure all new tiles are inside the main word span (prevents isolated placements)
  const mainSet = new Set(main.indices);
  const allNewInsideMain = newIdxs.every(i => mainSet.has(i));
  if (!allNewInsideMain) {
    alert("All placed tiles must be part of one contiguous word.");
    rollbackNewTilesToRack();
    return;
  }

  // Build cross words
  const crossDr = mainDr === 0 ? 1 : 0;
  const crossDc = mainDc === 1 ? 0 : 1;

  const wordsFormed = [main];

  // If 1 tile made both horiz and vert words, include the other word too
  if (extraSingleTileWord) wordsFormed.push(extraSingleTileWord);

  for (const idx of newIdxs) {
    const w = getWordFrom(idx, crossDr, crossDc);
    if (w.word.length >= 2) wordsFormed.push(w);
  }

  // Custom rule:
  // - The main word must be valid.
  // - Cross words (perpendicular words formed this turn) are only scored if valid.
  // - The move is still accepted even if some cross words are invalid.
  const uniqueWords = [];
  const seenWordIndices = new Set();
  for (const w of wordsFormed) {
    const key = w.indices.join(",");
    if (seenWordIndices.has(key)) continue;
    seenWordIndices.add(key);
    uniqueWords.push(w);
  }

  // After the first move: the main play line (and for one tile, the alternate full word) must
  // include at least one locked square. Perpendicular hooks alone are not enough — that blocks
  // parallel words that only sit beside existing letters without sharing a cell.
  if (!firstMove) {
    const lockedBefore = getLockedBoardIndices();
    const mainUsesBoard = main.indices.some((idx) => lockedBefore.has(idx));
    const extraUsesBoard =
      extraSingleTileWord &&
      extraSingleTileWord.indices.some((idx) => lockedBefore.has(idx));
    if (!mainUsesBoard && !extraUsesBoard) {
      alert(
        "Your play must cross an existing word—use at least one letter already on the board along your main line (a parallel word that only touches the sides is not allowed)."
      );
      rollbackNewTilesToRack();
      return;
    }
  }

  let turnScore = 0;
  const mainKey = main.indices.join(",");

  // Main word must be valid
  const mainOk = await isWordValid(main.word);
  if (!mainOk) {
    alert(`"${main.word}" is invalid!`);
    rollbackNewTilesToRack();
    return;
  }

  // Always score main; score cross words only if dictionary says they're valid
  turnScore += scoreWord(main.indices);
  for (const w of uniqueWords) {
    if (w.indices.join(",") === mainKey) continue;
    const ok = await isWordValid(w.word);
    if (!ok) continue;
    turnScore += scoreWord(w.indices);
  }

  if (newIdxs.length === 7) turnScore += 50;

  // Commit move
  playerScores[currentPlayer - 1] += turnScore;

  // scoring move resets scoreless counter
  consecutiveScorelessTurns = 0;

  const tbody = document.getElementById(`history-tbody-${currentPlayer}`);
  if (tbody) {
    const tr = document.createElement("tr");
    tr.classList.add("history-row");

    const isBingo = newIdxs.length === 7;
    if (isBingo) tr.classList.add("history-bingo");

    tr.innerHTML = `
      <td class="history-word-cell">${main.word}</td>
      <td class="history-points-cell">+${turnScore}</td>
    `;

    tbody.prepend(tr);
  }

  // Lock placed tiles
  const newlyPlacedSquares = [...document.querySelectorAll('.tile-placed:not(.locked)')];
  newlyPlacedSquares.forEach(sq => sq.classList.add('locked'));

  // Refill rack
  fillRackArray(currentPlayer - 1);

  // End condition: bag empty and current player rack empty
  const pIdx = currentPlayer - 1;
  if (tileBag.length === 0 && playerRacks[pIdx].length === 0) {
    endGame(pIdx, `Player ${currentPlayer} used all tiles and the bag is empty.`);
    return;
  }

  // Next player
  currentPlayer = (currentPlayer % numPlayers) + 1;
  updateTurnUI();
  renderAllRacks();
});

const resetBtn = document.getElementById('reset-board');
if (resetBtn) resetBtn.addEventListener('click', () => location.reload());