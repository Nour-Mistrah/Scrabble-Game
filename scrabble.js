
// --- 1. Global State ---
let tileBag = [];
let numPlayers = 1;
let currentPlayer = 1;
let playerScores = [];
let playerRacks = [];
let gameStartedOnline = false;
let playerNames = [];
let localPlayerNumber = 1;
let onlineSyncInterval = null;
let onlineWaitingInterval = null;
let onlineStateVersion = 0;

let consecutiveScorelessTurns = 0;
const MAX_SCORELESS_TURNS = 6;
let gameOver = false;

// History UI (one table per player)
let playerHistoryTBodies = [];

// --- Mobile-friendly input ---
function isTouchDevice() {
    return ('ontouchstart' in window) || (navigator.maxTouchPoints || 0) > 0;
}

let exchangeSelectionMode = false;
let tileForPlacement = null;

function clearPlacementSelection() {
    tileForPlacement = null;
}

function clearExchangeSelection() {
    document.querySelectorAll('.selected-for-exchange').forEach(t => {
        t.classList.remove('selected-for-exchange');
    });
}
function isLocalPlayerTurn() {
    console.log("========== TURN CHECK ==========");
    console.log("gameStartedOnline:", gameStartedOnline);
    console.log("currentPlayer:", currentPlayer);
    console.log("localPlayerNumber:", localPlayerNumber);
    (
        "currentPlayer === localPlayerNumber:",
        Number(currentPlayer) === Number(localPlayerNumber)
    );
    console.log("================================");

    if (!gameStartedOnline) {
        return true;
    }

    return Number(currentPlayer) === Number(localPlayerNumber);
}


function stopOnlineWaiting() {
    if (onlineWaitingInterval) {
        clearInterval(onlineWaitingInterval);
        onlineWaitingInterval = null;
    }
}


function getCurrentUser() {
    try {
        return JSON.parse(
            sessionStorage.getItem("scrabbleUser")
        );
    } catch (error) {
        return null;
    }
}

// ========================================
// POLISHED APP MESSAGES
// ========================================

function ensureAppMessageContainer() {
    let container =
        document.getElementById(
            "app-message-container"
        );

    if (!container) {
        container =
            document.createElement("div");

        container.id =
            "app-message-container";

        container.setAttribute(
            "aria-live",
            "polite"
        );

        document.body.appendChild(
            container
        );
    }

    return container;
}


function showAppMessage(
    message,
    type = "warning",
    title = ""
) {
    const container =
        ensureAppMessageContainer();

    const toast =
        document.createElement("div");

    toast.className =
        `app-message app-message--${type}`;

    const iconMap = {
        success: "✓",
        error: "×",
        warning: "!",
        info: "i"
    };

    const titleMap = {
        success: "Success",
        error: "Something went wrong",
        warning: "Check your move",
        info: "Scrabble"
    };

    const icon =
        document.createElement("div");

    icon.className =
        "app-message__icon";

    icon.textContent =
        iconMap[type] || "i";


    const content =
        document.createElement("div");

    content.className =
        "app-message__content";


    const heading =
        document.createElement("div");

    heading.className =
        "app-message__title";

    heading.textContent =
        title ||
        titleMap[type] ||
        "Scrabble";


    const body =
        document.createElement("div");

    body.className =
        "app-message__text";

    body.textContent =
        String(message || "");


    const close =
        document.createElement("button");

    close.type = "button";

    close.className =
        "app-message__close";

    close.setAttribute(
        "aria-label",
        "Close notification"
    );

    close.textContent = "×";


    content.appendChild(
        heading
    );

    content.appendChild(
        body
    );

    toast.appendChild(
        icon
    );

    toast.appendChild(
        content
    );

    toast.appendChild(
        close
    );

    container.appendChild(
        toast
    );


    const removeToast = () => {
        if (!toast.isConnected) {
            return;
        }

        toast.classList.add(
            "app-message--leaving"
        );

        setTimeout(
            () => toast.remove(),
            180
        );
    };


    close.addEventListener(
        "click",
        removeToast
    );


    requestAnimationFrame(
        () => {
            toast.classList.add(
                "app-message--visible"
            );
        }
    );


    setTimeout(
        removeToast,
        3800
    );
}


// ========================================
// REPLACE BROWSER ALERTS
// ========================================
//
// Your existing game contains many alert(...)
// calls.
//
// By replacing window.alert here, all of those
// existing messages automatically use our
// polished Scrabble notification without
// changing the game logic.
//

window.alert = function (message) {
    showAppMessage(
        message,
        "warning"
    );
};


// ========================================
// LOGGED-IN PLAYER IN LOBBY
// ========================================

function updateLobbyUser() {
    const setupCard =
        document.querySelector(
            "#setup-overlay .setup-card"
        );

    if (!setupCard) {
        return;
    }


    let welcome =
        document.getElementById(
            "lobby-user-welcome"
        );


    if (!welcome) {
        welcome =
            document.createElement("div");

        welcome.id =
            "lobby-user-welcome";


        const heading =
            setupCard.querySelector(
                "h1"
            );


        if (heading) {
            heading.insertAdjacentElement(
                "afterend",
                welcome
            );
        } else {
            setupCard.prepend(
                welcome
            );
        }
    }


    const user =
        getCurrentUser();


    if (!user) {
        welcome.style.display =
            "none";

        return;
    }


    const username =
        user.username ||
        user.name ||
        "Player";


    welcome.style.display =
        "flex";


    welcome.innerHTML = `
        <span class="lobby-user-welcome__label">
            Signed in as
        </span>

        <strong class="lobby-user-welcome__name"></strong>
    `;


    welcome.querySelector(
        ".lobby-user-welcome__name"
    ).textContent =
        username;
}

async function getRoomPlayers(roomId) {
    const token = sessionStorage.getItem("scrabbleToken");

    if (!token || !roomId) {
        return [];
    }

    try {
        const response = await fetch(
            `${API_URL}/api/game-sessions/${roomId}/players`,
            {
                headers: {
                    "Authorization": `Bearer ${token}`
                }
            }
        );

        if (!response.ok) {
            return [];
        }

        const data = await response.json();

        return data.players || [];

    } catch (error) {
        console.error("Could not get room players:", error);
        return [];
    }
}

function getPlayerNumberFromPlayers(playersList) {
    const currentUser = getCurrentUser();

    if (!currentUser || !Array.isArray(playersList)) {
        return 1;
    }

    const index = playersList.findIndex(
        player => Number(player.id) === Number(currentUser.id)
    );

    if (index === -1) {
        return 1;
    }

    return index + 1;
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

// Dictionary cache
const wordValidityCache = new Map();

const tw = [0, 7, 14, 105, 119, 210, 217, 224];
const dw = [16, 28, 32, 42, 48, 56, 64, 70, 154, 160, 168, 176, 182, 192, 196, 208];
const tl = [20, 24, 76, 80, 84, 88, 136, 140, 144, 148, 200, 204];
const dl = [3, 11, 36, 38, 45, 52, 59, 92, 96, 98, 102, 108, 116, 122, 126, 128, 132, 165, 172, 179, 186, 188, 213, 221];

const board = document.getElementById('scrabble-board');

// --- Helpers for grid math ---
const idxToRC = (idx) => ({
    r: Math.floor(idx / 15),
    c: idx % 15
});

const rcToIdx = (r, c) => r * 15 + c;

const inBounds = (r, c) =>
    r >= 0 && r < 15 && c >= 0 && c < 15;


// --- Endgame + turn helpers ---
function endTurnNoScore(reason = "pass") {
    if (gameOver) return;

    if (!isLocalPlayerTurn()) {
        alert(`It is Player ${currentPlayer}'s turn.`);
        return;
    }

      


    exchangeSelectionMode = false;
    clearPlacementSelection();
    clearExchangeSelection();

    consecutiveScorelessTurns += 1;

    if (consecutiveScorelessTurns >= MAX_SCORELESS_TURNS) {
        endGame(
            null,
            `Game ended after ${MAX_SCORELESS_TURNS} consecutive scoreless turns.`
        );
        return;
    }

    currentPlayer = (currentPlayer % numPlayers) + 1;

    updateTurnUI();
    renderAllRacks();

    // Save the new turn online
    if (gameStartedOnline) {
        saveOnlineGameState();
    }
}



const passBtn = document.getElementById('pass-turn');

if (passBtn) {
    passBtn.addEventListener('click', () => {
        endTurnNoScore("pass");
    });
}


// --- Scores modal ---
const scoresBtn = document.getElementById('scores');
const scoresModal = document.getElementById('scores-modal');
const closeScoresBtn = document.getElementById('close-scores');
const scoresTbody = document.getElementById('scores-tbody');

function renderScoresTable() {
    if (!scoresTbody) return;

    scoresTbody.innerHTML = "";

    for (let i = 0; i < numPlayers; i++) {
        const tr = document.createElement("tr");

       tr.innerHTML =
    `<td>${playerNames[i] || `Player ${i + 1}`}</td>
     <td>${playerScores[i]}</td>`;
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

if (scoresBtn) {
    scoresBtn.addEventListener('click', openScoresModal);
}

if (closeScoresBtn) {
    closeScoresBtn.addEventListener('click', closeScoresModal);
}

if (scoresModal) {
    scoresModal.addEventListener('click', (e) => {
        if (e.target === scoresModal) {
            closeScoresModal();
        }
    });
}


function rackPointSum(playerIdx) {
    return playerRacks[playerIdx].reduce(
        (sum, ch) => sum + (letterValues[ch] ?? 0),
        0
    );
}

function updateCurrentPlayerIdentity() {
    const identity =
        document.getElementById(
            "current-player-identity"
        );

    const nameElement =
        document.getElementById(
            "current-player-name"
        );

    const numberElement =
        document.getElementById(
            "current-player-number"
        );

    if (
        !identity ||
        !nameElement ||
        !numberElement
    ) {
        console.error(
            "Player identity HTML elements not found."
        );
        return;
    }


    const user =
        getCurrentUser();


    const username =
        user?.username ||
        "Player";


    // First try sessionStorage.
    const storedPlayerNumber =
        Number(
            sessionStorage.getItem(
                "onlinePlayerNumber"
            )
        );


    // If it exists, use it.
    // Otherwise use localPlayerNumber.
    const playerNumber =
        storedPlayerNumber >= 1
            ? storedPlayerNumber
            : localPlayerNumber;


    nameElement.textContent =
        username;


    numberElement.textContent =
        `Player ${playerNumber}`;


    // Always show it during the game.
    identity.style.display =
        "flex";


    console.log(
        "PLAYER IDENTITY:",
        {
            username,
            storedPlayerNumber,
            localPlayerNumber,
            displayedPlayerNumber:
                playerNumber
        }
    );
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


function endGame(wentOutPlayerIdx, message) {
    if (gameOver) return;

    const leftovers = playerRacks.map((_, i) => rackPointSum(i));
    const totalLeftover = leftovers.reduce((a, b) => a + b, 0);

    for (let i = 0; i < numPlayers; i++) {
        playerScores[i] -= leftovers[i];
    }

    if (wentOutPlayerIdx !== null) {
        playerScores[wentOutPlayerIdx] +=
            totalLeftover - leftovers[wentOutPlayerIdx];
    }

    updateTurnUI();
    disableGameUI();

    const maxScore = Math.max(...playerScores);
    const winners = [];

    for (let i = 0; i < numPlayers; i++) {
        if (playerScores[i] === maxScore) {
            winners.push(i + 1);
        }
    }

    // IMPORTANT:
    // Keep this as one clean template literal.
    // This avoids the syntax error that was breaking login.
    const finalScores =
        playerScores
            .map((s, i) => `Player ${i + 1}: ${s}`)
            .join('\n');

    alert(
        `${message}\n\nFinal scores:\n${finalScores}\n\nWinner: Player ${winners.join(', ')}`
    );

    if (gameStartedOnline) {
        saveOnlineGameState();
    }
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

    let sr = r;
    let sc = c;

    while (
        inBounds(sr - dr, sc - dc) &&
        hasTile(rcToIdx(sr - dr, sc - dc))
    ) {
        sr -= dr;
        sc -= dc;
    }

    let letters = "";
    let indices = [];

    let cr = sr;
    let cc = sc;

    while (inBounds(cr, cc) && hasTile(rcToIdx(cr, cc))) {
        const i = rcToIdx(cr, cc);

        letters += getTileLetter(i);
        indices.push(i);

        cr += dr;
        cc += dc;
    }

    return {
        word: letters,
        indices
    };
}


function scoreWord(wordIndices) {
    let base = 0;
    let wordMult = 1;

    for (const idx of wordIndices) {
        const sq = getSquare(idx);
        const letter = getTileLetter(idx).toUpperCase();

        let val = isBlankTile(idx)
            ? 0
            : (letterValues[letter] || 0);

        const isNew =
            sq.classList.contains("tile-placed") &&
            !sq.classList.contains("locked");

        if (isNew) {
            if (sq.classList.contains("dl")) {
                val *= 2;
            } else if (sq.classList.contains("tl")) {
                val *= 3;
            }

            if (
                sq.classList.contains("dw") ||
                sq.classList.contains("star")
            ) {
                wordMult *= 2;
            } else if (sq.classList.contains("tw")) {
                wordMult *= 3;
            }
        }

        base += val;
    }

    return base * wordMult;
}


function isFirstMove() {
    return document.querySelectorAll('.locked').length === 0;
}


function getLockedBoardIndices() {
    const s = new Set();

    for (let i = 0; i < 225; i++) {
        if (getSquare(i).classList.contains("locked")) {
            s.add(i);
        }
    }

    return s;
}


function newTileIndices() {
    const allSquares = [...board.children];

    const newTiles =
        [...document.querySelectorAll('.tile-placed:not(.locked)')];

    return newTiles.map(t => allSquares.indexOf(t));
}


function touchesLocked(newIdxs) {
    return newIdxs.some(idx => {
        const { r, c } = idxToRC(idx);

        const neigh = [
            [r - 1, c],
            [r + 1, c],
            [r, c - 1],
            [r, c + 1]
        ].filter(([rr, cc]) => inBounds(rr, cc));

        return neigh.some(([rr, cc]) =>
            getSquare(rcToIdx(rr, cc)).classList.contains("locked")
        );
    });
}


function rollbackNewTilesToRack() {
    const newTiles =
        [...document.querySelectorAll('.tile-placed:not(.locked)')];

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
window.startGame = async function (
    count,
    online = false,
    roomId = null,
    isHost = false,
    names = []
) {
    numPlayers = parseInt(count, 10);
    currentPlayer = 1;

    playerNames =
    names.length === numPlayers
        ? [...names]
        : Array.from(
            { length: numPlayers },
            (_, i) => `Player ${i + 1}`
        );

    if (roomId) {
        sessionStorage.setItem("onlineRoomId", roomId);
        console.log("ONLINE ROOM:", roomId);
    }

    playerScores = new Array(numPlayers).fill(0);

    playerRacks =
        new Array(numPlayers)
            .fill(null)
            .map(() => []);

    consecutiveScorelessTurns = 0;
    gameOver = false;

    document.getElementById('setup-overlay').style.display = 'none';
    document.getElementById('game-container').style.display = 'block';

    document.querySelectorAll('.player-side').forEach(el => {
        el.style.display = 'none';
    });

    for (let i = 0; i < numPlayers; i++) {
        const area =
            document.getElementById(`player-area-${i + 1}`);

        if (area) {
            area.style.display = 'flex';
setupPlayerArea(
    i + 1,
    playerNames[i]
);        }
    }


    // =========================
    // ONLINE GAME
    // =========================

    if (online && roomId) {

    gameStartedOnline = true;

    
    
    // Use the player number assigned by the backend.
const savedPlayerNumber =
    Number(
        sessionStorage.getItem(
            "onlinePlayerNumber"
        )
    );

if (
    savedPlayerNumber >= 1 &&
    savedPlayerNumber <= numPlayers
) {
    localPlayerNumber =
        savedPlayerNumber;
} else {
    console.error(
        "Invalid or missing online player number:",
        savedPlayerNumber
    );

    return;
}

console.log(
    "LOCAL PLAYER:",
    localPlayerNumber
);
updateCurrentPlayerIdentity();

console.log(
    "ROOM:",
    roomId
);

console.log(
    "TOTAL PLAYERS:",
    numPlayers
);

        const token =
            sessionStorage.getItem("scrabbleToken");


        // joining player
        if (!isHost) {
    console.log(
        "JOINER: waiting for host to start the game..."
    );

    let attempts = 0;

    // 60 attempts × 1 second gives the host
    // up to one minute to start the game.
    const maxAttempts = 60;

    while (attempts < maxAttempts) {
        try {
            const response =
                await fetch(
                    `${API_URL}/api/game-sessions/${roomId}/state`,
                    {
                        headers: {
                            "Authorization":
                                `Bearer ${token}`
                        }
                    }
                );

            if (response.ok) {
                const data =
                    await response.json();

                if (data.state) {
                    console.log(
                        "JOINER: host started the game."
                    );

                    await loadOnlineGameState(
                        data.state
                    );

                    startOnlineStatePolling();

                    return;
                }
            }

            // 404 is normal here.
            // It simply means the host has not
            // created the initial game state yet.
            if (
                response.status !== 404
            ) {
                console.error(
                    "JOINER: state request failed:",
                    response.status
                );
            }

        } catch (error) {
            console.error(
                "JOINER: could not check game state:",
                error
            );
        }

        attempts++;

        await new Promise(resolve =>
            setTimeout(resolve, 1000)
        );
    }

    console.error(
        "JOINER: timed out waiting for the host."
    );

    return;
}


       // =========================
// PLAYER 1 / HOST
// =========================

// Before creating a new game, check whether
// this room already has a saved shared state.
try {

    const response =
        await fetch(
            `${API_URL}/api/game-sessions/${roomId}/state`,
            {
                headers: {
                    "Authorization":
                        `Bearer ${token}`
                }
            }
        );

    if (response.ok) {

        const data =
            await response.json();

        if (data.state) {

            console.log(
                "HOST: existing game state found. Restoring it."
            );

            await loadOnlineGameState(
                data.state
            );

            startOnlineStatePolling();

            return;
        }
    }

} catch (error) {

    console.error(
        "HOST: could not check existing game state:",
        error
    );
}


// No saved state exists.
// This really is a brand-new game.

console.log(
    "HOST: no existing state. Creating shared game..."
);

initializeBag();
createBoard();

initHistoryTables();

for (let i = 0; i < numPlayers; i++) {
    fillRackArray(i);
}

updateTurnUI();
renderAllRacks();

await saveOnlineGameState();

console.log(
    "HOST: shared game state saved."
);

startOnlineStatePolling();

return;
    }

    // =========================
    // LOCAL GAME
    // =========================

    gameStartedOnline = false;

    initializeBag();
    createBoard();

    initHistoryTables();

    for (let i = 0; i < numPlayers; i++) {
        fillRackArray(i);
    }

    updateTurnUI();
    renderAllRacks();
};


async function waitForPlayers(
    roomId,
    requiredPlayers
) {
    const token =
        sessionStorage.getItem(
            "scrabbleToken"
        );

    // Make sure an old waiting interval
    // is not still running.
    stopOnlineWaiting();

    onlineWaitingInterval =
        setInterval(async () => {
            try {
                const response =
                    await fetch(
                        `${API_URL}/api/game-sessions/${roomId}/players`,
                        {
                            headers: {
                                "Authorization":
                                    `Bearer ${token}`
                            }
                        }
                    );

                const data =
                    await response.json();

                if (!response.ok) {
                    console.error(
                        "Could not check players:",
                        data.message
                    );

                    return;
                }

                const players =
                    Array.isArray(data.players)
                        ? data.players
                        : [];

                console.log(
                    `Waiting for players: ${players.length}/${requiredPlayers}`,
                    players
                );

                // Update waiting-room player list.
                const playersList =
                    document.getElementById(
                        "waiting-players"
                    );

                if (playersList) {
                    playersList.innerHTML = "";

                    players.forEach(player => {
                        const li =
                            document.createElement(
                                "li"
                            );

                        li.textContent =
                            player.username;

                        playersList.appendChild(
                            li
                        );
                    });
                }

                // Backend prevents the room
                // from exceeding requiredPlayers.
                if (
                    players.length ===
                    Number(requiredPlayers)
                ) {
                    stopOnlineWaiting();

                    console.log(
                        "Enough players joined. Host is starting the game."
                    );

                    document.getElementById(
                        "online-waiting"
                    ).style.display =
                        "none";

                    const names =
                        players.map(
                            player =>
                                player.username
                        );

                    await startGame(
                        Number(requiredPlayers),
                        true,
                        roomId,
                        true,
                        names
                    );
                }

            } catch (error) {
                console.error(
                    "Could not check players:",
                    error
                );
            }
        }, 3000);
}


function initHistoryTables() {
    const container =
        document.getElementById(
            "history-tables"
        );

    if (!container) return;

    container.innerHTML = "";
    playerHistoryTBodies = [];

    for (let i = 0; i < numPlayers; i++) {
        const playerNum = i + 1;

        const table =
            document.createElement("table");

        table.classList.add(
            "player-history-table"
        );

        table.id =
            `history-table-${playerNum}`;

        table.innerHTML = `
            <thead>
                <tr>
                    <th colspan="2">
                        Player ${playerNum} History
                    </th>
                </tr>
            </thead>
            <tbody id="history-tbody-${playerNum}"></tbody>
        `;

        container.appendChild(table);

        playerHistoryTBodies[i] =
            table.querySelector(
                `#history-tbody-${playerNum}`
            );
    }
}


function setupPlayerArea(
    pNum,
    username = `Player ${pNum}`
) {
    const area =
        document.getElementById(
            `player-area-${pNum}`
        );

    if (!area) return;

    area.innerHTML = `
        <div class="player-card">
            <h4>${username}</h4>
            <div
                class="score-display"
                id="score-${pNum}"
            >0</div>

            <div class="turn-badge">
                Your Turn
            </div>

            <div
                id="rack-${pNum}"
                class="rack-grid"
            ></div>
        </div>
    `;
}


function initializeBag() {
    tileBag = [];

    for (let letter in distribution) {
        for (
            let i = 0;
            i < distribution[letter];
            i++
        ) {
            tileBag.push(letter);
        }
    }
}


function drawTile() {
    if (tileBag.length === 0) {
        return null;
    }

    const randomIndex =
        Math.floor(
            Math.random() * tileBag.length
        );

    return tileBag.splice(
        randomIndex,
        1
    )[0];
}


function fillRackArray(playerIdx) {
    while (
        playerRacks[playerIdx].length < 7 &&
        tileBag.length > 0
    ) {
        playerRacks[playerIdx].push(
            drawTile()
        );
    }
}


const BAG_LETTER_ORDER =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZ?".split("");


function renderBagDisplay() {
    const grid =
        document.getElementById(
            "tile-bag-display"
        );

    const totalEl =
        document.getElementById(
            "tile-bag-total"
        );

    if (!grid) return;

    const counts = {};

    for (const ch of tileBag) {
        counts[ch] =
            (counts[ch] || 0) + 1;
    }

    grid.innerHTML =
        BAG_LETTER_ORDER
            .map(letter => {
                const n =
                    counts[letter] ?? 0;

                const displayLetter =
                    letter === "?"
                        ? "□"
                        : letter;

                return `
                    <div
                        class="bag-cell${n === 0 ? " bag-cell--empty" : ""}"
                        title="${letter === "?" ? "Blank" : letter}: ${n} remaining"
                    >
                        <span class="bag-cell-letter">
                            ${displayLetter}
                        </span>

                        <span class="bag-cell-count">
                            ${n}
                        </span>
                    </div>
                `;
            })
            .join("");

    if (totalEl) {
        totalEl.textContent =
            String(tileBag.length);
    }
}


// --- 3. Rendering ---
function createBoard() {
    if (!board) return;

    board.innerHTML = '';

    for (let i = 0; i < 225; i++) {
        const square =
            document.createElement('div');

        square.classList.add('square');

        if (tw.includes(i)) {
            square.classList.add('tw');
            square.innerText = 'TW';

        } else if (dw.includes(i)) {
            square.classList.add('dw');
            square.innerText = 'DW';

        } else if (tl.includes(i)) {
            square.classList.add('tl');
            square.innerText = 'TL';

        } else if (dl.includes(i)) {
            square.classList.add('dl');
            square.innerText = 'DL';

        } else if (i === 112) {
            square.classList.add('star');
            square.innerText = '★';
        }

        board.appendChild(square);
    }

    setupDropZones();
}


function getOnlineRoomId() {
    return sessionStorage.getItem(
        "onlineRoomId"
    );
}


function getBoardState() {
    return Array.from(board.children).map(square => ({
        // Only save actual tiles.
        // TW, DW, TL, DL and ★ are board labels, not tiles.
        letter: square.classList.contains("tile-placed")
            ? square.innerText
            : "",

        isBlank: square.classList.contains("tile-placed") &&
                 square.dataset.isBlank === "true",

        score: square.classList.contains("tile-placed")
            ? (square.dataset.score || null)
            : null,

        locked: square.classList.contains("locked")
    }));
}





function buildGameState() {
    return {
        tileBag: [...tileBag],

        numPlayers,

        currentPlayer,

        playerScores: [...playerScores],

        playerRacks:
            playerRacks.map(
                rack => [...rack]
            ),

        playerNames: [...playerNames],

        consecutiveScorelessTurns,

        gameOver,

        onlineStateVersion,

        board: getBoardState()
    };
}


async function saveOnlineGameState() {
    const roomId =
        getOnlineRoomId();

    const token =
        sessionStorage.getItem(
            "scrabbleToken"
        );

    if (
        !roomId ||
        !token ||
        !gameStartedOnline
    ) {
        return;
    }

    try {
        onlineStateVersion++;
        const response =
            await fetch(
                `${API_URL}/api/game-sessions/${roomId}/state`,
                {
                    method: "POST",

                    headers: {
                        "Authorization":
                            `Bearer ${token}`,

                        "Content-Type":
                            "application/json"
                    },

                    body:
                        JSON.stringify(
                            buildGameState()
                        )
                }
            );

        const data =
            await response.json();

       if (!response.ok) {

    if (response.status === 409) {

        console.warn(
            "State conflict detected. Reloading server state."
        );

        const latestResponse =
            await fetch(
                `${API_URL}/api/game-sessions/${roomId}/state`,
                {
                    headers: {
                        "Authorization":
                            `Bearer ${token}`
                    }
                }
            );

        if (latestResponse.ok) {

            const latestData =
                await latestResponse.json();

            if (latestData.state) {
                await loadOnlineGameState(
                    latestData.state
                );
            }
        }

        return;
    }

    console.error(
        "Could not save game state:",
        data
    );

    return;
}
        console.log(
            "ONLINE GAME STATE SAVED"
        );

    } catch (error) {
        console.error(
            "Could not save online game state:",
            error
        );
    }
}



async function loadOnlineGameState(state) {

    if (!state) return;

    gameStartedOnline = true;
    
    onlineStateVersion =
    Number(state.onlineStateVersion) || 0;

    numPlayers = state.numPlayers;
    currentPlayer = state.currentPlayer;

    playerScores = [...state.playerScores];

    playerRacks = state.playerRacks.map(
        rack => [...rack]
    );

    playerNames = state.playerNames
    ? [...state.playerNames]
    : Array.from(
        { length: numPlayers },
        (_, i) => `Player ${i + 1}`
    );

    tileBag = [...state.tileBag];

    consecutiveScorelessTurns =
        state.consecutiveScorelessTurns;

    gameOver = state.gameOver;

    document.getElementById('setup-overlay').style.display = 'none';
    document.getElementById('game-container').style.display = 'block';

    document.querySelectorAll('.player-side').forEach(el => {
        el.style.display = 'none';
    });

    for (let i = 0; i < numPlayers; i++) {

        const area =
            document.getElementById(`player-area-${i + 1}`);

        if (area) {
            area.style.display = 'flex';
           setupPlayerArea(
    i + 1,
    playerNames[i]
);
        }
    }

    // Recreate the normal empty board first.
    // This restores TW/DW/TL/DL/★ correctly.
    createBoard();

    // Restore ONLY real tiles.
    for (let i = 0; i < state.board.length; i++) {

        const savedSquare = state.board[i];
        const square = getSquare(i);

        // Empty saved square = no tile here.
        if (!savedSquare.letter) {
            continue;
        }

        square.innerText = savedSquare.letter;

        square.dataset.isBlank =
            savedSquare.isBlank ? "true" : "false";

        if (savedSquare.score !== null) {
            square.dataset.score = savedSquare.score;
        }

        // This is a real Scrabble tile.
        square.classList.add("tile-placed");

        if (savedSquare.locked) {
            square.classList.add("locked");
        }
    }

   initHistoryTables();

updateTurnUI();

renderAllRacks();

// Refresh the identity shown in the
// top-left after the shared game state
// has been completely restored.
updateCurrentPlayerIdentity();

console.log(
    "ONLINE GAME STATE LOADED"
);
}



// IMPORTANT:
// Do NOT use:
// if (currentPlayer === localPlayerNumber) return;
//
// That causes Player 2 to miss Player 1's move.

function startOnlineStatePolling() {
    if (onlineSyncInterval) {
        clearInterval(onlineSyncInterval);
    }

    onlineSyncInterval = setInterval(async () => {

        if (!gameStartedOnline) return;

        // Do not overwrite the board while this player
        // has tiles temporarily placed for the current move.
        // Do not overwrite the board while this player
// has tiles temporarily placed for the current move.
if (newTileIndices().length > 0) {
    return;
}

// Do not refresh the rack while the player
// is selecting tiles for exchange.
if (exchangeSelectionMode) {
    return;
}

        const roomId = getOnlineRoomId();
        const token = sessionStorage.getItem("scrabbleToken");

        if (!roomId || !token) return;

        try {

            const response = await fetch(
                `${API_URL}/api/game-sessions/${roomId}/state`,
                {
                    headers: {
                        "Authorization": `Bearer ${token}`
                    }
                }
            );

            if (!response.ok) return;

            const data = await response.json();

            if (data.state) {

    const serverVersion =
        Number(
            data.state.onlineStateVersion
        ) || 0;

    if (
        serverVersion >
        onlineStateVersion
    ) {
        await loadOnlineGameState(
            data.state
        );

        console.log(
            "ONLINE GAME STATE UPDATED:",
            serverVersion
        );
    }
}

        } catch (error) {

            console.error(
                "Could not sync online game state:",
                error
            );
        }

    }, 1000);
}



function renderAllRacks() {
    for (let i = 0; i < numPlayers; i++) {

       const rackElement =
    document.getElementById(
        `rack-${i + 1}`
    );

        if (!rackElement) continue;

        rackElement.innerHTML = '';

        const isCurrent =
            currentPlayer === i + 1;

        const playerArea =
            document.getElementById(`player-area-${i + 1}`);

        if (playerArea) {
            playerArea.classList.toggle(
                'active-turn',
                isCurrent
            );
        }

        playerRacks[i].forEach((letter, index) => {

            const tile =
                document.createElement('div');

            tile.classList.add('tile');

            tile.innerText = letter;

            tile.dataset.score =
                letterValues[letter] ?? 0;

            /*
             * Only the current player can interact
             * with their rack.
             */
            if (isCurrent && !gameOver) {

                tile.dataset.index = index;

                const touch = isTouchDevice();

                /*
                 * Show placement selection on touch devices.
                 */
                if (
                    touch &&
                    !exchangeSelectionMode &&
                    tileForPlacement &&
                    tileForPlacement.playerIdx === i &&
                    tileForPlacement.rackIndex === index
                ) {
                    tile.classList.add(
                        'selected-for-place'
                    );
                }

                /*
                 * EXCHANGE SELECTION
                 *
                 * This is intentionally handled separately
                 * from normal tile placement.
                 */
                tile.addEventListener('click', () => {

                    if (exchangeSelectionMode) {

                        tile.classList.toggle(
                            'selected-for-exchange'
                        );

                        tile.classList.remove(
                            'selected-for-place'
                        );

                        return;
                    }

                    /*
                     * Normal tile selection / placement.
                     */
                    if (touch) {

                        tileForPlacement = {
                            playerIdx: i,
                            rackIndex: index,
                            letter: letter
                        };

                        clearExchangeSelection();

                        exchangeSelectionMode = false;

                        renderAllRacks();
                    }
                });

                /*
                 * Desktop drag-and-drop.
                 */
                if (!touch) {

                    tile.setAttribute(
                        'draggable',
                        true
                    );

                    tile.addEventListener(
                        'dragstart',
                        (e) => {

                            /*
                             * Do not allow dragging while
                             * exchange mode is active.
                             */
                            if (exchangeSelectionMode) {
                                e.preventDefault();
                                return;
                            }

                            e.dataTransfer.setData(
                                'text/plain',
                                letter
                            );

                            e.dataTransfer.setData(
                                'source-index',
                                String(index)
                            );

                            tile.id = 'dragging-now';
                        }
                    );

                    tile.addEventListener(
                        'dragend',
                        () => {

                            if (
                                tile.id ===
                                'dragging-now'
                            ) {
                                tile.id = '';
                            }
                        }
                    );
                }

            } else {

                /*
                 * Other player's rack / inactive game.
                 */
                tile.classList.add(
                    'inactive-tile'
                );
            }

            rackElement.appendChild(tile);
        });
    }

    renderBagDisplay();
}


function updateTurnUI() {
    const indicator =
        document.getElementById(
            'player-turn-indicator'
        );

    if (indicator) {
      const currentName =
    playerNames[currentPlayer - 1]
    || `Player ${currentPlayer}`;

indicator.innerText =
    `${currentName}'s Turn`;
    }

    for (let i = 0; i < numPlayers; i++) {
        const s =
            document.getElementById(
                `score-${i + 1}`
            );

        if (s) {
            s.innerText =
                playerScores[i];
        }
    }
}


// --- 4. Drop Logic ---
function setupDropZones() {
    const squares =
        document.querySelectorAll(
            '.square'
        );
        

    const allSquares =
        Array.from(board.children);


    squares.forEach(square => {
        square.addEventListener(
            'dragover',
            (e) => e.preventDefault()
        );


        
square.addEventListener(
    'drop',
    (e) => {
        e.preventDefault();

        if (gameOver) return;

        if (!isLocalPlayerTurn()) {
            alert(`It is Player ${currentPlayer}'s turn.`);
            return;
        }


                let letter =
                    e.dataTransfer.getData(
                        'text/plain'
                    );

                const sourceIndex =
                    parseInt(
                        e.dataTransfer.getData(
                            'source-index'
                        ),
                        10
                    );


                let blankAs = null;

                if (letter === '?') {
                    blankAs =
                        (
                            prompt(
                                "Blank tile: choose a letter A-Z"
                            ) || ""
                        ).toUpperCase();

                    if (
                        !/^[A-Z]$/.test(
                            blankAs
                        )
                    ) {
                        alert(
                            "Invalid blank letter."
                        );

                        return;
                    }
                }


                const draggingTile =
                    document.getElementById(
                        'dragging-now'
                    );

                const targetIdx =
                    allSquares.indexOf(
                        square
                    );


                if (
                    square.classList.contains(
                        'tile-placed'
                    )
                ) {
                    return alert(
                        "Occupied!"
                    );
                }


                const boardHasAnyTiles =
                    document.querySelectorAll(
                        '.tile-placed'
                    ).length > 0;


                if (
                    !boardHasAnyTiles &&
                    targetIdx !== 112
                ) {
                    return alert(
                        "Start on the star!"
                    );
                }


                const currentTurnSquares =
                    Array.from(
                        document.querySelectorAll(
                            '.tile-placed:not(.locked)'
                        )
                    );


                if (
                    currentTurnSquares.length > 0
                ) {
                    const firstIdx =
                        allSquares.indexOf(
                            currentTurnSquares[0]
                        );

                    const a =
                        idxToRC(firstIdx);

                    const b =
                        idxToRC(targetIdx);


                    if (
                        currentTurnSquares.length === 1
                    ) {
                        if (
                            a.r !== b.r &&
                            a.c !== b.c
                        ) {
                            return alert(
                                "Play in a straight line!"
                            );
                        }

                    } else {
                        const secondIdx =
                            allSquares.indexOf(
                                currentTurnSquares[1]
                            );

                        const s =
                            idxToRC(secondIdx);

                        const isHoriz =
                            a.r === s.r;


                        if (
                            isHoriz &&
                            b.r !== a.r
                        ) {
                            return alert(
                                "Stay in the row!"
                            );
                        }

                        if (
                            !isHoriz &&
                            b.c !== a.c
                        ) {
                            return alert(
                                "Stay in the column!"
                            );
                        }
                    }
                }


                square.innerText =
                    letter === '?'
                        ? blankAs
                        : letter;

                square.dataset.isBlank =
                    letter === '?'
                        ? "true"
                        : "false";

                square.classList.add(
                    'tile-placed'
                );

                square.dataset.score =
                    letterValues[letter] ?? 0;


                playerRacks[
                    currentPlayer - 1
                ].splice(
                    sourceIndex,
                    1
                );


                if (draggingTile) {
                    draggingTile.remove();
                }


              
square.onclick = () => {
    if (
        square.classList.contains(
            'locked'
        ) ||
        gameOver
    ) {
        return;
    }

    if (!isLocalPlayerTurn()) {
        return;
    }



                    const returnLetter =
                        square.dataset.isBlank === "true"
                            ? "?"
                            : square.innerText;


                    square.innerText = '';

                    square.classList.remove(
                        'tile-placed'
                    );

                    square.dataset.isBlank =
                        "false";

                    delete square.dataset.score;

                    square.onclick = null;


                    playerRacks[
                        currentPlayer - 1
                    ].push(
                        returnLetter
                    );

                    renderAllRacks();
                };


                renderAllRacks();
            }
        );

        


        // Touch/click placement
       
square.addEventListener(
    'click',
    () => {
        if (gameOver) return;

        if (!isLocalPlayerTurn()) {
            alert(`It is Player ${currentPlayer}'s turn.`);
            return;
        }

        if (!isTouchDevice()) {
            return;
        }



                if (
                    square.classList.contains(
                        'tile-placed'
                    )
                ) {
                    return;
                }

                if (!tileForPlacement) {
                    return;
                }

                if (
                    tileForPlacement.playerIdx !==
                    currentPlayer - 1
                ) {
                    return;
                }


                let letter =
                    tileForPlacement.letter;

                const sourceIndex =
                    tileForPlacement.rackIndex;

                const targetIdx =
                    allSquares.indexOf(
                        square
                    );


                let blankAs = null;

                if (letter === '?') {
                    blankAs =
                        (
                            prompt(
                                "Blank tile: choose a letter A-Z"
                            ) || ""
                        ).toUpperCase();

                    if (
                        !/^[A-Z]$/.test(
                            blankAs
                        )
                    ) {
                        alert(
                            "Invalid blank letter."
                        );

                        return;
                    }
                }


                const boardHasAnyTiles =
                    document.querySelectorAll(
                        '.tile-placed'
                    ).length > 0;


                if (
                    !boardHasAnyTiles &&
                    targetIdx !== 112
                ) {
                    return alert(
                        "Start on the star!"
                    );
                }


                const currentTurnSquares =
                    Array.from(
                        document.querySelectorAll(
                            '.tile-placed:not(.locked)'
                        )
                    );


                if (
                    currentTurnSquares.length > 0
                ) {
                    const firstIdx =
                        allSquares.indexOf(
                            currentTurnSquares[0]
                        );

                    const a =
                        idxToRC(firstIdx);

                    const b =
                        idxToRC(targetIdx);


                    if (
                        currentTurnSquares.length === 1
                    ) {
                        if (
                            a.r !== b.r &&
                            a.c !== b.c
                        ) {
                            return alert(
                                "Play in a straight line!"
                            );
                        }

                    } else {
                        const secondIdx =
                            allSquares.indexOf(
                                currentTurnSquares[1]
                            );

                        const s =
                            idxToRC(secondIdx);

                        const isHoriz =
                            a.r === s.r;


                        if (
                            isHoriz &&
                            b.r !== a.r
                        ) {
                            return alert(
                                "Stay in the row!"
                            );
                        }

                        if (
                            !isHoriz &&
                            b.c !== a.c
                        ) {
                            return alert(
                                "Stay in the column!"
                            );
                        }
                    }
                }


                square.innerText =
                    letter === '?'
                        ? blankAs
                        : letter;

                square.dataset.isBlank =
                    letter === '?'
                        ? "true"
                        : "false";

                square.classList.add(
                    'tile-placed'
                );

                square.dataset.score =
                    letterValues[letter] ?? 0;


                playerRacks[
                    currentPlayer - 1
                ].splice(
                    sourceIndex,
                    1
                );


                clearPlacementSelection();


square.onclick = () => {
    if (
        square.classList.contains(
            'locked'
        ) ||
        gameOver
    ) {
        return;
    }

    if (!isLocalPlayerTurn()) {
        return;
    }




                    const returnLetter =
                        square.dataset.isBlank === "true"
                            ? "?"
                            : square.innerText;


                    square.innerText = '';

                    square.classList.remove(
                        'tile-placed'
                    );

                    square.dataset.isBlank =
                        "false";

                    delete square.dataset.score;

                    square.onclick = null;


                    playerRacks[
                        currentPlayer - 1
                    ].push(
                        returnLetter
                    );

                    renderAllRacks();
                };


                renderAllRacks();
            }
        );
    });
}


// --- 5. Handlers ---

async function exchangeSelectedTiles() {
    if (gameOver) return;

    if (!isLocalPlayerTurn()) {
        alert(`It is Player ${currentPlayer}'s turn.`);
        return;
    }



    const touch =
        isTouchDevice();

    const selected =
        document.querySelectorAll(
            '.selected-for-exchange'
        );


    if (!exchangeSelectionMode) {

    if (selected.length === 0) {

        exchangeSelectionMode = true;

        clearPlacementSelection();

        renderAllRacks();

        if (touch) {
            alert(
                "Tap the rack tiles you want to exchange, then press Exchange again."
            );
        }

        return;
    }


    } else {
        if (selected.length === 0) {
            return alert(
                "Select tiles to exchange first."
            );
        }
    }


    clearPlacementSelection();


    if (tileBag.length === 0) {
        return alert(
            "Tile bag is empty—cannot exchange."
        );
    }


    if (
        tileBag.length <
        selected.length
    ) {
        return alert(
            `Not enough tiles in the bag to exchange ${selected.length} tiles.`
        );
    }


    if (
        !confirm(
            `Exchange ${selected.length} tiles and skip turn?`
        )
    ) {
        return;
    }


    const indices =
        Array.from(selected)
            .map(t =>
                parseInt(
                    t.dataset.index,
                    10
                )
            )
            .sort(
                (a, b) => b - a
            );


    indices.forEach(idx => {
        const removed =
            playerRacks[
                currentPlayer - 1
            ].splice(
                idx,
                1
            )[0];

        tileBag.push(
            removed
        );
    });


    fillRackArray(
        currentPlayer - 1
    );


    consecutiveScorelessTurns += 1;


    if (
        consecutiveScorelessTurns >=
        MAX_SCORELESS_TURNS
    ) {
        endGame(
            null,
            `Game ended after ${MAX_SCORELESS_TURNS} consecutive scoreless turns.`
        );

        return;
    }


    exchangeSelectionMode = false;

    currentPlayer =
        (currentPlayer % numPlayers) + 1;

    updateTurnUI();
    renderAllRacks();


    // Save exchange online
    if (gameStartedOnline) {
        await saveOnlineGameState();
    }
}


const exchangeBtn =
    document.getElementById(
        'exchange-tiles'
    );

if (exchangeBtn) {
    exchangeBtn.addEventListener(
        'click',
        exchangeSelectedTiles
    );
}


// --- Online Dictionary ---
async function isWordValid(word) {
    const normalized =
        String(word || "")
            .trim()
            .toUpperCase();


    if (!normalized) {
        return false;
    }


    if (
        wordValidityCache.has(
            normalized
        )
    ) {
        return wordValidityCache.get(
            normalized
        );
    }


    try {
        const response =
            await fetch(
                `https://wordsohard.com/api/v1/check/${encodeURIComponent(normalized)}`
            );


        if (!response.ok) {
            console.error(
                "Scrabble API error:",
                response.status
            );

            return false;
        }


        const data =
            await response.json();


        const valid =
            data.results?.[0]?.valid === true;


        wordValidityCache.set(
            normalized,
            valid
        );


        return valid;

    } catch (error) {
        console.error(
            "Could not check word online:",
            error
        );

        return false;
    }
}


// --- Submit Word ---
const submitBtn =
    document.getElementById(
        'submit-word'
    );



submitBtn.addEventListener(
    'click',
    async () => {
        if (gameOver) return;

        if (!isLocalPlayerTurn()) {
            alert(`It is Player ${currentPlayer}'s turn.`);
            return;
        }




            exchangeSelectionMode = false;

            clearPlacementSelection();
            clearExchangeSelection();


            const newIdxs =
                newTileIndices();


            if (newIdxs.length === 0) {
                return;
            }


            const firstMove =
                isFirstMove();


            if (
                firstMove &&
                !newIdxs.includes(112)
            ) {
                alert(
                    "First move must cover the star!"
                );

                return;
            }


            // Determine direction
            let mainDr = 0;
            let mainDc = 1;

            let main = null;
            let extraSingleTileWord = null;


            if (newIdxs.length > 1) {
                const a =
                    idxToRC(
                        newIdxs[0]
                    );


                const sameRow =
                    newIdxs.every(
                        i =>
                            idxToRC(i).r ===
                            a.r
                    );


                const sameCol =
                    newIdxs.every(
                        i =>
                            idxToRC(i).c ===
                            a.c
                    );


                if (
                    !sameRow &&
                    !sameCol
                ) {
                    alert(
                        "Play in a straight line!"
                    );

                    return;
                }


                if (sameCol) {
                    mainDr = 1;
                    mainDc = 0;
                } else {
                    mainDr = 0;
                    mainDc = 1;
                }


                main =
                    getWordFrom(
                        newIdxs[0],
                        mainDr,
                        mainDc
                    );


                if (
                    main.word.length < 2
                ) {
                    alert(
                        "Words must be 2+ letters."
                    );

                    rollbackNewTilesToRack();

                    return;
                }

            } else {
                // One tile: check both directions
                const idx =
                    newIdxs[0];

                const horiz =
                    getWordFrom(
                        idx,
                        0,
                        1
                    );

                const vert =
                    getWordFrom(
                        idx,
                        1,
                        0
                    );


                const horizOk =
                    horiz.word.length >= 2;

                const vertOk =
                    vert.word.length >= 2;


                if (
                    !horizOk &&
                    !vertOk
                ) {
                    alert(
                        "Words must be 2+ letters."
                    );

                    rollbackNewTilesToRack();

                    return;
                }


                const horizWord =
                    horizOk
                        ? horiz
                        : null;

                const vertWord =
                    vertOk
                        ? vert
                        : null;


                const [
                    horizValid,
                    vertValid
                ] = await Promise.all([
                    horizWord
                        ? isWordValid(
                            horizWord.word
                        )
                        : Promise.resolve(false),

                    vertWord
                        ? isWordValid(
                            vertWord.word
                        )
                        : Promise.resolve(false)
                ]);


                if (
                    !horizValid &&
                    !vertValid
                ) {
                    alert(
                        "Neither horizontal nor vertical word is valid."
                    );

                    rollbackNewTilesToRack();

                    return;
                }


                if (
                    horizValid &&
                    vertValid
                ) {
                    const lockedBeforePick =
                        getLockedBoardIndices();


                    const hReuse =
                        horizWord.indices.some(
                            i =>
                                lockedBeforePick.has(i)
                        );


                    const vReuse =
                        vertWord.indices.some(
                            i =>
                                lockedBeforePick.has(i)
                        );


                    if (
                        vReuse &&
                        !hReuse
                    ) {
                        mainDr = 1;
                        mainDc = 0;

                        main =
                            vertWord;

                        extraSingleTileWord =
                            horizWord;

                    } else {
                        mainDr = 0;
                        mainDc = 1;

                        main =
                            horizWord;

                        extraSingleTileWord =
                            vertWord;
                    }

                } else if (horizValid) {
                    mainDr = 0;
                    mainDc = 1;

                    main =
                        horizWord;

                    if (vertWord) {
                        extraSingleTileWord =
                            vertWord;
                    }

                } else {
                    mainDr = 1;
                    mainDc = 0;

                    main =
                        vertWord;

                    if (horizWord) {
                        extraSingleTileWord =
                            horizWord;
                    }
                }
            }


            // Must connect to locked tiles
            if (
                !firstMove &&
                !touchesLocked(
                    newIdxs
                )
            ) {
                alert(
                    "Connect to an existing word!"
                );

                rollbackNewTilesToRack();

                return;
            }


            // Ensure all new tiles are inside main word
            const mainSet =
                new Set(
                    main.indices
                );


            const allNewInsideMain =
                newIdxs.every(
                    i => mainSet.has(i)
                );


            if (!allNewInsideMain) {
                alert(
                    "All placed tiles must be part of one contiguous word."
                );

                rollbackNewTilesToRack();

                return;
            }


            // Build cross words
            const crossDr =
                mainDr === 0
                    ? 1
                    : 0;

            const crossDc =
                mainDc === 1
                    ? 0
                    : 1;


            const wordsFormed = [
                main
            ];


            if (
                extraSingleTileWord
            ) {
                wordsFormed.push(
                    extraSingleTileWord
                );
            }


            for (const idx of newIdxs) {
                const w =
                    getWordFrom(
                        idx,
                        crossDr,
                        crossDc
                    );

                if (
                    w.word.length >= 2
                ) {
                    wordsFormed.push(w);
                }
            }


            // Custom rule:
            // Main word MUST be valid.
            // Invalid cross words are ignored.
            // Valid cross words are scored.
            const uniqueWords = [];

            const seenWordIndices =
                new Set();


            for (const w of wordsFormed) {
                const key =
                    w.indices.join(",");


                if (
                    seenWordIndices.has(
                        key
                    )
                ) {
                    continue;
                }


                seenWordIndices.add(
                    key
                );

                uniqueWords.push(
                    w
                );
            }


            // Main line must reuse an existing board letter
            if (!firstMove) {
                const lockedBefore =
                    getLockedBoardIndices();


                const mainUsesBoard =
                    main.indices.some(
                        idx =>
                            lockedBefore.has(
                                idx
                            )
                    );


                const extraUsesBoard =
                    extraSingleTileWord &&
                    extraSingleTileWord.indices.some(
                        idx =>
                            lockedBefore.has(
                                idx
                            )
                    );


                if (
                    !mainUsesBoard &&
                    !extraUsesBoard
                ) {
                    alert(
                        "Your play must cross an existing word—use at least one letter already on the board along your main line (a parallel word that only touches the sides is not allowed)."
                    );

                    rollbackNewTilesToRack();

                    return;
                }
            }


            let turnScore = 0;

            const mainKey =
                main.indices.join(",");


            // Main word must be valid
            const mainOk =
                await isWordValid(
                    main.word
                );


            if (!mainOk) {
                alert(
                    `"${main.word}" is invalid!`
                );

                rollbackNewTilesToRack();

                return;
            }


            // Main word always scores
            turnScore +=
                scoreWord(
                    main.indices
                );


            // Cross words only score when valid
            for (const w of uniqueWords) {
                if (
                    w.indices.join(",") ===
                    mainKey
                ) {
                    continue;
                }


                const ok =
                    await isWordValid(
                        w.word
                    );


                if (!ok) {
                    continue;
                }


                turnScore +=
                    scoreWord(
                        w.indices
                    );
            }


            // Bingo
            if (
                newIdxs.length === 7
            ) {
                turnScore += 50;
            }


            // Commit move
            playerScores[
                currentPlayer - 1
            ] += turnScore;


            consecutiveScorelessTurns = 0;


            // History
            const tbody =
                document.getElementById(
                    `history-tbody-${currentPlayer}`
                );


            if (tbody) {
                const tr =
                    document.createElement(
                        "tr"
                    );

                tr.classList.add(
                    "history-row"
                );


                const isBingo =
                    newIdxs.length === 7;


                if (isBingo) {
                    tr.classList.add(
                        "history-bingo"
                    );
                }


                tr.innerHTML = `
                    <td class="history-word-cell">
                        ${main.word}
                    </td>

                    <td class="history-points-cell">
                        +${turnScore}
                    </td>
                `;


                tbody.prepend(tr);
            }


            // Lock placed tiles
            const newlyPlacedSquares =
                [
                    ...document.querySelectorAll(
                        '.tile-placed:not(.locked)'
                    )
                ];


            newlyPlacedSquares.forEach(
                sq =>
                    sq.classList.add(
                        'locked'
                    )
            );


            // Refill rack
            fillRackArray(
                currentPlayer - 1
            );


            // End condition
            const pIdx =
                currentPlayer - 1;


            if (
                tileBag.length === 0 &&
                playerRacks[pIdx].length === 0
            ) {
                endGame(
                    pIdx,
                    `Player ${currentPlayer} used all tiles and the bag is empty.`
                );

                return;
            }


            // Next player
            currentPlayer =
                (currentPlayer % numPlayers) + 1;


            updateTurnUI();
            renderAllRacks();


            // Save successful move online
            if (gameStartedOnline) {
                await saveOnlineGameState();
            }
        }
    );



// Reset
const resetBtn =
    document.getElementById(
        'reset-board'
    );

if (resetBtn) {
    resetBtn.addEventListener(
        'click',
        () => location.reload()
    );
}


// =========================
// Authentication
// =========================

const API_URL = "https://scrabble-game-bhhj.onrender.com";


const authOverlay =
    document.getElementById(
        "auth-overlay"
    );

const loginForm =
    document.getElementById(
        "login-form"
    );

const registerForm =
    document.getElementById(
        "register-form"
    );


const loginButton =
    document.getElementById(
        "login-button"
    );

const registerButton =
    document.getElementById(
        "register-button"
    );


const showRegisterButton =
    document.getElementById(
        "show-register"
    );

const showLoginButton =
    document.getElementById(
        "show-login"
    );


const loginMessage =
    document.getElementById(
        "login-message"
    );

const registerMessage =
    document.getElementById(
        "register-message"
    );


// Switch to Register
showRegisterButton.addEventListener(
    "click",
    () => {
        loginForm.style.display =
            "none";

        registerForm.style.display =
            "block";

        loginMessage.textContent =
            "";
    }
);


// Switch to Login
showLoginButton.addEventListener(
    "click",
    () => {
        registerForm.style.display =
            "none";

        loginForm.style.display =
            "block";

        registerMessage.textContent =
            "";
    }
);


// Register
registerButton.addEventListener(
    "click",
    async () => {
        const username =
            document
                .getElementById(
                    "register-username"
                )
                .value
                .trim();

        const password =
            document.getElementById(
                "register-password"
            ).value;


        registerMessage.textContent =
            "";


        if (!username || !password) {
            registerMessage.textContent =
                "Please enter a username and password.";

            return;
        }


        try {
            const response =
                await fetch(
                    `${API_URL}/api/register`,
                    {
                        method: "POST",

                        headers: {
                            "Content-Type":
                                "application/json"
                        },

                        body:
                            JSON.stringify({
                                username:
                                    username,

                                password:
                                    password
                            })
                    }
                );


            const data =
                await response.json();


            if (response.ok) {
                registerMessage.textContent =
                    "Account created! You can now log in.";


                document.getElementById(
                    "register-username"
                ).value = "";

                document.getElementById(
                    "register-password"
                ).value = "";


                setTimeout(
                    () => {
                        registerForm.style.display =
                            "none";

                        loginForm.style.display =
                            "block";

                        registerMessage.textContent =
                            "";
                    },
                    1000
                );

            } else {
                registerMessage.textContent =
                    data.message ||
                    "Registration failed.";
            }

        } catch (error) {
            console.error(error);

            registerMessage.textContent =
                "Could not connect to the server.";
        }
    }
);


// Login
loginButton.addEventListener(
    "click",
    async () => {
        const username =
            document
                .getElementById(
                    "login-username"
                )
                .value
                .trim();

        const password =
            document.getElementById(
                "login-password"
            ).value;


        loginMessage.textContent =
            "";


        if (!username || !password) {
            loginMessage.textContent =
                "Please enter a username and password.";

            return;
        }


        try {
            const response =
                await fetch(
                    `${API_URL}/api/login`,
                    {
                        method: "POST",

                        headers: {
                            "Content-Type":
                                "application/json"
                        },

                        body:
                            JSON.stringify({
                                username:
                                    username,

                                password:
                                    password
                            })
                    }
                );


            const data =
                await response.json();


            if (response.ok) {
                // Save JWT
                sessionStorage.setItem(
                    "scrabbleToken",
                    data.token
                );


                // Save user
                sessionStorage.setItem(
                    "scrabbleUser",
                    JSON.stringify(
                        data.user
                    )
                );
                updateLobbyUser();


                loginMessage.textContent =
                    "Login successful!";


                // Hide authentication
                authOverlay.style.display =
                    "none";


                // Show game setup
                document.getElementById(
                    "setup-overlay"
                ).style.display =
                    "flex";

                    await loadMyGames();

            } else {
                loginMessage.textContent =
                    data.message ||
                    "Login failed.";
            }

        } catch (error) {
            console.error(error);

            loginMessage.textContent =
                "Could not connect to the server.";
        }
    }
);


async function restoreOnlineGame(gameSession) {

    const roomId =
        gameSession.roomId;

    const gameCode = 
         gameSession.gameCode;

    const token =
        sessionStorage.getItem(
            "scrabbleToken"
        );

    if (!roomId || !token) {
        console.log(
            "No saved room ID or token."
        );

        document.getElementById(
            "setup-overlay"
        ).style.display =
            "flex";

        return;
    }

    console.log(
        "Restoring online game:",
        roomId
    );

    try {

        // Ask the backend whether the game
        // still has a shared state.
        const response =
            await fetch(
                `${API_URL}/api/game-sessions/${roomId}/state`,
                {
                    method: "GET",

                    headers: {
                        "Authorization":
                            `Bearer ${token}`
                    }
                }
            );

        if (!response.ok) {

            console.log(
                "No active shared game state found."
            );

            document.getElementById(
                "setup-overlay"
            ).style.display =
                "flex";

            return;
        }

        const data =
            await response.json();

            // Refresh the saved session information
// using the current backend data.
const restoredSession = {
    id:
        data.gameSession.id,

    roomId:
        data.gameSession.roomId,

    status:
        data.gameSession.status,

    hostUserId:
        data.gameSession.hostUserId,

    requiredPlayers:
        Number(
            data.gameSession.requiredPlayers
        ),

    playerNumber:
        Number(data.playerNumber)
};

sessionStorage.setItem(
    "scrabbleGameSession",
    JSON.stringify(restoredSession)
);

sessionStorage.setItem(
    "onlineRoomId",
    restoredSession.roomId
);

sessionStorage.setItem(
    "onlinePlayerCount",
    restoredSession.requiredPlayers
);

sessionStorage.setItem(
    "onlinePlayerNumber",
    restoredSession.playerNumber
);

        if (!data.gameStarted) {

    console.log(
        "Room exists but game has not started yet."
    );

    const requiredPlayers =
        Number(
            data.gameSession.requiredPlayers
        );


        const restoredPlayerNumber =
    Number(data.playerNumber);

sessionStorage.setItem(
    "onlinePlayerNumber",
    restoredPlayerNumber
);

    const currentUser =
        JSON.parse(
            sessionStorage.getItem(
                "scrabbleUser"
            )
        );

    const isHost =
        currentUser &&
        Number(currentUser.id) ===
        Number(
            data.gameSession.hostUserId
        );

    // Keep the room information locally.
    sessionStorage.setItem(
        "onlineRoomId",
        roomId
    );

    sessionStorage.setItem(
        "onlinePlayerCount",
        requiredPlayers
    );

    // Keep the setup overlay visible because
// the waiting-room UI is inside it.
document.getElementById(
    "setup-overlay"
).style.display =
    "flex";

    if (isHost) {

        document.getElementById(
            "online-player-count"
        ).style.display =
            "none";

        document.getElementById(
            "online-waiting"
        ).style.display =
            "block";

        document.getElementById(
            "waiting-room-id"
        ).textContent =
             gameCode || roomId;

        console.log(
            "HOST: restored waiting room."
        );

        waitForPlayers(
            roomId,
            requiredPlayers
        );

    } else {

    console.log(
        "JOINER: restored waiting room as Player:",
        restoredPlayerNumber
    );

    // Keep this player's backend-assigned
    // player number.
    localPlayerNumber =
        restoredPlayerNumber;

    // The joiner should not see the host's
    // waiting-room controls.
    document.getElementById(
        "online-waiting"
    ).style.display =
        "none";

    // Wait for the host to create the
    // initial shared game state.
    await startGame(
        requiredPlayers,
        true,
        roomId,
        false
    );
}

return;

    return;
}
        console.log(
            "Saved online game state found."
        );

        // Hide setup screen.
        document.getElementById(
            "setup-overlay"
        ).style.display =
            "none";

        // Restore the shared game state.
        await loadOnlineGameState(
            data.state
        );

        gameStartedOnline = true;

       // Restore this user's player number
// directly from the backend.
localPlayerNumber =
    Number(data.playerNumber);

if (
    localPlayerNumber < 1 ||
    localPlayerNumber > numPlayers
) {
    console.error(
        "Invalid restored player number:",
        localPlayerNumber
    );

    document.getElementById(
        "setup-overlay"
    ).style.display =
        "flex";

    return;
}

sessionStorage.setItem(
    "onlinePlayerNumber",
    localPlayerNumber
);

console.log(
    "RESTORING AS PLAYER:",
    localPlayerNumber
);

        // Save room ID again.
        sessionStorage.setItem(
            "onlineRoomId",
            roomId
        );

        // Start synchronization again.
        startOnlineStatePolling();

    } catch (error) {

        console.error(
            "Could not restore online game:",
            error
        );

        document.getElementById(
            "setup-overlay"
        ).style.display =
            "flex";
    }
}


// Check saved login
async function checkSavedLogin() {
    const savedToken =
        sessionStorage.getItem(
            "scrabbleToken"
        );

    if (!savedToken) {
        return;
    }

    try {
        const response =
            await fetch(
                `${API_URL}/api/profile`,
                {
                    method: "GET",

                    headers: {
                        "Authorization":
                            `Bearer ${savedToken}`
                    }
                }
            );

        const data =
            await response.json();

        if (response.ok) {

            // Token is valid
            authOverlay.style.display =
                "none";

            sessionStorage.setItem(
                "scrabbleUser",
                JSON.stringify(
                    data.user
                )
            );

            // Check if the player was already
            // inside an online game.
            const savedGameSession =
                sessionStorage.getItem(
                    "scrabbleGameSession"
                );

            if (savedGameSession) {

                try {
                    const gameSession =
                        JSON.parse(
                            savedGameSession
                        );

                    console.log(
                        "Saved online game found:",
                        gameSession
                    );

                    // Try to restore the game
                    await restoreOnlineGame(
                        gameSession
                    );

                } catch (error) {

                    console.error(
                        "Could not restore saved game session:",
                        error
                    );

                    // If the saved session is invalid,
                    // show the normal setup screen.
                    document.getElementById(
                        "setup-overlay"
                    ).style.display =
                        "flex";
                }

            } else {

                // No saved game.
                // Show normal setup screen.
                document.getElementById(
                    "setup-overlay"
                ).style.display =
                    "flex";
            }

        } else {

            // Token invalid
            sessionStorage.removeItem(
                "scrabbleToken"
            );

            sessionStorage.removeItem(
                "scrabbleUser"
            );

            sessionStorage.removeItem(
                "scrabbleGameSession"
            );

            authOverlay.style.display =
                "flex";
        }

    } catch (error) {

        console.error(
            "Could not verify login:",
            error
        );
    }
}


checkSavedLogin();


// Logout
const logoutButton =
    document.getElementById(
        "logout-button"
    );


logoutButton.addEventListener(
    "click",
    () => {
        stopOnlineWaiting();

        // Stop online synchronization
        if (onlineSyncInterval) {

            clearInterval(
                onlineSyncInterval
            );

            onlineSyncInterval = null;
        }

        // Reset game state
        gameStartedOnline = false;
        localPlayerNumber = 1;

        exchangeSelectionMode = false;
        tileForPlacement = null;

        // Remove login information
        sessionStorage.removeItem(
            "scrabbleToken"
        );

        sessionStorage.removeItem(
            "scrabbleUser"
        );

        // Remove current game information
        sessionStorage.removeItem(
            "scrabbleGameSession"
        );

        sessionStorage.removeItem(
            "onlineRoomId"
        );

        sessionStorage.removeItem(
            "onlinePlayerCount"
        );

        // Hide game/setup
        document.getElementById(
            "game-container"
        ).style.display = "none";

        document.getElementById(
            "setup-overlay"
        ).style.display = "none";

        // Clear login fields
        document.getElementById(
            "login-username"
        ).value = "";

        document.getElementById(
            "login-password"
        ).value = "";

        loginMessage.textContent = "";

        // Show login
        authOverlay.style.display = "flex";
    }
);


// =========================
// Online Game Sessions
// =========================

async function createGameSession(requiredPlayers) {
        const token =
        sessionStorage.getItem(
            "scrabbleToken"
        );


    if (!token) {
        console.error(
            "No login token found."
        );

        return;
    }


    try {
        const response =
            await fetch(
                `${API_URL}/api/game-sessions`,
                {
                    method: "POST",

                    headers: {
                        "Authorization":
                            `Bearer ${token}`,

                        "Content-Type":
                            "application/json"
                    },
                    body: JSON.stringify({
    requiredPlayers: requiredPlayers
})
                }
            );


        const data =
            await response.json();


        if (response.ok) {
            console.log(
                "Game session created:",
                data.gameSession
            );


            sessionStorage.setItem(
                "scrabbleGameSession",
                JSON.stringify(
                    data.gameSession
                )
            );


            return data.gameSession;

        } else {
            console.error(
                "Could not create game session:",
                data.message
            );
        }

    } catch (error) {
        console.error(
            "Could not connect to the backend:",
            error
        );
    }
}


async function loadMyGames() {

    const token =
        sessionStorage.getItem(
            "scrabbleToken"
        );

    if (!token) {
        return;
    }

    try {

        const response =
            await fetch(
                `${API_URL}/api/my-games`,
                {
                    headers: {
                        "Authorization":
                            `Bearer ${token}`
                    }
                }
            );

        const data =
            await response.json();

        if (!response.ok) {
            console.error(
                "Could not load games:",
                data.message
            );

            return;
        }

        const activeGames =
    data.games
        .filter(game => {
            return !game.gameOver;
        })
        .slice(0, 5);

console.log(
    "ACTIVE GAMES:",
    activeGames
);

const myGamesSection =
    document.getElementById(
        "my-games-section"
    );

const myGamesList =
    document.getElementById(
        "my-games-list"
    );

const emptyMessage =
    document.getElementById(
        "my-games-empty"
    );

myGamesList.innerHTML = "";

if (activeGames.length === 0) {

    myGamesSection.style.display =
        "block";

    emptyMessage.style.display =
        "block";

    return;
}

emptyMessage.style.display =
    "none";

myGamesSection.style.display =
    "block";


activeGames.forEach(game => {

    const card =
        document.createElement(
            "div"
        );

    card.className =
        "my-game-card";


    // -------------------------
    // Player names
    // -------------------------

    const playerNames =
        game.players.map(
            player =>
                player.username
        );

    const missingPlayers =
        game.requiredPlayers -
        game.playerCount;

    let title =
        playerNames.join(" • ");

    if (missingPlayers > 0) {

        const waitingNames =
            Array(
                missingPlayers
            ).fill(
                "Waiting..."
            );

        title =
            [
                ...playerNames,
                ...waitingNames
            ].join(" • ");
    }


    // -------------------------
    // Game status
    // -------------------------

    let statusText = "";

    if (!game.gameStarted) {

        statusText =
            missingPlayers === 1
                ? "Waiting for 1 more player"
                : `Waiting for ${missingPlayers} more players`;

    } else if (
        Number(game.currentPlayer) ===
        Number(game.playerNumber)
    ) {

        statusText =
            "Your turn";

    } else {

        const currentPlayer =
            game.players.find(
                player =>
                    Number(
                        player.playerNumber
                    ) ===
                    Number(
                        game.currentPlayer
                    )
            );

        statusText =
            currentPlayer
                ? `${currentPlayer.username}'s turn`
                : "Game in progress";
    }


    // -------------------------
    // Card contents
    // -------------------------

    const titleElement =
        document.createElement(
            "div"
        );

    titleElement.className =
        "my-game-title";

    titleElement.textContent =
        title;


    const statusElement =
        document.createElement(
            "div"
        );

    statusElement.className =
        "my-game-status";

    statusElement.textContent =
        statusText;


    const continueButton =
        document.createElement(
            "button"
        );

    continueButton.type =
        "button";

    continueButton.className =
        "continue-game-button";

    continueButton.textContent =
        "Continue";

        continueButton.addEventListener(
    "click",
    async () => {

        console.log(
            "Continuing game:",
            game.roomId
        );

        const gameSession = {
            id:
                game.id,

            roomId:
                game.roomId,
            
            gameCode:
                 game.gameCode,

            status:
                game.status,

            hostUserId:
                game.hostUserId,

            requiredPlayers:
                Number(
                    game.requiredPlayers
                ),

            playerNumber:
                Number(
                    game.playerNumber
                )
        };


        sessionStorage.setItem(
            "scrabbleGameSession",
            JSON.stringify(
                gameSession
            )
        );

        sessionStorage.setItem(
            "onlineRoomId",
            game.roomId
        );

        sessionStorage.setItem(
            "onlinePlayerNumber",
            Number(
                game.playerNumber
            )
        );

        sessionStorage.setItem(
            "onlinePlayerCount",
            Number(
                game.requiredPlayers
            )
        );


        await restoreOnlineGame(
            gameSession
        );
    }
);


    card.appendChild(
        titleElement
    );

    card.appendChild(
        statusElement
    );

    card.appendChild(
        continueButton
    );

    myGamesList.appendChild(
        card
    );
});

    } catch (error) {

        console.error(
            "Could not load my games:",
            error
        );
    }
}


// =========================
// Exit Game
// =========================



const exitGameButton = document.getElementById("exit-game-button");

if (exitGameButton) {
    exitGameButton.addEventListener("click", async () => {
        stopOnlineWaiting();
        const confirmed = confirm("Are you sure you want to exit this game?");
        if (!confirmed) return;

        if (onlineSyncInterval) {
            clearInterval(onlineSyncInterval);
            onlineSyncInterval = null;
        }

        gameStartedOnline = false;
        localPlayerNumber = 1;

        sessionStorage.removeItem("scrabbleGameSession");
        sessionStorage.removeItem("onlineRoomId");
        sessionStorage.removeItem("onlinePlayerCount");
        sessionStorage.removeItem("onlinePlayerNumber");

        exchangeSelectionMode = false;
        tileForPlacement = null;

        document.getElementById(
    "game-container"
).style.display = "none";

document.getElementById(
    "setup-overlay"
).style.display = "flex";

showGameModeSelection();

// Refresh the player's games immediately
// after returning to the lobby.
await loadMyGames();

    });
}




// Online player count buttons
document.querySelectorAll(
    ".online-player-button"
).forEach(button => {
    button.addEventListener(
        "click",
        async () => {
            const count =
                parseInt(
                    button.dataset.players,
                    10
                );

            const gameSession =
                await createGameSession(count);

            if (!gameSession) {
                return;
            }

            sessionStorage.setItem(
                "onlinePlayerNumber",
                Number(gameSession.playerNumber)
            );

            sessionStorage.setItem(
                "onlinePlayerCount",
                count
            );

            document.getElementById(
                "online-player-count"
            ).style.display =
                "none";

            document.getElementById(
                "online-waiting"
            ).style.display =
                "block";

            document.getElementById(
    "waiting-room-id"
).textContent =
    gameSession.gameCode;


            waitForPlayers(
                gameSession.roomId,
                count
            );
        }
    );
});


document.getElementById(
    "leave-waiting-button"
).addEventListener(
    "click",
    async () => {

        if (onlineWaitingInterval) {
            clearInterval(
                onlineWaitingInterval
            );

            onlineWaitingInterval = null;
        }

        const gameSession =
            JSON.parse(
                sessionStorage.getItem(
                    "scrabbleGameSession"
                )
            );

        const token =
            sessionStorage.getItem(
                "scrabbleToken"
            );

        if (
            gameSession &&
            gameSession.roomId &&
            token
        ) {
            try {
                const response =
                    await fetch(
                        `${API_URL}/api/game-sessions/${gameSession.roomId}`,
                        {
                            method: "DELETE",
                            headers: {
                                "Authorization":
                                    `Bearer ${token}`
                            }
                        }
                    );

                const data =
                    await response.json();

                if (!response.ok) {
                    console.error(
                        "Could not cancel room:",
                        data.message
                    );

                    return;
                }

                console.log(
                    "Room cancelled:",
                    gameSession.roomId
                );

                sessionStorage.removeItem(
    "scrabbleGameSession"
);

sessionStorage.removeItem(
    "onlineRoomId"
);

sessionStorage.removeItem(
    "onlinePlayerNumber"
);

sessionStorage.removeItem(
    "onlinePlayerCount"
);

            } catch (error) {
                console.error(
                    "Could not cancel room:",
                    error
                );

                return;
            }
        }

        console.log(
            "Waiting cancelled"
        );

        document.getElementById(
            "online-waiting"
        ).style.display = "none";

        document.getElementById(
            "online-player-count"
        ).style.display = "block";
    }
);

// =========================
// Game Mode Menu
// =========================

const gameModeSelection =
    document.getElementById("game-mode-selection");

const localPlayerCount =
    document.getElementById("local-player-count");

const onlinePlayerCount =
    document.getElementById("online-player-count");

const joinGameForm =
    document.getElementById("join-game-form");

const onlineWaiting =
    document.getElementById("online-waiting");


function showGameModeSelection() {

    updateLobbyUser();

    gameModeSelection.style.display = "block";

    localPlayerCount.style.display = "none";
    onlinePlayerCount.style.display = "none";
    joinGameForm.style.display = "none";
    onlineWaiting.style.display = "none";
}


// Play local game
document.getElementById("local-game-button")
    .addEventListener("click", () => {

        gameModeSelection.style.display = "none";
        localPlayerCount.style.display = "block";
    });


// Create online game
document.getElementById("create-game-button")
    .addEventListener("click", () => {

        gameModeSelection.style.display = "none";
        onlinePlayerCount.style.display = "block";
    });


// Join online game
document.getElementById("join-game-button")
    .addEventListener("click", () => {

        gameModeSelection.style.display = "none";
        joinGameForm.style.display = "block";
    });


// Back buttons
document.getElementById("back-from-local")
    .addEventListener("click", showGameModeSelection);


document.getElementById("back-from-create")
    .addEventListener("click", showGameModeSelection);


document.getElementById("back-from-join")
    .addEventListener("click", () => {

        document.getElementById("room-id-input").value = "";
        document.getElementById("join-game-message").textContent = "";

        showGameModeSelection();
    });

// Join room
document.getElementById(
    "join-room-button"
).addEventListener(
    "click",
    async () => {

        // The player now enters the short game code,
        // for example: U0LTQ
        const gameCode =
            document.getElementById(
                "room-id-input"
            ).value
                .trim()
                .toUpperCase();

        const message =
            document.getElementById(
                "join-game-message"
            );

        const token =
            sessionStorage.getItem(
                "scrabbleToken"
            );

        if (!gameCode) {
            message.textContent =
                "Please enter a game code.";

            return;
        }

        try {

            // =========================
            // 1. FIND ROOM BY GAME CODE
            // =========================

            const findResponse =
                await fetch(
                    `${API_URL}/api/game-sessions/code/${encodeURIComponent(gameCode)}`,
                    {
                        headers: {
                            "Authorization":
                                `Bearer ${token}`
                        }
                    }
                );

            const findData =
                await findResponse.json();

            if (!findResponse.ok) {
                message.textContent =
                    findData.message ||
                    "Game code not found.";

                return;
            }

            // The player never needs to see this.
            // We use the real room ID internally.
            const roomId =
                findData.gameSession.roomId;

            console.log(
                "Game code:",
                gameCode
            );

            console.log(
                "Resolved room:",
                roomId
            );


            // =========================
            // 2. JOIN THE REAL ROOM
            // =========================

            const response =
                await fetch(
                    `${API_URL}/api/game-sessions/${roomId}/join`,
                    {
                        method: "POST",

                        headers: {
                            "Authorization":
                                `Bearer ${token}`,

                            "Content-Type":
                                "application/json"
                        }
                    }
                );

            const data =
                await response.json();

            if (response.ok) {

                message.textContent =
                    "Joined successfully!";

                console.log(
                    "Joined game:",
                    data.gameSession
                );

                sessionStorage.setItem(
                    "scrabbleGameSession",
                    JSON.stringify(
                        data.gameSession
                    )
                );

                document.getElementById(
                    "join-game-form"
                ).style.display =
                    "none";

                document.getElementById(
                    "online-waiting"
                ).style.display =
                    "none";

                document.getElementById(
                    "setup-overlay"
                ).style.display =
                    "none";


                // Use the player number and room size
                // assigned by the backend.
                const playerNumber =
                    Number(
                        data.gameSession.playerNumber
                    );

                const requiredPlayers =
                    Number(
                        data.gameSession.requiredPlayers
                    );

                console.log(
                    "JOINING AS PLAYER:",
                    playerNumber
                );

                console.log(
                    "ROOM REQUIRES:",
                    requiredPlayers,
                    "PLAYERS"
                );

                sessionStorage.setItem(
                    "onlinePlayerNumber",
                    playerNumber
                );

                sessionStorage.setItem(
                    "onlinePlayerCount",
                    requiredPlayers
                );

                await startGame(
                    requiredPlayers,
                    true,
                    roomId,
                    false
                );

            } else {

                message.textContent =
                    data.message;
            }

        } catch (error) {

            console.error(error);

            message.textContent =
                "Could not connect to the backend.";
        }
    }
);