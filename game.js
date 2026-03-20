// Curve Fever - HTML5 Canvas Game
(function () {
    'use strict';

    const ARENA_W = 800;
    const ARENA_H = 600;
    const LINE_WIDTH = 3;
    const SPEED = 2;
    const TURN_RATE = 0.05;
    const GAP_INTERVAL_MIN = 80;
    const GAP_INTERVAL_MAX = 200;
    const GAP_LENGTH = 8;
    const COUNTDOWN_SECONDS = 3;

    const PLAYER_DEFS = [
        { name: 'Red',     color: '#ff4444', left: 'ArrowLeft',  right: 'ArrowRight' },
        { name: 'Green',   color: '#44ff44', left: 'KeyA',       right: 'KeyD' },
        { name: 'Blue',    color: '#4488ff', left: 'KeyJ',       right: 'KeyL' },
        { name: 'Yellow',  color: '#ffdd00', left: 'Numpad4',    right: 'Numpad6' },
        { name: 'Magenta', color: '#ff44ff', left: 'KeyV',       right: 'KeyN' },
        { name: 'Cyan',    color: '#44ffff', left: 'BracketLeft',right: 'BracketRight' },
    ];

    const keyDisplayName = {
        'ArrowLeft': '\u2190', 'ArrowRight': '\u2192',
        'KeyA': 'A', 'KeyD': 'D',
        'KeyJ': 'J', 'KeyL': 'L',
        'Numpad4': 'Num4', 'Numpad6': 'Num6',
        'KeyV': 'V', 'KeyN': 'N',
        'BracketLeft': '[', 'BracketRight': ']',
    };

    const canvas = document.getElementById('arena');
    const ctx = canvas.getContext('2d');
    canvas.width = ARENA_W;
    canvas.height = ARENA_H;

    const menuEl = document.getElementById('menu');
    const sidebarEl = document.getElementById('sidebar');
    const scoreboardEl = document.getElementById('scoreboard');
    const controlsListEl = document.getElementById('controls-list');
    const playerListEl = document.getElementById('player-list');
    const startBtn = document.getElementById('start-btn');
    const roundMsgEl = document.getElementById('round-msg');
    const targetScoreEl = document.getElementById('target-score');

    let activePlayers = [0, 1]; // indices into PLAYER_DEFS
    let players = [];
    let collisionMap; // Uint8Array for pixel-level collision
    let gameRunning = false;
    let roundActive = false;
    let animFrameId = null;
    let matchOver = false;
    let targetScore = 10;

    const keysDown = {};

    // --- Input ---
    document.addEventListener('keydown', (e) => {
        keysDown[e.code] = true;
        if (e.code === 'Space' && gameRunning && !roundActive && !matchOver) {
            startRound();
        }
        if (e.code === 'Escape' && gameRunning) {
            stopGame();
            showMenu();
        }
    });
    document.addEventListener('keyup', (e) => {
        keysDown[e.code] = false;
    });

    // --- Menu ---
    function buildMenu() {
        playerListEl.innerHTML = '';
        PLAYER_DEFS.forEach((def, i) => {
            const active = activePlayers.includes(i);
            const row = document.createElement('div');
            row.className = 'player-setup';
            row.innerHTML = `
                <div class="name">
                    <span class="score-color" style="background:${def.color}"></span>
                    <span>${def.name}</span>
                </div>
                <div class="keys">${keyDisplayName[def.left]} / ${keyDisplayName[def.right]}</div>
                <button class="toggle-btn ${active ? 'active' : ''}" data-idx="${i}">
                    ${active ? 'ON' : 'OFF'}
                </button>
            `;
            playerListEl.appendChild(row);
        });
        playerListEl.querySelectorAll('.toggle-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const idx = parseInt(btn.dataset.idx);
                if (activePlayers.includes(idx)) {
                    if (activePlayers.length > 2) {
                        activePlayers = activePlayers.filter(i => i !== idx);
                    }
                } else {
                    activePlayers.push(idx);
                    activePlayers.sort((a, b) => a - b);
                }
                buildMenu();
            });
        });
    }

    function showMenu() {
        menuEl.style.display = 'block';
        canvas.style.display = 'none';
        sidebarEl.style.display = 'none';
        buildMenu();
    }

    function hideMenu() {
        menuEl.style.display = 'none';
        canvas.style.display = 'block';
        sidebarEl.style.display = 'flex';
    }

    startBtn.addEventListener('click', () => {
        hideMenu();
        startGame();
    });

    // --- Game ---
    function startGame() {
        matchOver = false;
        gameRunning = true;
        targetScore = (activePlayers.length - 1) * 10;
        targetScoreEl.textContent = targetScore;

        players = activePlayers.map(idx => {
            const def = PLAYER_DEFS[idx];
            return {
                name: def.name,
                color: def.color,
                leftKey: def.left,
                rightKey: def.right,
                score: 0,
                alive: true,
            };
        });

        buildControlsList();
        updateScoreboard();
        startRound();
    }

    function stopGame() {
        gameRunning = false;
        roundActive = false;
        if (animFrameId) cancelAnimationFrame(animFrameId);
        animFrameId = null;
    }

    function startRound() {
        if (matchOver) return;
        roundActive = false;

        // Reset collision map
        collisionMap = new Uint8Array(ARENA_W * ARENA_H);

        // Reset players
        players.forEach(p => {
            p.alive = true;
            p.x = 100 + Math.random() * (ARENA_W - 200);
            p.y = 100 + Math.random() * (ARENA_H - 200);
            p.angle = Math.random() * Math.PI * 2;
            p.gapTimer = GAP_INTERVAL_MIN + Math.random() * (GAP_INTERVAL_MAX - GAP_INTERVAL_MIN);
            p.gapCounter = 0;
            p.inGap = false;
        });

        // Clear canvas
        ctx.fillStyle = '#111';
        ctx.fillRect(0, 0, ARENA_W, ARENA_H);

        // Draw border
        ctx.strokeStyle = '#555';
        ctx.lineWidth = 2;
        ctx.strokeRect(1, 1, ARENA_W - 2, ARENA_H - 2);

        // Draw starting positions
        players.forEach(p => {
            ctx.beginPath();
            ctx.arc(p.x, p.y, 6, 0, Math.PI * 2);
            ctx.fillStyle = p.color;
            ctx.fill();
        });

        updateScoreboard();

        // Countdown
        let count = COUNTDOWN_SECONDS;
        showRoundMessage(count);
        const countInterval = setInterval(() => {
            count--;
            if (count > 0) {
                showRoundMessage(count);
            } else {
                clearInterval(countInterval);
                hideRoundMessage();
                roundActive = true;
                if (animFrameId) cancelAnimationFrame(animFrameId);
                gameLoop();
            }
        }, 1000);
    }

    function gameLoop() {
        if (!roundActive || !gameRunning) return;

        update();
        animFrameId = requestAnimationFrame(gameLoop);
    }

    function update() {
        const alivePlayers = players.filter(p => p.alive);

        if (alivePlayers.length <= 1) {
            roundActive = false;
            checkMatchEnd();
            return;
        }

        players.forEach(p => {
            if (!p.alive) return;

            // Steering
            if (keysDown[p.leftKey]) p.angle -= TURN_RATE;
            if (keysDown[p.rightKey]) p.angle += TURN_RATE;

            // Move
            const newX = p.x + Math.cos(p.angle) * SPEED;
            const newY = p.y + Math.sin(p.angle) * SPEED;

            // Gap logic
            p.gapCounter++;
            if (p.inGap) {
                if (p.gapCounter >= GAP_LENGTH) {
                    p.inGap = false;
                    p.gapCounter = 0;
                    p.gapTimer = GAP_INTERVAL_MIN + Math.random() * (GAP_INTERVAL_MAX - GAP_INTERVAL_MIN);
                }
            } else {
                if (p.gapCounter >= p.gapTimer) {
                    p.inGap = true;
                    p.gapCounter = 0;
                }
            }

            // Collision check (only when not in gap)
            if (!p.inGap) {
                if (checkCollision(newX, newY)) {
                    p.alive = false;
                    // Award 1 point to each surviving player
                    players.forEach(other => {
                        if (other !== p && other.alive) other.score++;
                    });
                    updateScoreboard();
                    // Draw death marker
                    ctx.beginPath();
                    ctx.arc(p.x, p.y, 5, 0, Math.PI * 2);
                    ctx.fillStyle = '#fff';
                    ctx.fill();
                    return;
                }
                // Draw trail and mark collision map
                drawTrail(p.x, p.y, newX, newY, p.color);
                markCollision(newX, newY);
            }

            p.x = newX;
            p.y = newY;
        });
    }

    function checkCollision(x, y) {
        const ix = Math.round(x);
        const iy = Math.round(y);

        // Wall collision
        if (ix <= 1 || ix >= ARENA_W - 2 || iy <= 1 || iy >= ARENA_H - 2) return true;

        // Trail collision - check a small area around the head
        for (let dx = -2; dx <= 2; dx++) {
            for (let dy = -2; dy <= 2; dy++) {
                const cx = ix + dx;
                const cy = iy + dy;
                if (cx >= 0 && cx < ARENA_W && cy >= 0 && cy < ARENA_H) {
                    if (collisionMap[cy * ARENA_W + cx]) return true;
                }
            }
        }
        return false;
    }

    function markCollision(x, y) {
        const ix = Math.round(x);
        const iy = Math.round(y);
        for (let dx = -1; dx <= 1; dx++) {
            for (let dy = -1; dy <= 1; dy++) {
                const cx = ix + dx;
                const cy = iy + dy;
                if (cx >= 0 && cx < ARENA_W && cy >= 0 && cy < ARENA_H) {
                    collisionMap[cy * ARENA_W + cx] = 1;
                }
            }
        }
    }

    function drawTrail(x1, y1, x2, y2, color) {
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.strokeStyle = color;
        ctx.lineWidth = LINE_WIDTH;
        ctx.lineCap = 'round';
        ctx.stroke();
    }

    function checkMatchEnd() {
        const winner = players.find(p => p.score >= targetScore);
        if (winner) {
            matchOver = true;
            showRoundMessage(`${winner.name} wins!`);
            setTimeout(() => {
                hideRoundMessage();
                showRoundMessage(`${winner.name} wins! Press Esc for menu`);
            }, 2000);
        } else {
            const alivePlayers = players.filter(p => p.alive);
            if (alivePlayers.length <= 1) {
                showRoundMessage('Press Space for next round');
            }
        }
        updateScoreboard();
    }

    // --- UI ---
    function updateScoreboard() {
        const sorted = [...players].sort((a, b) => b.score - a.score);
        scoreboardEl.innerHTML = sorted.map(p => `
            <div class="score-row" style="${!p.alive && roundActive ? 'opacity:0.4' : ''}">
                <span class="score-name">
                    <span class="score-color" style="background:${p.color}"></span>
                    ${p.name}
                </span>
                <span class="score-points" style="color:${p.color}">${p.score}</span>
            </div>
        `).join('');
    }

    function buildControlsList() {
        controlsListEl.innerHTML = players.map(p => `
            <div class="score-row" style="font-size:13px">
                <span class="score-name">
                    <span class="score-color" style="background:${p.color}"></span>
                    ${p.name}
                </span>
                <span>${keyDisplayName[p.leftKey]} / ${keyDisplayName[p.rightKey]}</span>
            </div>
        `).join('');
    }

    function showRoundMessage(msg) {
        roundMsgEl.textContent = msg;
        roundMsgEl.classList.add('show');
    }

    function hideRoundMessage() {
        roundMsgEl.classList.remove('show');
    }

    // Start
    showMenu();
})();
