// ==UserScript==
// @name         SoNiC STRIKER — Canvas Arcade
// @namespace    SoNiC
// @version      3.0.0
// @description  Mini shoot'em up arcade pour patienter entre deux raids
// @match        *://*.ogame.gameforge.com/*
// @match        *://*.ogame.gameforge.com/game/*
// @grant        none
// ==/UserScript==

(function () {
    'use strict';

    /* ============================================================
       SÉCURITÉ
    ============================================================ */

    if (window.__SONIC_STRIKER_RUNNING__) {
        return;
    }

    window.__SONIC_STRIKER_RUNNING__ = true;

    /* ============================================================
       CONFIGURATION
    ============================================================ */

    const CONFIG = {
        width: 900,
        height: 620,

        playerSpeed: 430,
        bulletSpeed: 720,

        enemySpawnBase: 1.4,

        shieldDuration: 10,
        levelDuration: 90   // secondes avant l'arrivée du boss
    };

    /* ============================================================
       ÉTAT DU JEU
    ============================================================ */

    let gameRunning = true;
    let gameStarted = false;
    let paused = false;
    let minimized = false;
let soundEnabled = true;
    let lastTime = performance.now();

    let score = 0;
    let hull = 100;
    let stats = newStats();
    let levelStats = [];
    let statHull = 100;
    let levelStartScore = 0;
    let endless = false;
    let recordBeaten = false;
    let bestScore = 0;
    try { bestScore = parseInt(localStorage.getItem('sonicStrikerBest'), 10) || 0; } catch (e) { /* ignoré */ }

    let weaponLevel = 1;
    let speedLevel = 1;

    let shieldTimer = 0;
    let damageFlash = 0;
let invincibilityTimer = 0;

    let fireCooldown = 0;
    let spawnTimer = 0;
    let difficultyTimer = 0;

    const keys = {};

    const bullets = [];
    const enemies = [];
    const enemyBullets = [];
    const particles = [];
    const bonuses = [];

    /* Niveau / boss */

    let level = 1;
    let levelTimer = 0;
    let levelIntroShown = false;
    let bossState = 0;          // 0 niveau, 1 alerte, 2 combat, 3 explosion, 4 victoire
    let bossWarningTimer = 0;
    let supplyIndex = 0;
    let boss = null;
    let victory = false;
    let mouseHeld = false;
    let lastDamage = 15;
    let shake = 0;
    let banner = null;

    /* v2.3 */

    let selectedShip = 0;
    let hoverShip = -1;
    const trails = [];

    try {
        const savedShip = parseInt(localStorage.getItem('sonicStrikerShip'), 10);
        if (savedShip >= 0 && savedShip <= 2) selectedShip = savedShip;
    } catch (e) { /* stockage indisponible */ }

    /* v2.4 : commandes réaffectables + code secret */

    const ACTIONS = [
        ['up', 'Haut', '↑'],
        ['down', 'Bas', '↓'],
        ['left', 'Gauche', '←'],
        ['right', 'Droite', '→'],
        ['fire', 'Tir', '✦']
    ];

    const DEFAULT_BINDS = { up: 'z', down: 's', left: 'q', right: 'd', fire: ' ' };
    const RESERVED_KEYS = ['p', 'enter', 'escape', '1', '2', '3', '4', '5'];

    let keyBinds = Object.assign({}, DEFAULT_BINDS);

    try {
        const kb = JSON.parse(localStorage.getItem('sonicStrikerKeys'));
        if (kb && ['up', 'down', 'left', 'right'].every(a => typeof kb[a] === 'string' && kb[a].length > 0)) {
            keyBinds = { up: kb.up, down: kb.down, left: kb.left, right: kb.right,
                fire: typeof kb.fire === 'string' && kb.fire.length > 0 ? kb.fire : ' ' };
        }
    } catch (e) { /* valeurs par défaut */ }

    let rebinding = null;
    let ultra = false;
    let secretBuffer = '';
    let lastShotSound = 0;

    /* v2.7 : lasers + apparitions du niveau */

    const beams = [];
    let beamHitCount = 0;
    let levelSpawned = {};
    /* ============================================================
   AUDIO — TIR
============================================================ */
const missileSound = new Audio(
    'https://raw.githubusercontent.com/sonicfr-jpg/SoNiC/main/missile_2%202-Analog.mp3'
);

missileSound.volume = 0.22;
missileSound.preload = 'auto';
    /* ============================================================
       BOUTON LAUNCHER
    ============================================================ */

    const launcher = document.createElement('button');

    launcher.id = 'sonic-striker-launcher';

    launcher.textContent = '🚀 STRIKER';

    launcher.style.cssText = `
        position:fixed;
        right:20px;
        bottom:20px;
        z-index:9999999;

        padding:10px 16px;

        background:linear-gradient(135deg,#123d61,#07131f);
        border:1px solid #45dfff;

        color:#b9e8ff;

        font-weight:bold;
        letter-spacing:2px;

        cursor:pointer;

        border-radius:4px;

        box-shadow:0 0 12px rgba(69,223,255,.35);
    `;

    document.body.appendChild(launcher);

    /* ============================================================
       FENÊTRE PRINCIPALE
    ============================================================ */

    const container = document.createElement('div');

    container.id = 'sonic-striker-game';

    container.style.cssText = `
        position:fixed;

        width:${CONFIG.width}px;
        height:${CONFIG.height}px;

        left:50%;
        top:50%;

        transform:translate(-50%,-50%);

        z-index:9999999;

        background:#030b15;

        border:1px solid #23628a;

        box-shadow:
            0 0 30px rgba(0,160,255,.25),
            0 0 80px rgba(0,0,0,.8);

        font-family:Arial,sans-serif;

        color:white;

        overflow:hidden;

        display:none;
    `;

    document.body.appendChild(container);
/* ============================================================
   BOUTON SON
============================================================ */

const soundButton = document.createElement('button');

soundButton.textContent = soundEnabled ? '🔊' : '🔇';

soundButton.title = 'Activer / désactiver les sons';

soundButton.style.position = 'absolute';
soundButton.style.top = '8px';
soundButton.style.left = '8px';
soundButton.style.zIndex = '20';

soundButton.style.width = '34px';
soundButton.style.height = '34px';

soundButton.style.padding = '0';
soundButton.style.border = '1px solid rgba(69,223,255,.6)';
soundButton.style.borderRadius = '6px';

soundButton.style.background = 'rgba(5,15,25,.85)';
soundButton.style.color = '#d7f5ff';

soundButton.style.fontSize = '17px';
soundButton.style.cursor = 'pointer';

soundButton.onclick = (event) => {

    event.stopPropagation();

    soundEnabled = !soundEnabled;

    soundButton.textContent =
        soundEnabled ? '🔊' : '🔇';
};
    container.appendChild(soundButton);
    /* ============================================================
       HEADER
    ============================================================ */

    const header = document.createElement('div');

    header.style.cssText = `
        height:48px;

        display:flex;
        align-items:center;

        padding:0 18px;

        background:linear-gradient(90deg,#10283b,#0b1723);

        border-bottom:1px solid #28526a;

        box-sizing:border-box;

        user-select:none;
    `;

    header.innerHTML = `
        <div style="
            font-size:22px;
            font-weight:bold;
            letter-spacing:4px;
            color:#b9e8ff;
            text-shadow:0 0 12px #4bc9ff;
        ">
            🚀 SoNiC STRIKER
        </div>

        <div style="
            margin-left:auto;
            display:flex;
            gap:18px;
            font-size:22px;
            color:#9ab7c8;
        ">
            <span id="sonic-minimize"
                  style="cursor:pointer">_</span>

            <span id="sonic-close"
                  style="cursor:pointer">×</span>
        </div>
    `;

    container.appendChild(header);

    /* ============================================================
       HUD
    ============================================================ */

    const hud = document.createElement('div');

    hud.style.cssText = `
        height:64px;

        display:flex;
        justify-content:space-around;
        align-items:center;

        background:#07131f;

        border-bottom:1px solid #23465d;

        box-sizing:border-box;

        font-size:12px;
        letter-spacing:2px;

        color:#8faabd;
    `;

    hud.innerHTML = `
        <div>
            SCORE<br>
            <b id="ss-score"
               style="font-size:20px;color:#fff">0</b>
        </div>

        <div>
            COQUE<br>
            <b id="ss-hull"
               style="font-size:20px;color:#5ee7ff">100%</b>
        </div>

        <div>
            ARME<br>
            <b id="ss-weapon"
               style="font-size:20px;color:#ffcf5a">LV1</b>
        </div>

        <div>
            VITESSE<br>
            <b id="ss-speed"
               style="font-size:20px;color:#54ff9a">LV1</b>
        </div>

        <div>
            BOUCLIER<br>
            <b id="ss-shield"
               style="font-size:20px;color:#7de8ff">OFF</b>
        </div>
    `;

    container.appendChild(hud);

    /* ============================================================
       CANVAS
    ============================================================ */

    const canvas = document.createElement('canvas');

    canvas.width = CONFIG.width;
    canvas.height = CONFIG.height - 48 - 64 - 34;

    canvas.style.cssText = `
        display:block;
        width:100%;
        cursor:crosshair;
        background:#030b15;
    `;

    const ctx = canvas.getContext('2d');

    container.appendChild(canvas);

    /* ============================================================
       FOOTER
    ============================================================ */

    const footer = document.createElement('div');

    footer.style.cssText = `
        height:34px;

        display:flex;
        align-items:center;
        justify-content:center;

        background:#08131e;

        border-top:1px solid #23465d;

        color:#9eb7c8;

        font-size:12px;
        letter-spacing:1px;
    `;

    refreshFooter();

    container.appendChild(footer);

    /* ============================================================
       JOUEUR
    ============================================================ */

    const player = {
        x: canvas.width / 2,
        y: canvas.height - 75,
        width: 54,
        height: 70
    };

    /* ============================================================
       ÉTOILES
    ============================================================ */

    const stars = [];

    for (let i = 0; i < 110; i++) {

        stars.push({
            x: Math.random() * canvas.width,
            y: Math.random() * canvas.height,
            size: Math.random() * 2 + 0.4,
            speed: Math.random() * 25 + 8
        });
    }

    /* ============================================================
       OUVERTURE DU JEU
    ============================================================ */

    launcher.onclick = () => {

        container.style.display = 'block';

        launcher.style.display = 'none';

        minimized = false;

        gameStarted = false;
        paused = false;

        lastTime = performance.now();
    };

    /* ============================================================
       FERMER
    ============================================================ */

    document.getElementById('sonic-close').onclick = () => {

        gameRunning = false;

        window.removeEventListener('keydown', gameKeyDown, true);
        window.removeEventListener('keyup', gameKeyUp, true);
            window.removeEventListener('mouseup', mouseUp);
            window.removeEventListener('blur', winBlur);

        container.remove();
        launcher.remove();

        window.__SONIC_STRIKER_RUNNING__ = false;
    };

    /* ============================================================
       RÉDUIRE
    ============================================================ */

    document.getElementById('sonic-minimize').onclick = () => {

        minimized = !minimized;

        canvas.style.display =
            minimized ? 'none' : 'block';

        hud.style.display =
            minimized ? 'none' : 'flex';

        footer.style.display =
            minimized ? 'none' : 'flex';

        container.style.height =
            minimized ? '48px' : CONFIG.height + 'px';
    };

    /* ============================================================
       CLAVIER
    ============================================================ */



    window.addEventListener('keydown', gameKeyDown, true);
    window.addEventListener('keyup', gameKeyUp, true);
    function mouseUp() { mouseHeld = false; }
    window.addEventListener('mouseup', mouseUp);
    window.addEventListener('blur', winBlur);

    /* ============================================================
       SOURIS
    ============================================================ */

    canvas.addEventListener('mousedown', event => {
  /* ============================================================
   RECOMMENCER APRÈS GAME OVER
============================================================ */

if (paused && (victory || hull <= 0)) {

            const vr = canvas.getBoundingClientRect();

            const vx = (event.clientX - vr.left) * (canvas.width / vr.width);
            const vy = (event.clientY - vr.top) * (canvas.height / vr.height);

            const id = endButtonAt(vx, vy);

            if (id === 'next' || id === 'endless') nextLevel();
            else if (id === 'again') restartGame();

            return;
        }
        /* ÉCRAN D'ACCUEIL */

        if (!gameStarted) {

            const rect = canvas.getBoundingClientRect();

            const x = (event.clientX - rect.left) * (canvas.width / rect.width);
            const y = (event.clientY - rect.top) * (canvas.height / rect.height);

            const hit = startScreenHit(x, y);

            rebinding = null;

            if (hit >= 0 && hit <= 2) chooseShip(hit);
            else if (hit === 10) startGame();
            else if (hit >= 20) rebinding = ACTIONS[hit - 20][0];

            return;
        }

        /* TIR */ if (!paused) { mouseHeld = true; shoot(); }
    });

    /* ============================================================
       TIR
    ============================================================ */

    function shoot() {

        if (fireCooldown > 0) return;

        fireCooldown = Math.max(0.10, 0.18 - weaponLevel * 0.015) * shipFireMul();

        const count = Math.min(weaponLevel, 5);
        stats.shots += count;
/* SON DE TIR */
if (soundEnabled && performance.now() - lastShotSound > 90) {
    lastShotSound = performance.now();
    for (let i = 0; i < Math.min(count, 2); i++) {
        setTimeout(() => {

    /* Vérifie encore l'état du son au moment de jouer */
    if (!soundEnabled) return;

    const sound = missileSound.cloneNode();
    sound.volume = 0.22;
    sound.play().catch(() => {});

}, i * 65);
    }
}
        if (count === 1) {

            bullets.push({
                x: player.x,
                y: player.y - 40,
                vx: 0,
                vy: -CONFIG.bulletSpeed
            });

            return;
        }

        for (let i = 0; i < count; i++) {

            const spread =
                (i - (count - 1) / 2) * 55;

            bullets.push({
                x: player.x,
                y: player.y - 35,
                vx: spread,
                vy: -CONFIG.bulletSpeed
            });
        }
    }

    /* ============================================================
       ENNEMIS
    ============================================================ */

    const enemyTypes = [

    /* ========================================================
       1 — SCOUT
       Rapide, nerveux, zigzag serré
    ======================================================== */

    {
        name: 'SCOUT',

        speed: 185,

        hp: 1,

        score: 100,

        size: 25,

        type: 'scout',

        movement: 'zigzag',

        damageZones: 1
    },


    /* ========================================================
       2 — CHASSEUR
       Plus large, mouvement en vagues
    ======================================================== */

    {
        name: 'CHASSEUR',

        speed: 125,

        hp: 3,

        score: 280,

        size: 34,

        type: 'fighter',

        movement: 'wave',

        damageZones: 2
    },


    /* ========================================================
       3 — CROISEUR
       Lourd, lent, déplacement latéral progressif
    ======================================================== */

    {
        name: 'CROISEUR',

        speed: 78,

        hp: 6,

        score: 650,

        size: 45,

        type: 'cruiser',

        movement: 'drift',

        damageZones: 3
    },


    /* ========================================================
       4 — INTERCEPTEUR
       Nouveau type !
       Rapide avec changements de direction
    ======================================================== */

    {
        name: 'INTERCEPTEUR',

        speed: 155,

        hp: 4,

        score: 450,

        size: 38,

        type: 'interceptor',
        movement: 'dash',
        damageZones: 2
    },

    /* ========================================================
       5 — COMÈTE
       Fonce en zigzag large en laissant une traîne de fumée
    ======================================================== */
    {
        name: 'COMÈTE',
        speed: 205,
        hp: 2,
        score: 380,
        size: 30,
        type: 'comet',
        movement: 'swoop',
        damageZones: 2
    },

    /* ========================================================
       6 — ESSAIM (niveau 3) : drones en formation, sans tir
    ======================================================== */
    {
        name: 'ESSAIM',
        speed: 240,
        hp: 1,
        score: 110,
        size: 18,
        type: 'drone',
        movement: 'swarm',
        damageZones: 1
    },

    /* 7 — MISSILIER : tire des missiles à tête chercheuse */
    {
        name: 'MISSILIER',
        speed: 80,
        hp: 4,
        score: 520,
        size: 34,
        type: 'missilier',
        movement: 'hover',
        hoverMin: 80,
        hoverMax: 140,
        glide: 70,
        stay: 12,
        damageZones: 2
    },

    /* 8 — MINEUR : sème des mines qui explosent en anneau */
    {
        name: 'MINEUR',
        speed: 90,
        hp: 5,
        score: 600,
        size: 36,
        type: 'mineur',
        movement: 'hover',
        hoverMin: 100,
        hoverMax: 170,
        glide: 105,
        stay: 13,
        damageZones: 2
    },

    /* 9 — SNIPER : laser à préavis */
    {
        name: 'SNIPER',
        speed: 75,
        hp: 4,
        score: 650,
        size: 30,
        type: 'sniper',
        movement: 'hover',
        hoverMin: 60,
        hoverMax: 110,
        glide: 35,
        stay: 14,
        damageZones: 2
    },

    /* ========================================================
       NIVEAU 4
    ======================================================== */

    /* 9 — FAUCHEUR : se fige, vise (trait rouge), puis fonce en ligne droite */
    {
        name: 'FAUCHEUR',
        speed: 120,
        hp: 3,
        score: 480,
        size: 28,
        type: 'lancer',
        movement: 'charge',
        damageZones: 2
    },

    /* 10 — BASTION : bouclier frontal qui absorbe les premiers tirs */
    {
        name: 'BASTION',
        speed: 70,
        hp: 5,
        score: 800,
        size: 38,
        type: 'bastion',
        movement: 'hover',
        hoverMin: 90,
        hoverMax: 150,
        glide: 60,
        stay: 14,
        damageZones: 3
    },

    /* 11 — ORBITEUR : tourne sur lui-même et lâche des anneaux de tirs */
    {
        name: 'ORBITEUR',
        speed: 62,
        hp: 4,
        score: 620,
        size: 30,
        type: 'orbiter',
        movement: 'orbit',
        damageZones: 2
    },

    /* 12 — SPECTRE : se camoufle (invulnérable), se téléporte, réapparaît en tirant */
    {
        name: 'SPECTRE',
        speed: 90,
        hp: 3,
        score: 720,
        size: 28,
        type: 'spectre',
        movement: 'phase',
        damageZones: 2
    },

    /* ========================================================
       NIVEAU 5
    ======================================================== */

    /* 13 — HARPIE : plongeur rapide qui suit le joueur puis se verrouille */
    {
        name: 'HARPIE',
        speed: 150,
        hp: 2,
        score: 560,
        size: 26,
        type: 'harpy',
        movement: 'harpy',
        damageZones: 2
    },

    /* 14 — RELAIS : protège les alliés proches (un tir sur deux absorbé) */
    {
        name: 'RELAIS',
        speed: 60,
        hp: 4,
        score: 900,
        size: 32,
        type: 'relay',
        movement: 'hover',
        hoverMin: 70,
        hoverMax: 120,
        glide: 40,
        stay: 16,
        damageZones: 3
    }
];

    function spawnEnemy(forcedIndex) {

        const type = pickEnemyType(forcedIndex);

        if (type.type === 'drone') {
            spawnDroneGroup(type);
            return;
        }

        enemies.push({

            x:
                60 +
                Math.random() *
                (canvas.width - 120),

            y: -60,

            type,

            hp: Math.ceil(type.hp * (1 + (level - 1) * 0.25)),

            phase:
                Math.random() *
                Math.PI * 2,
            direction:
    Math.random() < 0.5
        ? -1
        : 1,

 /* TIMER AVANT LE PROCHAIN TIR */

fireTimer: 1.5 + Math.random() * 2
        });

        initEnemyExtras(enemies[enemies.length - 1]);
    }

    /* ============================================================
       BONUS
    ============================================================ */

    function spawnBonus(x, y, forcedType) {

        const possibilities = [

            'weapon',
            'speed',
            'repair',
            'shield'

        ];

        if (level >= 4) possibilities.push('bomb');

        const type = forcedType || possibilities[Math.floor(Math.random() * possibilities.length)];

        bonuses.push({
            x,
            y,
            type,
            speed: 80
        });
    }

    /* ============================================================
       EXPLOSION
    ============================================================ */

    function explode(x, y, big = false, color) {

        const amount =
            big ? 38 : 18;

        for (let i = 0; i < amount; i++) {

            const angle =
                Math.random() *
                Math.PI * 2;

            const speed =
                Math.random() *
                (big ? 180 : 110);

            particles.push({

                x,
                y,

                vx:
                    Math.cos(angle) * speed,

                vy:
                    Math.sin(angle) * speed,

                life:
                    0.6 +
                    Math.random() * 0.5,

                size: big ? Math.random() * 5 + 2 : Math.random() * 3 + 1,
            color
            });
        }
    }

    /* ============================================================
       DISTANCE / COLLISION
    ============================================================ */

    function distance(a, b) {

        const dx = a.x - b.x;
        const dy = a.y - b.y;

        return Math.sqrt(
            dx * dx +
            dy * dy
        );
    }

    /* ============================================================
       UPDATE
    ============================================================ */

        /* ============================================================
       NIVEAU + BOSS DE FIN DE NIVEAU  (ajout v2.2)
    ============================================================ */

    const SUPPLY_TIMES = [22, 48, 72];      // largages de bonus pendant le niveau

    const SHIELD_RX = 195;                  // bouclier du boss (ellipse)
    const SHIELD_RY = 108;
    const HULL_RX = 160;                    // coque du boss (ellipse de collision)
    const HULL_RY = 70;
    const BOSS_CY = 18;                     // décalage vertical du centre de collision

    const CANNON = { L: [-118, 56], R: [118, 56], C: [0, 82] };

    const BOSS_PATTERNS = {
        1: ['cannons', 'fan', 'tracking'],
        2: ['cannons', 'fan', 'tracking', 'wall'],
        3: ['fan', 'tracking', 'wall', 'nova', 'cannons']
    };

    function clamp(v, lo, hi) {
        return Math.max(lo, Math.min(hi, v));
    }

    function angleDiff(a, b) {
        return Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b)));
    }

    function showBanner(text, sub, color, duration) {
        banner = {
            text,
            sub: sub || '',
            color: color || '#d7f5ff',
            t: 0,
            dur: duration || 2.5
        };
    }

    function spark(x, y, color, n) {
        for (let i = 0; i < n; i++) {
            const a = Math.random() * Math.PI * 2;
            const s = 40 + Math.random() * 120;
            particles.push({
                x, y,
                vx: Math.cos(a) * s,
                vy: Math.sin(a) * s,
                life: 0.25 + Math.random() * 0.3,
                size: Math.random() * 2 + 1,
                color
            });
        }
    }

    function fireAngle(x, y, angle, speed, size, extra) {
        enemyBullets.push(Object.assign({
            x, y,
            vx: Math.cos(angle) * speed,
            vy: Math.sin(angle) * speed,
            size
        }, extra || {}));
    }

    /* ------------------------------------------------------------
       TIRS DES ENNEMIS NORMAUX (tous les types tirent maintenant)
    ------------------------------------------------------------ */

    function enemyFire(enemy) {

        const kind = enemy.type.type;
        const speedMul = 1 + (level - 1) * 0.08;
        const rateMul = Math.max(0.6, 1 - (level - 1) * 0.08);
        const down = Math.PI / 2;

        if (kind === 'scout') {

            fireAngle(enemy.x, enemy.y + 22, down, 180 * speedMul, 5);
            enemy.fireTimer = (2.2 + Math.random() * 1.5) * rateMul;

        } else if (kind === 'fighter') {

            fireAngle(enemy.x - 30, enemy.y + 14, down, 210 * speedMul, 5);
            fireAngle(enemy.x + 30, enemy.y + 14, down, 210 * speedMul, 5);
            enemy.fireTimer = (2.4 + Math.random() * 1.2) * rateMul;

        } else if (kind === 'cruiser') {

            for (const off of [-0.28, 0, 0.28]) {
                fireAngle(enemy.x, enemy.y + 30, down + off, 200 * speedMul, 5);
            }
            enemy.fireTimer = (3 + Math.random() * 1.5) * rateMul;

        } else if (kind === 'drone') {

            enemy.fireTimer = 99;

        } else if (kind === 'missilier') {

            for (const side of [-1, 1]) {
                launchMissile(enemy.x + side * 30, enemy.y + 22, Math.PI / 2 + side * 0.6, speedMul, 10);
            }

            enemy.fireTimer = (3.8 + Math.random() * 1.2) * rateMul;

        } else if (kind === 'mineur') {

            dropMine(enemy.x, enemy.y + 28, false);

            enemy.fireTimer = (2.6 + Math.random() * 1.0) * rateMul;

        } else if (kind === 'sniper') {

            spawnBeam(enemy.x, enemy.y + 30, player.x, player.y, {
                warn: 1.05, fire: 0.4, w: 26, damage: 18, rgb: '255,77,77'
            });

            enemy.fireTimer = (4.2 + Math.random() * 1.2) * rateMul;

        } else if (kind === 'harpy') {

            enemy.fireTimer = 99;

        } else if (kind === 'relay') {

            ringShot(enemy.x, enemy.y, 6, 115 * speedMul, enemy.phase, 10);

            enemy.fireTimer = (3.6 + Math.random() * 0.8) * rateMul;

        } else if (kind === 'lancer') {

            enemy.fireTimer = 99;

        } else if (kind === 'bastion') {

            const a = Math.atan2(player.y - enemy.y, player.x - enemy.x);

            for (const off of [-0.17, 0, 0.17]) {
                fireAngle(enemy.x, enemy.y + 30, a + off, 215 * speedMul, 5, { color: '#7dd8ff' });
            }

            enemy.fireTimer = (3.0 + Math.random() * 1.0) * rateMul;

        } else if (kind === 'orbiter') {

            ringShot(enemy.x, enemy.y, 8, 135 * speedMul, enemy.phase, 10);

            enemy.fireTimer = (3.4 + Math.random() * 0.8) * rateMul;

        } else if (kind === 'spectre') {

            const a = Math.atan2(player.y - enemy.y, player.x - enemy.x);

            for (const off of [-0.09, 0.09]) {
                fireAngle(enemy.x, enemy.y + 24, a + off, 290 * speedMul, 5, { color: '#e6c8ff' });
            }

            enemy.fireTimer = 99;

        } else if (kind === 'comet') {

            const a = Math.atan2(player.y - enemy.y, player.x - enemy.x);

            for (const off of [-0.14, 0.14]) {
                fireAngle(enemy.x, enemy.y + 20, a + off, 235 * speedMul, 5, { color: '#ff9a4a' });
            }

            enemy.fireTimer = (2.4 + Math.random() * 1.0) * rateMul;

        } else {

            const a = Math.atan2(player.y - enemy.y, player.x - enemy.x);
            fireAngle(enemy.x, enemy.y + 25, a, 250 * speedMul, 5);
            enemy.fireTimer = (2.6 + Math.random() * 1.2) * rateMul;
        }
    }

    /* ------------------------------------------------------------
       LARGAGES DE BONUS
    ------------------------------------------------------------ */

    function dropSupply() {

        let type;

        if (weaponLevel < 3) type = 'weapon';
        else if (hull < 60) type = 'repair';
        else {
            const opts = ['weapon', 'shield', 'speed', 'repair'];
            if (level >= 4) opts.push('bomb', 'bomb');
            type = opts[Math.floor(Math.random() * opts.length)];
        }

        spawnBonus(90 + Math.random() * (canvas.width - 180), -30, type);
    }

    /* ------------------------------------------------------------
       APPARITION DU BOSS
       Ses points de vie s'adaptent à la puissance du joueur
       (niveau d'arme) et au numéro du niveau.
       60 % bouclier / 40 % coque.
    ------------------------------------------------------------ */

    function spawnBoss() {

        const kind = (level - 1) % 5;
        const def = BOSS_DEFS[kind];

        const total = (250 + 110 * (weaponLevel - 1)) * (1 + 0.35 * (level - 1)) * def.hp;

        const maxShield = Math.round(total * 0.6);
        const maxHull = Math.round(total * 0.4);

        boss = { kind, def, x: canvas.width / 2,
            y: -160,
            targetY: 125,
            dir: 1,
            t: 0,
            entering: true,
            phase: 1,
            shield: maxShield,
            maxShield,
            hull: maxHull,
            maxHull,
            hitFlash: 0,
            shieldFlash: 0,
            sinceHit: 0,
            stun: 0,
            attack: null,
            attackTimer: 2,
            lastAttack: '',
            ripples: [],
            dying: false,
            deathTimer: 0,
            smokeTimer: 0,
            sparkTimer: 0,
            chipTimer: 1
        };

        bossState = 2;
        spawnTimer = 0;

        if (weaponLevel < 3) dropSupply();

        showBanner(
            def.name + (level > 5 ? ' MK' + (Math.floor((level - 1) / 5) + 1) : ''),
            def.sub,
            def.color,
            3.2
        );
    }

    /* ------------------------------------------------------------
       ATTAQUES DU BOSS
    ------------------------------------------------------------ */

    function bossSpeedMul() {
        return (1.1 + (level - 1) * 0.06 + (boss ? (boss.phase - 1) * 0.05 : 0)) * (boss && boss.def.bulletMul ? boss.def.bulletMul : 1);
    }

    /* Un tir n'est jamais créé sur le joueur : zone de sécurité de 70 px */

    const BOSS_SAFE_RADIUS = 70;

    function bossShot(x, y, angle, speed, size, color) {

        if (Math.hypot(x - player.x, y - player.y) < BOSS_SAFE_RADIUS) return;

        fireAngle(x, y, angle, speed * bossSpeedMul(), size, {
            damage: Math.round(Math.min(18, 12 + (level - 1) * 2) * (boss && boss.def.dmg ? boss.def.dmg : 1)),
            color: color || '#ff9a3c',
            pat: boss && boss.attack ? boss.attack.type : ''
        });
    }

    function startBossAttack(b) {

        const pool = b.def.patterns[b.phase].filter(p => p !== b.lastAttack);

        const type = pool[Math.floor(Math.random() * pool.length)];

        b.lastAttack = type;

        b.attack = { type, t: 0, timer: 0, count: 0, gapX: 0, alt: false };
    }

    function runBossAttack(b, dt) {

        const a = b.attack;

        a.t += dt;
        a.timer -= dt;

        const delay = [0, 1.5, 1.05, 0.7][b.phase] * (b.def.delayMul || 1) *
            (1 - Math.min(0.3, (level - 1) * 0.1));

        const finish = () => {
            b.attack = null;
            b.attackTimer = delay;
        };

        const src = key => [b.x + CANNON[key][0], b.y + CANNON[key][1]];

        switch (a.type) {

            /* Salves de canons latéraux visés sur le joueur */

            case 'cannons': {

                if (a.timer > 0) break;

                a.timer = b.phase === 3 ? 0.42 : 0.6;

                const keys = b.phase === 3 ? ['L', 'R', 'C'] : ['L', 'R'];

                for (const k of keys) {
                    const [sx, sy] = src(k);
                    bossShot(sx, sy, Math.atan2(player.y - sy, player.x - sx), 300, 6);
                }

                a.count++;

                if (a.count >= [0, 3, 4, 5][b.phase]) finish();

                break;
            }

            /* Éventail : les fans successifs sont décalés d'un demi-pas */

            case 'fan': {

                if (a.timer > 0) break;

                a.timer = 0.65;

                const n = b.phase === 1 ? 5 : b.phase === 2 ? 6 : 7;
                const gap = 0.36;
                const offset = (a.count % 2) * gap / 2;
                const [sx, sy] = src('C');

                /* Phases 2-3 : un couloir libre est ménagé dans l'éventail,
                   à 90-170 px du joueur, et il ne bouge que peu d'une salve à l'autre */

                let laneAngle = null;

                if (b.phase >= 2) {

                    if (a.laneX === undefined) {
                        a.laneX = clamp(
                            player.x + (Math.random() < 0.5 ? -1 : 1) * (90 + Math.random() * 80),
                            90, canvas.width - 90
                        );
                    } else {
                        a.laneX = clamp(a.laneX + (Math.random() - 0.5) * 160, 90, canvas.width - 90);
                    }

                    laneAngle = Math.atan2(Math.max(player.y, sy + 120) - sy, a.laneX - sx);
                }

                for (let i = 0; i < n; i++) {

                    const ang = Math.PI / 2 + (i - (n - 1) / 2) * gap + offset;

                    if (laneAngle !== null && Math.abs(ang - laneAngle) < 0.34) continue;

                    bossShot(sx, sy, ang, 215, 6, '#ffcf5a');
                }

                a.count++;

                if (a.count >= (b.phase === 3 ? 4 : 3)) finish();

                break;
            }

            /* Rafale à visée continue : il faut bouger sans arrêt */

            case 'tracking': {

                if (a.timer <= 0) {

                    a.timer = 0.14;
                    a.alt = !a.alt;

                    const [sx, sy] = src(a.alt ? 'L' : 'R');

                    bossShot(
                        sx, sy,
                        Math.atan2(player.y - sy, player.x - sx),
                        270, 5, '#ffe36b'
                    );
                }

                if (a.t >= (b.phase === 3 ? 3.4 : 2.8)) finish();

                break;
            }

            /* Murs de projectiles avec une brèche à trouver */

            case 'wall': {

                if (a.timer > 0) break;

                a.timer = 0.95;

                const lo = 110;
                const hi = canvas.width - 110;

                if (a.count === 0) {

                    a.gapX = clamp(player.x + (Math.random() - 0.5) * 400, lo, hi);

                } else {

                    const shift = (Math.random() < 0.5 ? -1 : 1) *
                        (110 + Math.random() * 90);

                    a.gapX += shift;

                    if (a.gapX < lo || a.gapX > hi) a.gapX -= 2 * shift;

                    a.gapX = clamp(a.gapX, lo, hi);
                }

                for (let x = 32; x < canvas.width; x += 58) {

                    if (Math.abs(x - a.gapX) < 95) continue;

                    bossShot(x, b.y + 88, Math.PI / 2, 165, 6, '#ff6b3c');
                }

                a.count++;

                if (a.count >= (b.phase === 3 ? 4 : 3)) finish();

                break;
            }

            /* Nova : anneaux de projectiles (phase 3) */

            /* Spirale : bras rotatifs (2 puis 3 en phase 3) */

            case 'spiral': {

                if (a.angle === undefined) {
                    a.angle = Math.PI / 2;
                    a.sign = Math.random() < 0.5 ? -1 : 1;
                }

                if (a.timer <= 0) {

                    a.timer = 0.11;

                    const arms = b.phase === 3 ? 3 : 2;
                    const [sx, sy] = src('C');

                    a.angle += a.sign * 0.11;

                    for (let k = 0; k < arms; k++) {
                        bossShot(sx, sy, a.angle + k * (Math.PI * 2 / arms), 175, 5, '#d38bff');
                    }
                }

                if (a.t >= (b.phase === 3 ? 4.2 : 3.4)) finish();

                break;
            }

            /* Pluie : colonnes aléatoires, avec TOUJOURS un couloir libre
               (200 px) qui glisse doucement d'une vague à l'autre */

            case 'rain': {

                if (a.timer <= 0) {

                    a.timer = b.phase === 3 ? 0.34 : 0.42;

                    if (a.gapX === undefined) {
                        a.gapX = clamp(player.x + (Math.random() - 0.5) * 200, 120, canvas.width - 120);
                    } else {
                        a.gapX = clamp(a.gapX + (Math.random() - 0.5) * 180, 120, canvas.width - 120);
                    }

                    const cols = b.phase === 3 ? 6 : 5;
                    const xs = [];

                    let guard = 0;

                    while (xs.length < cols && guard++ < 80) {

                        const x = 40 + Math.random() * (canvas.width - 80);

                        if (Math.abs(x - a.gapX) < 100) continue;
                        if (xs.some(o => Math.abs(o - x) < 48)) continue;

                        xs.push(x);
                    }

                    for (const x of xs) {
                        bossShot(x, b.y + 90, Math.PI / 2, 210, 6, '#b48cff');
                    }
                }

                if (a.t >= (b.phase === 3 ? 4.0 : 3.2)) finish();

                break;
            }

            /* Missiles à tête chercheuse, lancés des deux hangars (abattables) */

            /* Rayons rotatifs : 1, 2 puis 3 faisceaux parallèles qui balaient l'écran.
               Le préavis (trait pointillé) montre la position de départ. */

            /* Vortex : le boss aspire doucement le joueur (très inférieur à sa vitesse)
               pendant qu'il lâche des anneaux percés d'un couloir libre. */

            case 'vortex': {

                if (!a.started) {
                    a.started = true;
                    a.endT = 4.4;
                }

                player.x = clamp(player.x + clamp((b.x - player.x) / 60, -1, 1) * 135 * dt, 35, canvas.width - 35);

                if (a.timer <= 0 && a.t < a.endT - 0.6) {

                    a.timer = 0.8;

                    const n = 14;
                    const [sx, sy] = src('C');
                    const rot = a.count * 0.37;
                    const laneAngle = Math.atan2(player.y - sy, player.x - sx) + (Math.random() - 0.5) * 0.4;

                    for (let i = 0; i < n; i++) {

                        const ang = rot + i * (Math.PI * 2 / n);

                        if (angleDiff(ang, laneAngle) < 0.55) continue;

                        bossShot(sx, sy, ang, 150, 6, '#ff5c8a');
                    }

                    a.count++;
                }

                if (a.t >= a.endT) finish();

                break;
            }

            case 'sweep': {

                if (!a.started) {

                    a.started = true;

                    const s = Math.random() < 0.5 ? -1 : 1;
                    const keys = b.phase === 1 ? ['C'] : b.phase === 2 ? ['L', 'R'] : ['L', 'C', 'R'];
                    const span = 1.5;
                    const speed = b.phase === 3 ? 0.58 : 0.5;
                    const start = Math.PI / 2 - s * span / 2;
                    const dmg = Math.round(20 * (b.def.dmg || 1));

                    for (const k of keys) {

                        const [sx, sy] = src(k);

                        spawnBeam(sx, sy, sx + Math.cos(start) * 100, sy + Math.sin(start) * 100, {
                            warn: 1.1,
                            fire: span / speed,
                            w: 26,
                            damage: dmg,
                            rgb: b.def.beam || '255,77,77',
                            spin: s * speed,
                            follow: [CANNON[k][0], CANNON[k][1]]
                        });
                    }

                    a.endT = 1.1 + span / speed + 0.5;
                }

                if (a.t >= a.endT) finish();

                break;
            }

            /* Météores : des lignes de préavis, puis les pierres tombent.
               Une colonne vise toujours la position actuelle du joueur. */

            case 'meteors': {

                if (a.timer > 0) break;

                a.timer = 1.0;

                const n = b.phase === 3 ? 6 : b.phase === 2 ? 5 : 4;
                const dmg = Math.round(Math.min(18, 13 + (level - 1)) * (b.def.dmg || 1));
                const xs = [clamp(player.x + (Math.random() - 0.5) * 40, 40, canvas.width - 40)];

                let guard = 0;

                while (xs.length < n && guard++ < 100) {

                    const x = 40 + Math.random() * (canvas.width - 80);

                    if (xs.some(o => Math.abs(o - x) < 70)) continue;

                    xs.push(x);
                }

                for (const x of xs) addMeteorWarning(x, 0.85, dmg);

                a.count++;

                if (a.count >= (b.phase === 3 ? 4 : 3)) finish();

                break;
            }

            /* Escorte : deux ou trois Faucheurs sortent des baies latérales */

            case 'summon': {

                const alive = enemies.filter(e => e.type.type === 'lancer').length;

                if (alive < 3) {

                    const n = b.phase === 3 ? 3 : 2;
                    const type = enemyTypes[9];

                    for (let k = 0; k < n; k++) {

                        const side = k % 2 ? 1 : -1;

                        const e = {
                            x: clamp(b.x + side * (150 + k * 18), 50, canvas.width - 50),
                            y: b.y + 70,
                            type,
                            hp: Math.ceil(type.hp * (1 + (level - 1) * 0.25)),
                            phase: Math.random() * 6.28,
                            direction: side,
                            fireTimer: 99
                        };

                        initEnemyExtras(e);

                        enemies.push(e);

                        spark(e.x, e.y, '255,210,100', 8);
                    }
                }

                finish();

                break;
            }

            case 'missiles': {

                if (a.timer > 0) break;

                a.timer = 1.0;

                const dmg = Math.round(Math.min(18, 12 + (level - 1) * 2) * (b.def.dmg || 1));

                for (const key of ['L', 'R']) {
                    const [sx, sy] = src(key);
                    launchMissile(sx, sy, Math.PI / 2 + (key === 'L' ? -0.5 : 0.5), bossSpeedMul(), dmg, 'missiles');
                }

                a.count++;

                if (a.count >= (b.phase === 1 ? 2 : 3)) finish();

                break;
            }

            /* Lasers : 3 ou 4 faisceaux étalés autour du joueur, préavis d'une seconde */

            case 'laser': {

                if (a.timer > 0) break;

                a.timer = 1.9;

                const n = b.phase === 3 ? 4 : 3;
                const origins = ['L', 'C', 'R'];

                for (let k = 0; k < n; k++) {

                    const [sx, sy] = src(origins[k % 3]);
                    const tx = clamp(player.x + (k - (n - 1) / 2) * 150, 40, canvas.width - 40);

                    spawnBeam(sx, sy, tx, Math.max(player.y, sy + 150), {
                        warn: 1.2, fire: 0.45, w: 30, damage: 20, rgb: b.def.beam || '255,77,77'
                    });
                }

                a.count++;

                if (a.count >= (b.phase === 1 ? 2 : 3)) finish();

                break;
            }

            /* Mines : dérivent, puis explosent en anneau */

            case 'mines': {

                if (a.timer > 0) break;

                a.timer = 0.4;

                const [sx, sy] = src('C');

                dropMine(sx + (Math.random() - 0.5) * 260, sy - 10, b.phase === 3, 'mines');

                a.count++;

                if (a.count >= (b.phase === 3 ? 6 : 4)) finish();

                break;
            }

            case 'nova': {

                if (a.timer > 0) break;

                a.timer = 0.75;

                const n = 16;
                const rot = (a.count % 2) * (Math.PI / n);
                const [sx, sy] = src('C');

                /* couloir libre : un secteur de l'anneau (~1 rad) est laissé vide,
                   à proximité de la direction du joueur */

                const laneAngle = Math.atan2(player.y - sy, player.x - sx) + (Math.random() - 0.5) * 0.5;

                for (let i = 0; i < n; i++) {

                    const ang = rot + i * (Math.PI * 2 / n);

                    if (angleDiff(ang, laneAngle) < 0.5) continue;

                    bossShot(sx, sy, ang, 165, 6, '#ff5cf0');
                }

                a.count++;

                if (a.count >= 3) finish();

                break;
            }
        }
    }

    /* ------------------------------------------------------------
       ÉVÉNEMENTS DU COMBAT
    ------------------------------------------------------------ */

    function breakShield(b) {

        b.shield = 0;
        b.phase = Math.max(b.phase, 2);
        b.stun = 1.3;
        b.hitFlash = 0.15;
        b.attack = null;
        b.attackTimer = 1.6;

        clearEnemyFire();

        shake = 14;
        score += 1500;

        for (let k = 0; k < 6; k++) {
            spark(
                b.x + (Math.random() - 0.5) * 300,
                b.y + (Math.random() - 0.5) * 150,
                b.def.spark, 14
            );
        }

        spawnBonus(
            90 + Math.random() * (canvas.width - 180),
            40,
            hull < 85 ? 'repair' : 'shield'
        );

        showBanner('BOUCLIER DÉTRUIT', 'Attaquez la coque !', '#7de8ff', 2.4);
    }

    function enrageBoss(b) {

        b.phase = 3;
        b.stun = 0.9;
        b.attack = null;
        b.attackTimer = 1.2;

        clearEnemyFire();

        shake = 10;
        score += 1000;

        spawnBonus(
            90 + Math.random() * (canvas.width - 180),
            40,
            hull < 90 ? 'repair' : 'shield'
        );

        if (b.def.secondShield) {

            b.shield = Math.round(b.maxShield * b.def.secondShield);
            b.sinceHit = 0;

            showBanner('BOUCLIER DE SECOURS', 'Brisez-le à nouveau !', b.def.color, 2.6);

        } else {

            showBanner('SURCHAUFFE', 'Le boss entre en fureur !', '#ff5365', 2.4);
        }
    }

    function killBoss(b) {

        b.hull = 0;
        lastBossName = b.def.name;
        stats.kills++;
        b.dying = true;
        b.deathTimer = 0;
        b.smokeTimer = 0;
        b.attack = null;

        bossState = 3;

        clearEnemyFire();

        for (const e of enemies) { stats.kills++; score += e.type.score;
            explode(e.x, e.y, true);
        }

        enemies.length = 0;

        showBanner('BOSS DÉTRUIT', '', '#ffcf5a', 3);
    }

    /* Tirs du joueur contre le boss : bouclier d'abord, coque ensuite */

    function bossTakeHits(b) {

        for (let i = bullets.length - 1; i >= 0; i--) {

            const bl = bullets[i];

            const dx = bl.x - b.x;
            const dy = bl.y - (b.y + BOSS_CY);

            if (b.shield > 0) {

                if ((dx * dx) / (SHIELD_RX * SHIELD_RX) +
                    (dy * dy) / (SHIELD_RY * SHIELD_RY) > 1) continue;

                bullets.splice(i, 1);

                b.shield -= 1;
                stats.hits++;
                stats.dmgDealt++;
                b.sinceHit = 0;
                b.shieldFlash = 0.12;
                score += 2;

                b.ripples.push({ x: bl.x, y: bl.y, life: 0.5, max: 0.5 });
                if (b.ripples.length > 14) b.ripples.shift();

                spark(bl.x, bl.y, '120,235,255', 3);

                if (b.shield <= 0) {
                    breakShield(b);
                    return;
                }

                continue;
            }

            if ((dx * dx) / (HULL_RX * HULL_RX) +
                (dy * dy) / (HULL_RY * HULL_RY) > 1) continue;

            bullets.splice(i, 1);

            b.hull -= 1;
            stats.hits++;
            stats.dmgDealt++;
            b.sinceHit = 0;
            b.hitFlash = 0.08;
            score += 5;

            spark(bl.x, bl.y, '255,170,70', 3);

            if (b.hull <= 0) {
                killBoss(b);
                return;
            }

            if (b.phase === 2 && b.hull <= b.maxHull * 0.5) {
                enrageBoss(b);
                return;
            }
        }
    }

    /* ------------------------------------------------------------
       MISE À JOUR : NIVEAU + BOSS
    ------------------------------------------------------------ */

    function updateBossSystem(dt) {

        stats.time += dt;

        if (banner) {
            banner.t += dt;
            if (banner.t >= banner.dur) banner = null;
        }

        if (shake > 0) shake = Math.max(0, shake - 22 * dt);

        updateBeams(dt);
        shootDownEnemyFire();
        updateWarnLines(dt);
        if (bombFlash > 0) bombFlash -= dt;

        if (!levelIntroShown) {
            levelIntroShown = true;
            showBanner(
                'NIVEAU ' + level + ' — ' + stageTheme().short,
                level === 1 ? 'Survivez… un boss vous attend'
                : level === 2 ? 'Les Comètes laissent des traînées de fumée'
                : level === 3 ? 'Nouveau : essaims, missiles, mines et snipers laser'
                : level === 4 ? 'Nouveau : faucheurs, bastions, orbiteurs, spectres… et bombes'
                : level >= 5 ? 'Nouveau : harpies téléguidées et relais de bouclier'
                : 'Tous les ennemis sont de retour… en plus coriaces',
                '#7de8ff',
                2.6
            );
        }

        /* --- Niveau en cours --- */

        if (bossState === 0) {

            levelTimer += dt;

            if (supplyIndex < SUPPLY_TIMES.length &&
                levelTimer >= SUPPLY_TIMES[supplyIndex]) {
                supplyIndex++;
                dropSupply();
            }

            if (levelTimer >= CONFIG.levelDuration) {
                bossState = 1;
                bossWarningTimer = 4;
                showBanner('⚠ ALERTE ⚠', 'Signature énergétique massive détectée…', '#ff5365', 4);
            }

            return;
        }

        /* --- Alerte avant le boss --- */

        if (bossState === 1) {
            bossWarningTimer -= dt;
            if (bossWarningTimer <= 0) spawnBoss();
            return;
        }

        if (!boss) return;

        const b = boss;

        b.t += dt;

        if (b.hitFlash > 0) b.hitFlash -= dt;
        if (b.shieldFlash > 0) b.shieldFlash -= dt;

        for (let i = b.ripples.length - 1; i >= 0; i--) {
            b.ripples[i].life -= dt;
            if (b.ripples[i].life <= 0) b.ripples.splice(i, 1);
        }

        /* --- Agonie --- */

        if (b.dying) {

            b.deathTimer += dt;
            b.smokeTimer -= dt;

            if (b.smokeTimer <= 0) {
                b.smokeTimer = 0.12;
                explode(
                    b.x + (Math.random() - 0.5) * 260,
                    b.y + (Math.random() - 0.5) * 120,
                    Math.random() < 0.5
                );
                shake = Math.max(shake, 6);
            }

            b.y += 8 * dt;

            if (b.deathTimer >= 3) {

                for (let k = 0; k < 10; k++) {
                    explode(
                        b.x + (Math.random() - 0.5) * 300,
                        b.y + (Math.random() - 0.5) * 140,
                        true
                    );
                }

                shake = 18;
                score += 5000 * level;

                boss = null;
                bossState = 4;
                finishLevelStats();
                victory = true;
                paused = true;
            }

            return;
        }

        /* --- Entrée en scène --- */

        if (b.entering) {

            b.y += 70 * dt;

            if (b.y >= b.targetY) {
                b.y = b.targetY;
                b.entering = false;
                b.attackTimer = 1.4;
            }

            bossTakeHits(b);

            return;
        }

        /* --- Tirs du joueur --- */

        bossTakeHits(b);

        if (!boss || b.dying) return;

        /* --- Étourdissement (bouclier brisé / surchauffe) --- */

        if (b.stun > 0) {
            b.stun -= dt;
            b.y = b.targetY + Math.sin(b.t * 40) * 2;
            return;
        }

        /* --- Déplacement --- */

        const moveSpeed = b.def.speeds[b.phase] * (1 + (level - 1) * 0.08);

        b.x += b.dir * moveSpeed * dt;

        if (b.x < 210) { b.x = 210; b.dir = 1; }
        if (b.x > canvas.width - 210) { b.x = canvas.width - 210; b.dir = -1; }

        b.y = b.targetY + Math.sin(b.t * 1.4) * 10;

        /* --- Régénération lente du bouclier s'il n'est pas attaqué --- */

        b.sinceHit += dt;

        if (b.shield > 0 && b.shield < b.maxShield && b.sinceHit > 3) {
            b.shield = Math.min(b.maxShield, b.shield + b.maxShield * b.def.regen * dt);
        }

        /* --- Étincelles quand la coque est en feu --- */

        if (b.phase === 3) {
            b.sparkTimer -= dt;
            if (b.sparkTimer <= 0) {
                b.sparkTimer = 0.28;
                explode(
                    b.x + (Math.random() - 0.5) * 220,
                    b.y + (Math.random() - 0.5) * 90,
                    false
                );
            }
        }

        /* --- Tirs de harcèlement (phases 2 et 3) : une balle visée en continu --- */

        if (b.def.supplyEvery) {

            b.supplyTimer = (b.supplyTimer === undefined ? b.def.supplyEvery : b.supplyTimer) - dt;

            if (b.supplyTimer <= 0) {
                b.supplyTimer = b.def.supplyEvery;
                spawnBonus(90 + Math.random() * (canvas.width - 180), 40, hull < 80 ? 'repair' : 'shield');
            }
        }

        if (b.phase >= 2) { b.chipTimer -= dt;

            if (b.chipTimer <= 0) {

                b.chipTimer = b.phase === 3 ? 1.0 : 1.6;

                const sx = b.x + (Math.random() < 0.5 ? CANNON.L[0] : CANNON.R[0]);
                const sy = b.y + CANNON.L[1];

                bossShot(sx, sy, Math.atan2(player.y - sy, player.x - sx), 250, 5, '#ffe36b');
            }
        }

        /* --- Attaques --- */

        if (b.attack) {
            runBossAttack(b, dt);
        } else {
            b.attackTimer -= dt;
            if (b.attackTimer <= 0) startBossAttack(b);
        }
    }

    /* ------------------------------------------------------------
       NIVEAU SUIVANT / RECOMMENCER
    ------------------------------------------------------------ */

    function resetField() {

        stats = newStats();
        statHull = hull;
        levelStartScore = score;

        bullets.length = 0;
        enemies.length = 0;
        clearEnemyFire();
        particles.length = 0;
        bonuses.length = 0;
        trails.length = 0;

        player.x = canvas.width / 2;
        player.y = canvas.height - 75;

        levelTimer = 0;
        levelIntroShown = false;
        levelSpawned = {};
        supplyIndex = 0;
        bossState = 0;
        boss = null;
        victory = false;
        banner = null;
        shake = 0;
        mouseHeld = false;

        fireCooldown = 0;
        spawnTimer = 0;
        damageFlash = 0;
    }

    function nextLevel() {

        if (level >= 5) endless = true;

        level++;

        resetField();

        hull = Math.min(100, hull + 35);
        shieldTimer = Math.max(shieldTimer, 3);
        invincibilityTimer = 1.5;

        paused = false;
        lastTime = performance.now();

        updateHUD();
    }

    function restartGame() {

        levelStats = [];
        endless = false;
        recordBeaten = false;

        score = 0;
        hull = 100;

        level = 1;

        weaponLevel = 1;
        speedLevel = 1;

        shieldTimer = 0;
        invincibilityTimer = 0;
        difficultyTimer = 0;

        resetField();

        paused = false;
        gameStarted = true;

        lastTime = performance.now();

        updateHUD();
    }

    /* ------------------------------------------------------------
       DESSIN DU BOSS
    ------------------------------------------------------------ */

    function drawBossShield(b, now) {

        const frac = b.shield / b.maxShield;

        /* cyan quand il est plein, ambre quand il faiblit */

        const c0 = b.def.shield;
        const r = Math.round(c0[0] + (1 - frac) * (255 - c0[0]));
        const g = Math.round(c0[1] + (1 - frac) * (160 - c0[1]));
        const bl = Math.round(c0[2] + (1 - frac) * (40 - c0[2]));
        const col = r + ',' + g + ',' + bl;

        const cy = BOSS_CY;
        const flash = b.shieldFlash;

        /* voile intérieur (dégradé elliptique) */

        ctx.save();

        ctx.translate(0, cy);
        ctx.scale(1, SHIELD_RY / SHIELD_RX);

        const sg = ctx.createRadialGradient(0, 0, SHIELD_RX * 0.35, 0, 0, SHIELD_RX);

        sg.addColorStop(0, 'rgba(' + col + ',0.03)');
        sg.addColorStop(0.75, 'rgba(' + col + ',' + (0.10 + flash * 1.2) + ')');
        sg.addColorStop(1, 'rgba(' + col + ',' + (0.30 + flash * 2) + ')');

        ctx.fillStyle = sg;

        ctx.beginPath();
        ctx.arc(0, 0, SHIELD_RX, 0, Math.PI * 2);
        ctx.fill();

        ctx.restore();

        /* alvéoles hexagonales + impacts, découpés dans l'ellipse */

        ctx.save();

        ctx.beginPath();
        ctx.ellipse(0, cy, SHIELD_RX, SHIELD_RY, 0, 0, Math.PI * 2);
        ctx.clip();

        const s = 24;
        const hw = Math.sqrt(3) * s;

        ctx.beginPath();

        for (let row = 0; row < (2 * SHIELD_RY) / (1.5 * s) + 2; row++) {

            for (let colIdx = 0; colIdx < (2 * SHIELD_RX) / hw + 2; colIdx++) {

                const hx = -SHIELD_RX + colIdx * hw + (row % 2) * hw / 2;
                const hy = cy - SHIELD_RY + row * 1.5 * s;

                for (let k = 0; k < 6; k++) {

                    const ang = Math.PI / 6 + k * Math.PI / 3;
                    const px = hx + Math.cos(ang) * s;
                    const py = hy + Math.sin(ang) * s;

                    if (k === 0) ctx.moveTo(px, py);
                    else ctx.lineTo(px, py);
                }

                ctx.closePath();
            }
        }

        ctx.strokeStyle =
            'rgba(' + col + ',' +
            (0.16 + flash * 2 + Math.sin(now * 0.004) * 0.04) + ')';

        ctx.lineWidth = 1;
        ctx.stroke();

        for (const rp of b.ripples) {

            const k = 1 - rp.life / rp.max;
            const rad = 14 + k * 70;

            const lx = rp.x - b.x;
            const ly = rp.y - b.y;

            const rg = ctx.createRadialGradient(lx, ly, rad * 0.4, lx, ly, rad);

            rg.addColorStop(0, 'rgba(255,255,255,' + (0.55 * (1 - k)) + ')');
            rg.addColorStop(0.6, 'rgba(' + col + ',' + (0.35 * (1 - k)) + ')');
            rg.addColorStop(1, 'rgba(' + col + ',0)');

            ctx.fillStyle = rg;

            ctx.beginPath();
            ctx.arc(lx, ly, rad, 0, Math.PI * 2);
            ctx.fill();
        }

        ctx.restore();

        /* fissures quand il est presque à bout */

        if (frac < 0.4) {

            const cracks = [
                [-172, -40, -140, -15, -152, 12, -122, 38],
                [128, -78, 108, -48, 128, -26, 100, 2],
                [-34, 122, -16, 96, -38, 74, -12, 52],
                [60, -100, 74, -72, 52, -56, 68, -34]
            ];

            const shown = Math.ceil(((0.4 - frac) / 0.4) * cracks.length);

            ctx.save();

            ctx.strokeStyle = 'rgba(255,240,200,' + (0.5 + (0.4 - frac)) + ')';
            ctx.lineWidth = 1.5;
            ctx.shadowBlur = 8;
            ctx.shadowColor = '#ffd27a';

            for (let i = 0; i < shown; i++) {

                const c = cracks[i];

                ctx.beginPath();
                ctx.moveTo(c[0], c[1]);

                for (let j = 2; j < c.length; j += 2) ctx.lineTo(c[j], c[j + 1]);

                ctx.stroke();
            }

            ctx.restore();
        }

        /* bord lumineux */

        ctx.save();

        ctx.shadowBlur = 18 + flash * 120;
        ctx.shadowColor = 'rgb(' + col + ')';
        ctx.strokeStyle = 'rgba(' + col + ',' + (0.75 + flash * 2) + ')';
        ctx.lineWidth = 3;

        ctx.beginPath();
        ctx.ellipse(0, cy, SHIELD_RX, SHIELD_RY, 0, 0, Math.PI * 2);
        ctx.stroke();

        ctx.shadowBlur = 0;
        ctx.lineWidth = 1;
        ctx.strokeStyle = 'rgba(255,255,255,' + (0.25 + flash * 2) + ')';

        ctx.beginPath();
        ctx.ellipse(0, cy, SHIELD_RX - 6, SHIELD_RY - 6, 0, 0, Math.PI * 2);
        ctx.stroke();

        ctx.restore();
    }

    function drawBoss() {

        if (boss.kind === 4) drawBossOmega();
        else if (boss.kind === 3) drawBossHelios();
        else if (boss.kind === 2) drawBossCitadel();
        else if (boss.kind === 1) drawBossNemesis();
        else drawBossDreadnought();
    }

    function drawBossDreadnought() {

        const b = boss;
        const now = performance.now();
        const t = now * 0.004;

        ctx.save();

        ctx.translate(b.x, b.y);

        if (b.dying) {
            ctx.translate((Math.random() - 0.5) * 6, (Math.random() - 0.5) * 6);
        }

        /* --- Réacteurs (dans le dos du vaisseau, flammes vers le haut) --- */

        const flame = 26 + Math.sin(t * 6) * 7;

        ctx.save();

        ctx.shadowBlur = 20;
        ctx.shadowColor = '#ff6a2a';

        for (const ex of [-95, -38, 38, 95]) {

            const fg = ctx.createLinearGradient(0, -48, 0, -48 - flame);

            fg.addColorStop(0, '#fff1a8');
            fg.addColorStop(0.4, '#ff9a2e');
            fg.addColorStop(1, 'rgba(255,60,20,0)');

            ctx.fillStyle = fg;

            ctx.beginPath();
            ctx.moveTo(ex - 13, -48);
            ctx.lineTo(ex, -48 - flame);
            ctx.lineTo(ex + 13, -48);
            ctx.closePath();
            ctx.fill();
        }

        ctx.restore();

        /* --- Coque principale --- */

        const hullPath = () => {

            ctx.beginPath();

            ctx.moveTo(0, 88);
            ctx.lineTo(-34, 46);
            ctx.lineTo(-78, 36);
            ctx.lineTo(-150, 14);
            ctx.lineTo(-172, -22);
            ctx.lineTo(-128, -46);
            ctx.lineTo(-56, -40);
            ctx.lineTo(0, -52);
            ctx.lineTo(56, -40);
            ctx.lineTo(128, -46);
            ctx.lineTo(172, -22);
            ctx.lineTo(150, 14);
            ctx.lineTo(78, 36);
            ctx.lineTo(34, 46);

            ctx.closePath();
        };

        const hg = ctx.createLinearGradient(-172, 0, 172, 0);

        hg.addColorStop(0, '#1a1016');
        hg.addColorStop(0.22, '#5a2632');
        hg.addColorStop(0.5, '#8d3a44');
        hg.addColorStop(0.78, '#5a2632');
        hg.addColorStop(1, '#1a1016');

        hullPath();

        ctx.fillStyle = hg;
        ctx.fill();

        ctx.strokeStyle = '#ff7a4a';
        ctx.lineWidth = 3;
        ctx.stroke();

        /* panneaux */

        ctx.strokeStyle = 'rgba(255,150,110,.45)';
        ctx.lineWidth = 1.5;

        ctx.beginPath();

        for (const sgn of [-1, 1]) {
            ctx.moveTo(sgn * 60, -36);
            ctx.lineTo(sgn * 120, -6);
            ctx.lineTo(sgn * 150, 12);
            ctx.moveTo(sgn * 62, 8);
            ctx.lineTo(sgn * 128, 2);
            ctx.moveTo(sgn * 50, 34);
            ctx.lineTo(sgn * 98, 26);
        }

        ctx.stroke();

        /* fuselage central blindé */

        const cg = ctx.createLinearGradient(-50, 0, 50, 0);

        cg.addColorStop(0, '#20262e');
        cg.addColorStop(0.35, '#a9b6c2');
        cg.addColorStop(0.55, '#5d6b78');
        cg.addColorStop(1, '#1b2028');

        ctx.beginPath();
        ctx.moveTo(0, 80);
        ctx.lineTo(-40, 30);
        ctx.lineTo(-46, -30);
        ctx.lineTo(0, -46);
        ctx.lineTo(46, -30);
        ctx.lineTo(40, 30);
        ctx.closePath();

        ctx.fillStyle = cg;
        ctx.fill();

        ctx.strokeStyle = '#ffb08a';
        ctx.lineWidth = 2;
        ctx.stroke();

        /* --- Noyau : cyan tant que le bouclier tient, rouge ensuite --- */

        const shieldUp = b.shield > 0;
        const pulse = 0.7 + Math.sin(now * 0.008) * 0.3;
        const coreColor = shieldUp ? '90,230,255' : '255,80,60';

        ctx.save();

        ctx.shadowBlur = 26 * pulse;
        ctx.shadowColor = 'rgb(' + coreColor + ')';

        const rg = ctx.createRadialGradient(0, 10, 2, 0, 10, 19);

        rg.addColorStop(0, '#ffffff');
        rg.addColorStop(0.4, 'rgba(' + coreColor + ',1)');
        rg.addColorStop(1, 'rgba(' + coreColor + ',0.15)');

        ctx.fillStyle = rg;

        ctx.beginPath();
        ctx.arc(0, 10, 19, 0, Math.PI * 2);
        ctx.fill();

        /* générateurs de bouclier sur les ailes */

        ctx.fillStyle = shieldUp ? 'rgba(90,230,255,.95)' : 'rgba(60,20,20,.9)';

        ctx.beginPath();
        ctx.arc(-112, -4, 9, 0, Math.PI * 2);
        ctx.arc(112, -4, 9, 0, Math.PI * 2);
        ctx.fill();

        ctx.restore();

        /* --- Canons --- */

        ctx.fillStyle = '#b9c4cd';
        ctx.strokeStyle = '#2a323a';
        ctx.lineWidth = 1.5;

        for (const cx of [-118, 118]) {
            ctx.fillRect(cx - 8, 24, 16, 32);
            ctx.strokeRect(cx - 8, 24, 16, 32);
        }

        ctx.fillRect(-7, 62, 14, 22);
        ctx.strokeRect(-7, 62, 14, 22);

        /* lueur aux bouches quand il tire */

        if (b.attack) {

            ctx.save();

            ctx.shadowBlur = 16;
            ctx.shadowColor = '#ff9a3c';
            ctx.fillStyle = '#ffd08a';

            ctx.beginPath();
            ctx.arc(-118, 57, 5, 0, Math.PI * 2);
            ctx.arc(118, 57, 5, 0, Math.PI * 2);
            ctx.arc(0, 84, 5, 0, Math.PI * 2);
            ctx.fill();

            ctx.restore();
        }

        /* feux de position */

        ctx.save();

        ctx.shadowBlur = 12;
        ctx.shadowColor = '#ff3030';
        ctx.fillStyle = Math.sin(now * 0.01) > 0 ? '#ff6b72' : '#601018';

        ctx.beginPath();
        ctx.arc(-150, 0, 3, 0, Math.PI * 2);
        ctx.arc(150, 0, 3, 0, Math.PI * 2);
        ctx.fill();

        ctx.restore();

        /* --- Dégâts visibles sur la coque --- */

        const hf = b.hull / b.maxHull;

        if (!shieldUp && hf < 0.75) {

            ctx.save();

            ctx.strokeStyle = 'rgba(0,0,0,.65)';
            ctx.lineWidth = 2;

            ctx.beginPath();
            ctx.moveTo(-96, -30); ctx.lineTo(-84, -10); ctx.lineTo(-100, 6); ctx.lineTo(-88, 24);
            if (hf < 0.5) {
                ctx.moveTo(90, -34); ctx.lineTo(102, -12); ctx.lineTo(84, 4); ctx.lineTo(96, 26);
                ctx.moveTo(-20, -30); ctx.lineTo(-8, -10); ctx.lineTo(-22, 10);
            }
            ctx.stroke();

            if (hf < 0.5) {

                ctx.shadowBlur = 10;
                ctx.shadowColor = '#ff6a2a';
                ctx.strokeStyle = 'rgba(255,140,60,.8)';
                ctx.lineWidth = 1.2;

                ctx.beginPath();
                ctx.moveTo(90, -34); ctx.lineTo(102, -12); ctx.lineTo(84, 4); ctx.lineTo(96, 26);
                ctx.stroke();
            }

            ctx.restore();
        }

        /* flash blanc quand la coque encaisse */

        if (b.hitFlash > 0) {

            hullPath();

            ctx.fillStyle = 'rgba(255,255,255,' + Math.min(0.6, b.hitFlash * 6) + ')';
            ctx.fill();
        }

        /* --- Bouclier --- */

        if (b.shield > 0) drawBossShield(b, now);

        ctx.restore();
    }

    /* ------------------------------------------------------------
       INTERFACE : progression du niveau, barres du boss, bannières
    ------------------------------------------------------------ */

    function drawBossUI() {

        if (!gameStarted) return;

        const now = performance.now();

        ctx.save();

        ctx.textAlign = 'center';

        if (bossState === 0 || bossState === 1) {

            const w = 300;
            const x = canvas.width / 2 - w / 2;
            const y = 10;

            const p = bossState === 0
                ? Math.min(1, levelTimer / CONFIG.levelDuration)
                : 1;

            ctx.fillStyle = 'rgba(5,15,25,.7)';
            ctx.fillRect(x - 2, y - 2, w + 4, 12);

            ctx.fillStyle = bossState === 1 ? '#ff5365' : '#3bc9ff';
            ctx.fillRect(x, y, w * p, 8);

            ctx.strokeStyle = 'rgba(69,223,255,.6)';
            ctx.lineWidth = 1;
            ctx.strokeRect(x - 2, y - 2, w + 4, 12);

            ctx.font = 'bold 11px Arial';
            ctx.fillStyle = '#9ec5d8';
            ctx.fillText('NIVEAU ' + level + '  ·  BOSS', canvas.width / 2, y + 24);
        }

        /* alerte : pulsation rouge */

        if (bossState === 1) {
            ctx.fillStyle = 'rgba(255,30,30,' + (0.06 + 0.06 * Math.sin(now * 0.012)) + ')';
            ctx.fillRect(0, 0, canvas.width, canvas.height);
        }

        /* barres du boss */

        if (boss) {

            const w = 520;
            const x = canvas.width / 2 - w / 2;

            ctx.textAlign = 'right';
            ctx.font = 'bold 10px Arial';
            ctx.fillStyle = '#7de8ff';
            ctx.fillText('BOUCLIER', x - 8, 16);
            ctx.fillStyle = '#ff9a3c';
            ctx.fillText('COQUE', x - 8, 27);

            ctx.fillStyle = 'rgba(5,15,25,.75)';
            ctx.fillRect(x - 2, 8, w + 4, 10);
            ctx.fillRect(x - 2, 19, w + 4, 10);

            ctx.fillStyle = boss.def.bar;
            ctx.fillRect(x, 10, w * Math.max(0, boss.shield / boss.maxShield), 6);

            ctx.fillStyle = boss.phase === 3 ? '#ff4b3a' : '#ff9a3c';
            ctx.fillRect(x, 21, w * Math.max(0, boss.hull / boss.maxHull), 6);

            /* repère des 50 % de coque (surchauffe) */

            ctx.fillStyle = 'rgba(255,255,255,.7)';
            ctx.fillRect(x + w / 2 - 1, 19, 2, 10);

            ctx.strokeStyle = 'rgba(69,223,255,.5)';
            ctx.lineWidth = 1;
            ctx.strokeRect(x - 2, 8, w + 4, 10);
            ctx.strokeRect(x - 2, 19, w + 4, 10);
        }

        ctx.restore();
    }

    function drawBanner() {

        if (!banner) return;

        const k = banner.t / banner.dur;

        const alpha = k < 0.12 ? k / 0.12 : k > 0.8 ? (1 - k) / 0.2 : 1;

        ctx.save();

        ctx.globalAlpha = Math.max(0, Math.min(1, alpha));
        ctx.textAlign = 'center';

        ctx.shadowBlur = 24;
        ctx.shadowColor = banner.color;
        ctx.fillStyle = banner.color;
        ctx.font = 'bold 44px Arial';

        ctx.fillText(banner.text, canvas.width / 2, canvas.height / 2 - 40);

        if (banner.sub) {
            ctx.shadowBlur = 0;
            ctx.font = '18px Arial';
            ctx.fillStyle = '#d7f5ff';
            ctx.fillText(banner.sub, canvas.width / 2, canvas.height / 2 - 6);
        }

        ctx.restore();
    }




        /* ============================================================
       v2.3 — CHOIX DU VAISSEAU, TRAÎNÉES, COMÈTE, BOSS 2 (NÉMÉSIS)
    ============================================================ */

    const SHIPS = [
        {
            name: 'CLASSIQUE',
            line1: 'Équilibré',
            line2: 'Le vaisseau d’origine',
            speed: 1,
            fire: 1
        },
        {
            name: 'SONIC STAR',
            line1: 'Vitesse +15 %',
            line2: 'Cadence de tir -9 %',
            speed: 1.15,
            fire: 1.10
        },
        {
            name: 'GOLD RING',
            line1: 'Cadence de tir +18 %',
            line2: 'Vitesse -6 % • traînée d’énergie',
            speed: 0.94,
            fire: 0.85
        }
    ];

    const BOSS_DEFS = [
        {
            name: 'DREADNOUGHT',
            sub: 'Brisez son bouclier, puis détruisez la coque',
            color: '#ff9a3c',
            hp: 1,
            regen: 0.03,
            speeds: [0, 60, 85, 115],
            shield: [90, 230, 255],
            spark: '90,230,255',
            bar: '#3bd8ff',
            patterns: {
                1: ['cannons', 'fan', 'tracking'],
                2: ['cannons', 'fan', 'tracking', 'wall'],
                3: ['fan', 'tracking', 'wall', 'nova', 'cannons']
            }
        },
        {
            name: 'NÉMÉSIS',
            sub: 'Spirales, pluies de tirs… et un bouclier qui se régénère',
            color: '#c77dff',
            hp: 1.15,
            regen: 0.045,
            speeds: [0, 70, 100, 135],
            shield: [190, 110, 255],
            spark: '200,130,255',
            bar: '#b06bff',
            patterns: {
                1: ['fan', 'spiral', 'cannons'],
                2: ['spiral', 'rain', 'tracking', 'wall', 'fan'],
                3: ['spiral', 'rain', 'nova', 'wall', 'tracking']
            }
        }
    ];

    let lastBossName = 'Le boss';

    function chooseShip(i) {
        selectedShip = i;
        try { localStorage.setItem('sonicStrikerShip', String(i)); } catch (e) { /* ignoré */ }
    }

    function startGame() {

        rebinding = null;

        if (victory) nextLevel();
        else if (hull <= 0) restartGame();

        gameStarted = true;
        paused = false;
        lastTime = performance.now();
    }

    /* ------------------------------------------------------------
       ÉCRAN D'ACCUEIL AVEC CHOIX DU VAISSEAU
    ------------------------------------------------------------ */

    function startLayout() {

        const cw = 230, ch = 176, gap = 22;
        const x0 = (canvas.width - (3 * cw + 2 * gap)) / 2;
        const y0 = 98;

        const kw = 150, kh = 32, kgap = 16;
        const kx0 = (canvas.width - (ACTIONS.length * kw + (ACTIONS.length - 1) * kgap)) / 2;
        const ky = y0 + ch + 30;

        const bw = 240, bh = 50;

        return {
            cw, ch, gap, x0, y0,
            kw, kh, kgap, kx0, ky,
            bw, bh,
            bx: (canvas.width - bw) / 2,
            by: ky + kh + 14
        };
    }

    /* 0-2 : vaisseaux • 10 : JOUER • 20-23 : cases des commandes */

    function startScreenHit(x, y) {

        const L = startLayout();

        for (let i = 0; i < 3; i++) {
            const cx = L.x0 + i * (L.cw + L.gap);
            if (x >= cx && x <= cx + L.cw && y >= L.y0 && y <= L.y0 + L.ch) return i;
        }

        for (let j = 0; j < ACTIONS.length; j++) {
            const kx = L.kx0 + j * (L.kw + L.kgap);
            if (x >= kx && x <= kx + L.kw && y >= L.ky && y <= L.ky + L.kh) return 20 + j;
        }

        if (x >= L.bx && x <= L.bx + L.bw && y >= L.by && y <= L.by + L.bh) return 10;

        return -1;
    }

    canvas.addEventListener('mousemove', event => {

        if (gameStarted) return;

        const r = canvas.getBoundingClientRect();

        hoverShip = startScreenHit(
            (event.clientX - r.left) * (canvas.width / r.width),
            (event.clientY - r.top) * (canvas.height / r.height)
        );
    });

    function drawStartScreen() {

        const W = canvas.width;
        const L = startLayout();

        ctx.fillStyle = 'rgba(3,11,21,.92)';
        ctx.fillRect(0, 0, W, canvas.height);

        ctx.textAlign = 'center';

        ctx.font = 'bold 42px Arial';
        ctx.fillStyle = '#b9e8ff';
        ctx.shadowBlur = 20;
        ctx.shadowColor = '#4bc9ff';
        ctx.fillText('SoNiC STRIKER', W / 2, 54);

        ctx.shadowBlur = 0;
        ctx.font = '15px Arial';
        ctx.fillStyle = '#8faabd';
        ctx.fillText('Choisis ton vaisseau', W / 2, 80);

        if (ultra) {

            ctx.save();

            ctx.textAlign = 'left';
            ctx.font = 'bold 15px Arial';
            ctx.shadowBlur = 14;
            ctx.shadowColor = '#ffd21a';
            ctx.fillStyle = '#ffe36b';
            ctx.fillText('⚡ MODE ULTRA', W / 2 + 190, 50);

            ctx.restore();
        }

        const savedShield = shieldTimer;
        shieldTimer = 0;

        for (let i = 0; i < 3; i++) {

            const cx = L.x0 + i * (L.cw + L.gap);
            const sel = i === selectedShip;
            const hov = i === hoverShip;

            ctx.save();

            if (sel) {
                ctx.shadowBlur = 16;
                ctx.shadowColor = '#45dfff';
            }

            ctx.fillStyle = sel ? '#123d61' : hov ? '#0f3352' : 'rgba(10,30,50,.85)';
            ctx.strokeStyle = sel ? '#45dfff' : hov ? '#3a86ad' : '#2a5a80';
            ctx.lineWidth = sel ? 3 : 1.5;

            ctx.fillRect(cx, L.y0, L.cw, L.ch);
            ctx.strokeRect(cx, L.y0, L.cw, L.ch);

            ctx.restore();

            const px = cx + L.cw / 2;
            const py = L.y0 + 60;

            if (i === 0) {
                ctx.save();
                ctx.translate(px, py);
                ctx.scale(1.1, 1.1);
                drawClassicShip(0, 0);
                ctx.restore();
            } else if (i === 1) {
                drawSonicStar(px, py, 1.05);
            } else {
                drawGoldRing(px, py, 1.05);
            }

            ctx.textAlign = 'center';

            ctx.font = 'bold 17px Arial';
            ctx.fillStyle = sel ? '#ffffff' : '#b9e8ff';
            ctx.fillText(SHIPS[i].name, px, L.y0 + 138);

            ctx.font = '12px Arial';
            ctx.fillStyle = '#9ec5d8';
            ctx.fillText(SHIPS[i].line1, px, L.y0 + 154);

            ctx.fillStyle = '#7a95a8';
            ctx.fillText(SHIPS[i].line2, px, L.y0 + 168);
        }

        shieldTimer = savedShield;

        /* commandes réaffectables */

        ctx.textAlign = 'center';
        ctx.font = '12px Arial';
        ctx.fillStyle = '#6f8ea3';
        ctx.fillText(
            'COMMANDES — clique sur une case, puis appuie sur la nouvelle touche (Échap : annuler)',
            W / 2,
            L.ky - 9
        );

        for (let j = 0; j < ACTIONS.length; j++) {

            const [action, label, arrow] = ACTIONS[j];
            const kx = L.kx0 + j * (L.kw + L.kgap);
            const waiting = rebinding === action;
            const hov = hoverShip === 20 + j;

            ctx.fillStyle = waiting ? '#4a3a08' : hov ? '#0f3352' : 'rgba(10,30,50,.85)';
            ctx.strokeStyle = waiting ? '#ffd21a' : hov ? '#3a86ad' : '#2a5a80';
            ctx.lineWidth = waiting ? 2.5 : 1.5;

            ctx.fillRect(kx, L.ky, L.kw, L.kh);
            ctx.strokeRect(kx, L.ky, L.kw, L.kh);

            if (waiting) {

                ctx.textAlign = 'center';
                ctx.font = 'bold 12px Arial';
                ctx.fillStyle = '#ffe36b';
                ctx.fillText('Appuie sur une touche…', kx + L.kw / 2, L.ky + 21);

            } else {

                ctx.textAlign = 'left';
                ctx.font = '13px Arial';
                ctx.fillStyle = '#b9e8ff';
                ctx.fillText(arrow + ' ' + label, kx + 10, L.ky + 21);

                ctx.fillStyle = '#0b2a44';
                ctx.strokeStyle = '#45dfff';
                ctx.lineWidth = 1;
                ctx.fillRect(kx + L.kw - 62, L.ky + 5, 52, 22);
                ctx.strokeRect(kx + L.kw - 62, L.ky + 5, 52, 22);

                ctx.textAlign = 'center';
                ctx.font = 'bold 13px Arial';
                ctx.fillStyle = '#ffffff';
                if (keyLabel(keyBinds[action]).length > 2) ctx.font = 'bold 10px Arial';
                ctx.fillText(keyLabel(keyBinds[action]), kx + L.kw - 36, L.ky + 21);
            }
        }

        /* bouton JOUER */

        ctx.textAlign = 'center';

        ctx.fillStyle = hoverShip === 10 ? '#1a5585' : '#123d61';
        ctx.strokeStyle = '#45dfff';
        ctx.lineWidth = 2;

        ctx.fillRect(L.bx, L.by, L.bw, L.bh);
        ctx.strokeRect(L.bx, L.by, L.bw, L.bh);

        ctx.font = 'bold 24px Arial';
        ctx.fillStyle = '#ffffff';
        ctx.fillText('▶ JOUER', W / 2, L.by + 33);

        ctx.font = '12px Arial';
        ctx.fillStyle = '#6f8ea3';
        ctx.fillText(
            'Entrée : jouer  •  P : pause en jeu',
            W / 2,
            L.by + L.bh + 22
        );
    }

    /* ------------------------------------------------------------
       TRAÎNÉES DE PARTICULES
       « ring » : cyan / or / blanc (vaisseau Gold Ring)
       « smoke » : fumée orangée qui vire au gris (Comète ennemie)
    ------------------------------------------------------------ */

    function emitTrail(x, y, kind) {

        if (trails.length > 500) return;

        if (kind === 'ring') {

            const life = 0.35 + Math.random() * 0.15;

            trails.push({
                x: x + (Math.random() * 8 - 4),
                y,
                vx: (Math.random() - 0.5) * 30,
                vy: 130 + Math.random() * 90,
                size: 2.5 + Math.random() * 3.5,
                life,
                max: life,
                color: ['0,229,255', '255,234,0', '255,255,255'][Math.floor(Math.random() * 3)]
            });

        } else {

            const life = 0.9 + Math.random() * 0.5;

            trails.push({
                x: x + (Math.random() * 14 - 7),
                y,
                vx: (Math.random() - 0.5) * 40,
                vy: -20 - Math.random() * 40,
                size: 3.5 + Math.random() * 4,
                grow: 10 + Math.random() * 8,
                life,
                max: life,
                smoke: true
            });
        }
    }

    function updateTrails(dt) {

        if (selectedShip === 2 || ultra) {
            emitTrail(player.x - 7, player.y + 26, 'ring');
            emitTrail(player.x + 7, player.y + 26, 'ring');
        }

        for (let i = trails.length - 1; i >= 0; i--) {

            const t = trails[i];

            t.x += t.vx * dt;
            t.y += t.vy * dt;
            t.life -= dt;

            if (t.life <= 0) trails.splice(i, 1);
        }
    }

    function drawTrails() {

        ctx.save();

        for (const t of trails) {

            const k = Math.max(0, t.life / t.max);

            if (t.smoke) {

                ctx.globalCompositeOperation = 'source-over';

                const r = Math.round(70 + 185 * k);
                const g = Math.round(60 + 90 * k);
                const b = Math.round(70 - 30 * k);

                ctx.fillStyle = 'rgba(' + r + ',' + g + ',' + b + ',' + (0.55 * k) + ')';

                ctx.beginPath();
                ctx.arc(t.x, t.y, t.size + (1 - k) * t.grow, 0, Math.PI * 2);
                ctx.fill();

            } else {

                ctx.globalCompositeOperation = 'lighter';

                ctx.fillStyle = 'rgba(' + t.color + ',' + k + ')';

                ctx.beginPath();
                ctx.arc(t.x, t.y, t.size * (0.4 + 0.6 * k), 0, Math.PI * 2);
                ctx.fill();
            }
        }

        ctx.restore();
    }

    /* ------------------------------------------------------------
       VAISSEAUX DU JOUEUR
    ------------------------------------------------------------ */

    function drawPlayer() {

        if (ultra) drawUltraAura(player.x, player.y);

        if (selectedShip === 1) drawSonicStar(player.x, player.y, 1);
        else if (selectedShip === 2) drawGoldRing(player.x, player.y, 1);
        else drawClassicShip(player.x, player.y);
    }

    function drawShipShield() {

        ctx.save();

        ctx.strokeStyle = 'rgba(80,230,255,.8)';
        ctx.lineWidth = 3;
        ctx.shadowBlur = 20;
        ctx.shadowColor = '#00eaff';

        ctx.beginPath();
        ctx.arc(0, 0, 62, 0, Math.PI * 2);
        ctx.stroke();

        ctx.restore();
    }

    function shipPoly(pts) {

        ctx.beginPath();
        ctx.moveTo(pts[0], pts[1]);

        for (let i = 2; i < pts.length; i += 2) ctx.lineTo(pts[i], pts[i + 1]);

        ctx.closePath();
    }

    /* SONIC STAR : piquants en éventail, nez rouge à bande blanche,
       petit cockpit vitré (bien plus discret que l'original) */

    function drawSonicStar(x, y, scale) {

        const pulse = 0.8 + Math.sin(performance.now() * 0.02) * 0.2;

        ctx.save();
        ctx.translate(x, y);
        ctx.scale(scale || 1, scale || 1);

        /* flammes */

        ctx.save();

        ctx.shadowBlur = 16;
        ctx.shadowColor = '#3fd0ff';

        const fl = 14 + 34 * pulse;

        for (const ex of [-13, 13]) {

            const g = ctx.createLinearGradient(0, 16, 0, 16 + fl);

            g.addColorStop(0, '#ffffff');
            g.addColorStop(0.3, '#5fe6ff');
            g.addColorStop(0.7, '#1a7dff');
            g.addColorStop(1, 'rgba(0,80,255,0)');

            ctx.fillStyle = g;

            ctx.beginPath();
            ctx.moveTo(ex - 5, 16);
            ctx.lineTo(ex, 16 + fl);
            ctx.lineTo(ex + 5, 16);
            ctx.closePath();
            ctx.fill();
        }

        ctx.restore();

        /* piquants : deux couches */

        shipPoly([-24, 4, -42, 26, -22, 17, -27, 44, -9, 21, 0, 49, 9, 21, 27, 44, 22, 17, 42, 26, 24, 4]);
        ctx.fillStyle = '#0a3a8c';
        ctx.strokeStyle = '#08275f';
        ctx.lineWidth = 1;
        ctx.fill();
        ctx.stroke();

        shipPoly([-18, 6, -32, 22, -16, 15, -18, 37, -5, 18, 0, 40, 5, 18, 18, 37, 16, 15, 32, 22, 18, 6]);
        ctx.fillStyle = '#1c72e6';
        ctx.fill();

        /* ailes blanches, liseré rouge */

        for (const sgn of [-1, 1]) {

            ctx.save();
            ctx.scale(sgn, 1);

            const wg = ctx.createLinearGradient(14, 0, 42, 0);
            wg.addColorStop(0, '#ffffff');
            wg.addColorStop(1, '#bcd9ff');

            shipPoly([14, -6, 40, 8, 42, 20, 30, 19, 14, 14]);
            ctx.fillStyle = wg;
            ctx.strokeStyle = '#7fb8ff';
            ctx.lineWidth = 1;
            ctx.fill();
            ctx.stroke();

            shipPoly([16, 10, 38, 15, 38, 19, 16, 14]);
            ctx.fillStyle = '#e8212b';
            ctx.fill();

            ctx.restore();
        }

        /* fuselage bleu */

        const bg = ctx.createLinearGradient(-17, 0, 17, 0);
        bg.addColorStop(0, '#0a4bb8');
        bg.addColorStop(0.5, '#39a7ff');
        bg.addColorStop(1, '#0a4bb8');

        shipPoly([0, -46, 9, -30, 15, -8, 17, 12, 9, 21, -9, 21, -17, 12, -15, -8, -9, -30]);
        ctx.fillStyle = bg;
        ctx.strokeStyle = '#9fdcff';
        ctx.lineWidth = 1.5;
        ctx.fill();
        ctx.stroke();

        /* nez façon « sneaker » : rouge, bande blanche, boucle dorée */

        shipPoly([0, -46, 9, -30, -9, -30]);
        ctx.fillStyle = '#e8212b';
        ctx.fill();

        shipPoly([-9.6, -30, 9.6, -30, 10.8, -25, -10.8, -25]);
        ctx.fillStyle = '#ffffff';
        ctx.fill();

        ctx.fillStyle = '#ffd21a';
        ctx.fillRect(-3, -29.5, 6, 3.5);

        /* cockpit : petite verrière ovale */

        const cg = ctx.createLinearGradient(0, -20, 0, -2);
        cg.addColorStop(0, '#d8fbff');
        cg.addColorStop(0.45, '#2a86c9');
        cg.addColorStop(1, '#0b2f66');

        ctx.beginPath();
        ctx.ellipse(0, -11, 5.5, 9, 0, 0, Math.PI * 2);
        ctx.fillStyle = cg;
        ctx.fill();
        ctx.strokeStyle = '#eaffff';
        ctx.lineWidth = 1;
        ctx.stroke();

        ctx.beginPath();
        ctx.ellipse(-1.8, -15, 1.6, 3.2, 0, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(255,255,255,.85)';
        ctx.fill();

        /* anneau d'or sur le ventre */

        ctx.save();
        ctx.shadowBlur = 8;
        ctx.shadowColor = '#ffd21a';
        ctx.strokeStyle = '#ffd21a';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(0, 8, 4, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();

        if (shieldTimer > 0) drawShipShield();

        ctx.restore();
    }

    /* GOLD RING : delta blanc, verrière en anneau d'or, ailes à fourche
       bleues, bande rouge — et traînée de particules (voir updateTrails) */

    function drawGoldRing(x, y, scale) {

        const pulse = 0.8 + Math.sin(performance.now() * 0.02) * 0.2;

        ctx.save();
        ctx.translate(x, y);
        ctx.scale(scale || 1, scale || 1);

        /* flammes */

        ctx.save();

        ctx.shadowBlur = 18;
        ctx.shadowColor = '#00e5ff';

        const fl = 18 + 32 * pulse;

        const g = ctx.createLinearGradient(0, 20, 0, 20 + fl * 1.15);
        g.addColorStop(0, '#ffffff');
        g.addColorStop(0.25, '#fff27a');
        g.addColorStop(0.65, '#00e5ff');
        g.addColorStop(1, 'rgba(0,120,255,0)');

        ctx.fillStyle = g;

        ctx.beginPath();
        ctx.moveTo(-7, 20);
        ctx.lineTo(0, 20 + fl * 1.15);
        ctx.lineTo(7, 20);
        ctx.closePath();
        ctx.fill();

        for (const ex of [-16, 16]) {
            ctx.beginPath();
            ctx.moveTo(ex - 3, 14);
            ctx.lineTo(ex, 14 + fl * 0.7);
            ctx.lineTo(ex + 3, 14);
            ctx.closePath();
            ctx.fill();
        }

        ctx.restore();

        /* ailes à fourche + ailes delta */

        for (const sgn of [-1, 1]) {

            ctx.save();
            ctx.scale(sgn, 1);

            shipPoly([8, -6, 34, 14, 20, 12, 36, 32, 17, 24, 26, 46, 9, 28]);
            ctx.fillStyle = '#0a6fe0';
            ctx.strokeStyle = '#0a3f99';
            ctx.lineWidth = 1;
            ctx.fill();
            ctx.stroke();

            const wg = ctx.createLinearGradient(9, 0, 34, 0);
            wg.addColorStop(0, '#ffffff');
            wg.addColorStop(1, '#bfeaff');

            shipPoly([9, -24, 34, 8, 30, 16, 9, 10]);
            ctx.fillStyle = wg;
            ctx.strokeStyle = '#7de8ff';
            ctx.fill();
            ctx.stroke();

            ctx.save();
            ctx.shadowBlur = 8;
            ctx.shadowColor = '#00e5ff';
            ctx.fillStyle = '#7df3ff';
            ctx.beginPath();
            ctx.arc(32.5, 10.5, 2, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();

            ctx.restore();
        }

        /* fuselage blanc + bande rouge */

        const fg = ctx.createLinearGradient(-9, 0, 9, 0);
        fg.addColorStop(0, '#dff4ff');
        fg.addColorStop(0.5, '#ffffff');
        fg.addColorStop(1, '#dff4ff');

        shipPoly([0, -46, 8, -24, 9, -2, 9, 22, -9, 22, -9, -2, -8, -24]);
        ctx.fillStyle = fg;
        ctx.strokeStyle = '#9fe4ff';
        ctx.lineWidth = 1.5;
        ctx.fill();
        ctx.stroke();

        ctx.fillStyle = '#ff1744';
        ctx.fillRect(-2.2, -26, 4.4, 40);

        shipPoly([0, -46, 5, -35, -5, -35]);
        ctx.fill();

        ctx.fillStyle = '#334155';
        ctx.fillRect(-6, 20, 12, 4);

        /* cockpit : anneau d'or */

        ctx.save();

        ctx.shadowBlur = 10;
        ctx.shadowColor = '#ffd21a';
        ctx.strokeStyle = '#ffd21a';
        ctx.lineWidth = 3.5;

        ctx.beginPath();
        ctx.arc(0, -10, 7.5, 0, Math.PI * 2);
        ctx.stroke();

        ctx.restore();

        const rg = ctx.createRadialGradient(-1.5, -12, 0.5, 0, -10, 5.4);
        rg.addColorStop(0, '#eaffff');
        rg.addColorStop(0.5, '#1f7fbf');
        rg.addColorStop(1, '#0c2f5c');

        ctx.fillStyle = rg;
        ctx.beginPath();
        ctx.arc(0, -10, 5.4, 0, Math.PI * 2);
        ctx.fill();

        if (shieldTimer > 0) drawShipShield();

        ctx.restore();
    }

    /* ------------------------------------------------------------
       COMÈTE — ennemi qui fonce en laissant une traîne de fumée
    ------------------------------------------------------------ */

    function drawComet(e) {

        const pulse = 0.7 + Math.sin(performance.now() * 0.02 + e.phase) * 0.3;

        ctx.save();
        ctx.translate(e.x, e.y);

        /* ailerons */

        for (const sgn of [-1, 1]) {

            ctx.save();
            ctx.scale(sgn, 1);

            shipPoly([10, 6, 34, -16, 30, -24, 12, -10]);
            ctx.fillStyle = '#3b2a44';
            ctx.strokeStyle = '#ff8a3c';
            ctx.lineWidth = 1.5;
            ctx.fill();
            ctx.stroke();

            ctx.restore();
        }

        /* fuselage (nez vers le bas) */

        const bg = ctx.createLinearGradient(-14, 0, 14, 0);
        bg.addColorStop(0, '#241c2c');
        bg.addColorStop(0.5, '#6b4a6a');
        bg.addColorStop(1, '#241c2c');

        shipPoly([0, 34, 10, 10, 14, -14, 6, -22, -6, -22, -14, -14, -10, 10]);
        ctx.fillStyle = bg;
        ctx.strokeStyle = '#ff8a3c';
        ctx.lineWidth = 1.5;
        ctx.fill();
        ctx.stroke();

        /* noyau + tuyères incandescentes */

        ctx.save();

        ctx.shadowBlur = 14 * pulse;
        ctx.shadowColor = '#ff8a3c';

        const cg = ctx.createRadialGradient(0, 2, 0.5, 0, 2, 6);
        cg.addColorStop(0, '#ffffff');
        cg.addColorStop(1, '#ff8a3c');

        ctx.fillStyle = cg;
        ctx.beginPath();
        ctx.arc(0, 2, 5.5, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = '#ffd9a0';
        ctx.beginPath();
        ctx.arc(-5, -22, 3.5 * pulse, 0, Math.PI * 2);
        ctx.arc(5, -22, 3.5 * pulse, 0, Math.PI * 2);
        ctx.fill();

        ctx.restore();

        ctx.restore();
    }

    /* ------------------------------------------------------------
       BOSS 2 : NÉMÉSIS (raie manta violette)
    ------------------------------------------------------------ */

    function drawBossNemesis() {

        const b = boss;
        const now = performance.now();
        const t = now * 0.004;
        const shieldUp = b.shield > 0;

        ctx.save();
        ctx.translate(b.x, b.y);

        if (b.dying) {
            ctx.translate((Math.random() - 0.5) * 6, (Math.random() - 0.5) * 6);
        }

        /* réacteurs */

        const flame = 24 + Math.sin(t * 7) * 7;

        ctx.save();

        ctx.shadowBlur = 22;
        ctx.shadowColor = '#b06bff';

        for (const ex of [-72, 0, 72]) {

            const fg = ctx.createLinearGradient(0, -46, 0, -46 - flame);

            fg.addColorStop(0, '#ffffff');
            fg.addColorStop(0.4, '#d9a8ff');
            fg.addColorStop(1, 'rgba(150,60,255,0)');

            ctx.fillStyle = fg;

            ctx.beginPath();
            ctx.moveTo(ex - 12, -46);
            ctx.lineTo(ex, -46 - flame);
            ctx.lineTo(ex + 12, -46);
            ctx.closePath();
            ctx.fill();
        }

        ctx.restore();

        /* coque en croissant */

        const hullPath = () => {

            ctx.beginPath();
            ctx.moveTo(0, 86);
            ctx.quadraticCurveTo(40, 60, 100, 40);
            ctx.quadraticCurveTo(156, 22, 168, -30);
            ctx.quadraticCurveTo(120, -6, 84, -30);
            ctx.quadraticCurveTo(44, -56, 0, -54);
            ctx.quadraticCurveTo(-44, -56, -84, -30);
            ctx.quadraticCurveTo(-120, -6, -168, -30);
            ctx.quadraticCurveTo(-156, 22, -100, 40);
            ctx.quadraticCurveTo(-40, 60, 0, 86);
            ctx.closePath();
        };

        const hg = ctx.createLinearGradient(-168, 0, 168, 0);

        hg.addColorStop(0, '#180a30');
        hg.addColorStop(0.25, '#4a1c8a');
        hg.addColorStop(0.5, '#7b39d6');
        hg.addColorStop(0.75, '#4a1c8a');
        hg.addColorStop(1, '#180a30');

        hullPath();

        ctx.fillStyle = hg;
        ctx.fill();

        ctx.save();
        ctx.shadowBlur = 12;
        ctx.shadowColor = '#ff5cf0';
        ctx.strokeStyle = '#ff5cf0';
        ctx.lineWidth = 3;
        ctx.stroke();
        ctx.restore();

        /* nervures des ailes */

        ctx.strokeStyle = 'rgba(255,120,240,.45)';
        ctx.lineWidth = 1.5;

        ctx.beginPath();

        for (const sgn of [-1, 1]) {
            ctx.moveTo(sgn * 50, -34);
            ctx.quadraticCurveTo(sgn * 110, 0, sgn * 160, -22);
            ctx.moveTo(sgn * 56, 6);
            ctx.quadraticCurveTo(sgn * 100, 14, sgn * 136, 8);
            ctx.moveTo(sgn * 46, 32);
            ctx.quadraticCurveTo(sgn * 80, 34, sgn * 106, 34);
        }

        ctx.stroke();

        /* plastron blindé */

        const pg = ctx.createLinearGradient(-38, 0, 38, 0);

        pg.addColorStop(0, '#1a1230');
        pg.addColorStop(0.4, '#8a7ab0');
        pg.addColorStop(0.6, '#4a3f6b');
        pg.addColorStop(1, '#241a3c');

        shipPoly([0, 82, -34, 28, -38, -30, 0, -46, 38, -30, 34, 28]);
        ctx.fillStyle = pg;
        ctx.fill();
        ctx.strokeStyle = '#e6b3ff';
        ctx.lineWidth = 2;
        ctx.stroke();

        /* œil : violet tant que le bouclier tient, rouge ensuite */

        const pulse = 0.7 + Math.sin(now * 0.008) * 0.3;
        const eye = shieldUp ? '190,110,255' : '255,60,90';

        ctx.save();

        ctx.shadowBlur = 26 * pulse;
        ctx.shadowColor = 'rgb(' + eye + ')';

        const er = ctx.createRadialGradient(0, 8, 2, 0, 8, 22);

        er.addColorStop(0, '#ffffff');
        er.addColorStop(0.4, 'rgba(' + eye + ',1)');
        er.addColorStop(1, 'rgba(' + eye + ',0.15)');

        ctx.fillStyle = er;
        ctx.beginPath();
        ctx.arc(0, 8, 22, 0, Math.PI * 2);
        ctx.fill();

        ctx.restore();

        ctx.fillStyle = '#1a0620';
        ctx.beginPath();
        ctx.ellipse(0, 8, 3.5, 13, 0, 0, Math.PI * 2);
        ctx.fill();

        /* orbes orbitales */

        ctx.save();

        ctx.shadowBlur = 10;
        ctx.shadowColor = '#d9a8ff';
        ctx.fillStyle = shieldUp ? '#e6c8ff' : '#ff8aa0';

        for (let k = 0; k < 3; k++) {
            const a = t * 1.3 + k * (Math.PI * 2 / 3);
            ctx.beginPath();
            ctx.arc(Math.cos(a) * 34, 8 + Math.sin(a) * 12, 3, 0, Math.PI * 2);
            ctx.fill();
        }

        ctx.restore();

        /* canons */

        ctx.fillStyle = '#c9b8e8';
        ctx.strokeStyle = '#2a1a44';
        ctx.lineWidth = 1.5;

        for (const cx of [-118, 118]) {
            ctx.fillRect(cx - 7, 30, 14, 26);
            ctx.strokeRect(cx - 7, 30, 14, 26);
        }

        ctx.fillRect(-6, 62, 12, 22);
        ctx.strokeRect(-6, 62, 12, 22);

        if (b.attack) {

            ctx.save();

            ctx.shadowBlur = 16;
            ctx.shadowColor = '#d38bff';
            ctx.fillStyle = '#f3d9ff';

            ctx.beginPath();
            ctx.arc(-118, 57, 5, 0, Math.PI * 2);
            ctx.arc(118, 57, 5, 0, Math.PI * 2);
            ctx.arc(0, 84, 5, 0, Math.PI * 2);
            ctx.fill();

            ctx.restore();
        }

        /* feux d'extrémité d'aile */

        ctx.save();

        ctx.shadowBlur = 12;
        ctx.shadowColor = '#ff5cf0';
        ctx.fillStyle = Math.sin(now * 0.01) > 0 ? '#ff9af5' : '#5a1450';

        ctx.beginPath();
        ctx.arc(-166, -28, 3, 0, Math.PI * 2);
        ctx.arc(166, -28, 3, 0, Math.PI * 2);
        ctx.fill();

        ctx.restore();

        /* dégâts */

        const hf = b.hull / b.maxHull;

        if (!shieldUp && hf < 0.75) {

            ctx.save();

            ctx.strokeStyle = 'rgba(0,0,0,.65)';
            ctx.lineWidth = 2;

            ctx.beginPath();
            ctx.moveTo(-100, -20); ctx.lineTo(-88, -2); ctx.lineTo(-104, 12); ctx.lineTo(-92, 30);

            if (hf < 0.5) {
                ctx.moveTo(96, -22); ctx.lineTo(106, -4); ctx.lineTo(88, 10); ctx.lineTo(100, 28);
                ctx.moveTo(-20, -34); ctx.lineTo(-8, -14); ctx.lineTo(-22, 0);
            }

            ctx.stroke();

            if (hf < 0.5) {

                ctx.shadowBlur = 10;
                ctx.shadowColor = '#ff5cf0';
                ctx.strokeStyle = 'rgba(255,120,240,.85)';
                ctx.lineWidth = 1.2;

                ctx.beginPath();
                ctx.moveTo(96, -22); ctx.lineTo(106, -4); ctx.lineTo(88, 10); ctx.lineTo(100, 28);
                ctx.stroke();
            }

            ctx.restore();
        }

        if (b.hitFlash > 0) {

            hullPath();

            ctx.fillStyle = 'rgba(255,255,255,' + Math.min(0.6, b.hitFlash * 6) + ')';
            ctx.fill();
        }

        if (b.shield > 0) drawBossShield(b, now);

        ctx.restore();
    }


    /* ============================================================
       v2.4 — DÉPLACEMENT VERTICAL, TOUCHES RÉAFFECTABLES, CODE « SONIC »
    ============================================================ */

    function windowOpen() {
        return container.style.display === 'block' && !minimized;
    }

    /* le joueur peut maintenant aller dans toute la fenêtre */

    function playerMinY() {
        return 48;
    }

    function playerMaxY() {
        return canvas.height - 42;
    }

    function shipSpeedMul() {
        return ultra ? 2.2 : SHIPS[selectedShip].speed;
    }

    function shipFireMul() {
        return ultra ? 0.35 : SHIPS[selectedShip].fire;
    }

    /* --- touches --- */

    function keyLabel(k) {

        const map = {
            arrowup: '↑',
            arrowdown: '↓',
            arrowleft: '←',
            arrowright: '→',
            ' ': 'ESPACE'
        };

        return map[k] || String(k).toUpperCase();
    }

    function isBoundKey(k) {
        return k === keyBinds.up || k === keyBinds.down || k === keyBinds.left || k === keyBinds.right || k === keyBinds.fire;
    }

    function refreshFooter() {

        footer.textContent =
            '↑ ' + keyLabel(keyBinds.up) +
            '  ↓ ' + keyLabel(keyBinds.down) +
            '  ← ' + keyLabel(keyBinds.left) +
            '  → ' + keyLabel(keyBinds.right) +
            '   •   Tir : ' + keyLabel(keyBinds.fire) + ' ou clic (maintenir)   •   P : Pause';
    }

    function saveBinds() {

        try {
            localStorage.setItem('sonicStrikerKeys', JSON.stringify(keyBinds));
        } catch (e) { /* stockage indisponible */ }

        refreshFooter();
    }

    /* accepte une lettre / un chiffre / un signe, ou une flèche */

    function bindableKey(k) {
        return (k.length === 1 || k.indexOf('arrow') === 0) && !RESERVED_KEYS.includes(k);
    }

    function applyRebind(action, key) {

        if (!bindableKey(key)) return false;

        const old = keyBinds[action];

        /* si la touche servait déjà à autre chose, on échange */

        for (const other of Object.keys(keyBinds)) {
            if (other !== action && keyBinds[other] === key) keyBinds[other] = old;
        }

        keyBinds[action] = key;

        for (const k in keys) keys[k] = false;

        saveBinds();

        return true;
    }

    /* --- code secret « sonic » --- */

    function toggleUltra() {

        ultra = !ultra;

        if (gameStarted) {
            showBanner(
                'CODE SONIC',
                ultra ? 'MODE ULTRA : vitesse et cadence de tir au maximum !' : 'Mode ultra désactivé',
                '#ffd21a',
                2.4
            );
        }
    }

    function drawUltraAura(x, y) {

        const now = performance.now();
        const p = 0.6 + Math.sin(now * 0.02) * 0.25;

        ctx.save();

        ctx.globalCompositeOperation = 'lighter';

        const g = ctx.createRadialGradient(x, y, 6, x, y, 72);

        g.addColorStop(0, 'rgba(255,240,140,' + (0.45 * p) + ')');
        g.addColorStop(0.5, 'rgba(0,229,255,' + (0.22 * p) + ')');
        g.addColorStop(1, 'rgba(0,120,255,0)');

        ctx.fillStyle = g;

        ctx.beginPath();
        ctx.arc(x, y, 72, 0, Math.PI * 2);
        ctx.fill();

        /* lignes de vitesse */

        ctx.strokeStyle = 'rgba(255,255,255,.55)';
        ctx.lineWidth = 2;

        for (let i = 0; i < 4; i++) {

            const ox = (i - 1.5) * 14;
            const len = 24 + ((now * 0.35 + i * 23) % 44);

            ctx.beginPath();
            ctx.moveTo(x + ox, y + 30);
            ctx.lineTo(x + ox, y + 30 + len);
            ctx.stroke();
        }

        ctx.restore();
    }

    function drawUltraTag() {

        if (!ultra || !gameStarted) return;

        ctx.save();

        ctx.textAlign = 'left';
        ctx.font = 'bold 13px Arial';
        ctx.shadowBlur = 12;
        ctx.shadowColor = '#ffd21a';
        ctx.fillStyle = 'rgba(255,227,107,' + (0.75 + Math.sin(performance.now() * 0.012) * 0.25) + ')';
        ctx.fillText('⚡ MODE ULTRA', 12, canvas.height - 10);

        ctx.restore();
    }

    /* --- le bouclier du boss est solide : on ne peut pas le traverser --- */

    function pushPlayerOutOfBoss() {

        if (!boss || boss.dying) return;

        const shieldUp = boss.shield > 0;

        const rx = (shieldUp ? SHIELD_RX : HULL_RX) + 26;
        const ry = (shieldUp ? SHIELD_RY : HULL_RY) + 26;

        const cx = boss.x;
        const cy = boss.y + BOSS_CY;

        let dx = player.x - cx;
        let dy = player.y - cy;

        const n = Math.sqrt((dx * dx) / (rx * rx) + (dy * dy) / (ry * ry));

        if (n >= 1) return;

        let nx, ny;

        if (n < 0.001) {
            nx = player.x;
            ny = cy + ry + 1;
        } else {
            nx = cx + dx / n;
            ny = cy + dy / n;
        }

        /* si la sortie radiale sort de l'écran, on repousse vers le bas */

        if (ny < playerMinY() || nx < 35 || nx > canvas.width - 35) {
            const k = Math.sqrt(Math.max(0, 1 - (dx * dx) / (rx * rx)));
            nx = player.x;
            ny = cy + ry * k + 1;
        }

        player.x = clamp(nx, 35, canvas.width - 35);
        player.y = clamp(ny, playerMinY(), playerMaxY());
    }

    /* --- clavier --- */

    function typingInField(e) {

        const t = e.target;

        return !!t && (
            t.tagName === 'INPUT' ||
            t.tagName === 'TEXTAREA' ||
            t.tagName === 'SELECT' ||
            t.isContentEditable === true
        );
    }

    /* On écoute en phase de capture et on bloque la propagation des touches
       du jeu : les autres scripts OGame (raccourcis clavier) ne les reçoivent
       plus tant que la fenêtre du jeu est ouverte. */

    function gameKeyDown(e) {

        if (!windowOpen() || typingInField(e)) return;

        const key = e.key.toLowerCase();

        const stop = () => {
            e.preventDefault();
            if (e.stopImmediatePropagation) e.stopImmediatePropagation();
        };

        /* réaffectation d'une touche depuis le menu */

        if (!gameStarted && rebinding) {

            stop();

            if (key === 'escape') {
                rebinding = null;
                return;
            }

            if (applyRebind(rebinding, key)) rebinding = null;

            return;
        }

        /* code secret : 1-2-3-4-5 (au menu comme en jeu) */

        if (key === '1' || key === '2' || key === '3' || key === '4' || key === '5') {

            stop();

            secretBuffer = (secretBuffer + key).slice(-5);

            if (secretBuffer === '12345') {
                secretBuffer = '';
                toggleUltra();
            }

            return;
        }

        if (key !== 'shift' && key !== 'control' && key !== 'alt' &&
            key !== 'meta' && key !== 'capslock') {
            secretBuffer = '';
        }

        if (!gameStarted) {

            if (key === 'enter') {
                stop();
                startGame();
            }

            return;
        }

        if (key === 'p') {
            stop();
            if (victory || hull <= 0) return;
            paused = !paused;
            lastTime = performance.now();
            return;
        }

        if (isBoundKey(key)) {
            keys[key] = true;
            stop();
        }
    }

    function gameKeyUp(e) {

        const key = e.key.toLowerCase();

        keys[key] = false;

        if (windowOpen() && gameStarted && !typingInField(e) &&
            (isBoundKey(key) || key === 'p') && e.stopImmediatePropagation) {
            e.stopImmediatePropagation();
        }
    }

    function winBlur() {

        mouseHeld = false;

        for (const k in keys) keys[k] = false;
    }


        /* ============================================================
       v2.7 — NIVEAU 3
       Ennemis : ESSAIM, MISSILIER, MINEUR, SNIPER
       Tirs    : missiles à tête chercheuse, mines, lasers à préavis
       Boss    : CITADELLE (bouclier + bouclier de secours)
    ============================================================ */

    BOSS_DEFS.push({
        name: 'CITADELLE',
        sub: 'Missiles, mines, lasers… et un bouclier de secours',
        color: '#7dff9a',
        hp: 1.3,
        dmg: 0.85,
        delayMul: 1.6,
        bulletMul: 0.92,
        supplyEvery: 16,
        regen: 0.04,
        speeds: [0, 45, 65, 90],
        shield: [120, 255, 160],
        spark: '130,255,170',
        bar: '#5dff9b',
        beam: '125,255,154',
        secondShield: 0.45,
        patterns: {
            1: ['cannons', 'missiles', 'laser'],
            2: ['missiles', 'laser', 'mines', 'fan', 'wall'],
            3: ['missiles', 'laser', 'mines', 'spiral', 'wall', 'nova', 'tracking']
        }
    });

    function clearEnemyFire() {
        enemyBullets.length = 0;
        beams.length = 0;
        warnLines.length = 0;
    }

    /* ------------------------------------------------------------
       CHOIX DES ENNEMIS SELON LE NIVEAU
    ------------------------------------------------------------ */



    /* les drones volent en formation en V */

    function spawnDroneGroup(type) {

        const n = level >= 4 ? 5 : 4;
        const baseX = 140 + Math.random() * (canvas.width - 280);
        const phase = Math.random() * Math.PI * 2;

        for (let k = 0; k < n; k++) {

            const off = k - (n - 1) / 2;

            enemies.push({
                x: baseX + off * 44,
                y: -60 - Math.abs(off) * 32,
                type,
                hp: Math.ceil(type.hp * (1 + (level - 1) * 0.25)),
                phase,
                direction: 1,
                fireTimer: 99
            });
        }
    }

    /* ------------------------------------------------------------
       MISSILES À TÊTE CHERCHEUSE
       Lents à tourner, durée de vie limitée, et on peut les abattre.
    ------------------------------------------------------------ */

    function activeMissiles() {

        let n = 0;

        for (const b of enemyBullets) if (b.kind === 'missile') n++;

        return n;
    }

    function launchMissile(x, y, angle, speedMul, damage, pat) {

        if (activeMissiles() >= 6) return;
        if (Math.hypot(x - player.x, y - player.y) < 70) return;

        const sp = 150 * (speedMul || 1);

        enemyBullets.push({
            x, y,
            vx: Math.cos(angle) * sp,
            vy: Math.sin(angle) * sp,
            size: 7,
            kind: 'missile',
            hp: 2,
            speed: sp,
            turn: 1.5,
            age: 0,
            life: 4.5,
            damage: damage || 12,
            pat: pat || ''
        });
    }

    function steerMissile(m, dt) {

        m.age += dt;

        const want = Math.atan2(player.y - m.y, player.x - m.x);
        let cur = Math.atan2(m.vy, m.vx);

        const diff = Math.atan2(Math.sin(want - cur), Math.cos(want - cur));
        const maxTurn = m.turn * dt;

        cur += clamp(diff, -maxTurn, maxTurn);

        m.vx = Math.cos(cur) * m.speed;
        m.vy = Math.sin(cur) * m.speed;

        if (Math.random() < 0.55) emitTrail(m.x - Math.cos(cur) * 8, m.y - Math.sin(cur) * 8, 'smoke');
    }

    /* ------------------------------------------------------------
       MINES : dérivent, puis explosent en anneau (ou se désamorcent
       d'un tir)
    ------------------------------------------------------------ */

    function dropMine(x, y, big, pat) {

        if (Math.hypot(x - player.x, y - player.y) < 70) return;

        enemyBullets.push({
            x, y,
            vx: (Math.random() - 0.5) * 30,
            vy: 55 + Math.random() * 20,
            size: 9,
            kind: 'mine',
            hp: 2,
            fuse: 2.2 + Math.random() * 0.5,
            rings: big ? 10 : 8,
            damage: 10,
            pat: pat || ''
        });
    }

    function burstMine(m) {

        explode(m.x, m.y, false, '255,179,71');

        shake = Math.max(shake, 3);

        if (Math.hypot(m.x - player.x, m.y - player.y) < 55) return;

        const rot = Math.random() * Math.PI;

        for (let k = 0; k < m.rings; k++) {
            fireAngle(m.x, m.y, rot + k * (Math.PI * 2 / m.rings), 135, 5, {
                damage: 9,
                color: '#ffb347',
                pat: m.pat
            });
        }
    }

    /* les missiles et les mines peuvent être abattus par le joueur */

    function shootDownEnemyFire() {

        for (let bi = bullets.length - 1; bi >= 0; bi--) {

            const pb = bullets[bi];

            for (let ei = enemyBullets.length - 1; ei >= 0; ei--) {

                const eb = enemyBullets[ei];

                if (!eb.kind) continue;

                if (Math.abs(pb.x - eb.x) < eb.size + 5 && Math.abs(pb.y - eb.y) < eb.size + 9) {

                    bullets.splice(bi, 1);

                    eb.hp--;

                    spark(eb.x, eb.y, '255,200,120', 4);

                    if (eb.hp <= 0) {
                        explode(eb.x, eb.y, false, '255,170,80');
                        score += 25;
                        stats.shotDown++;
                        enemyBullets.splice(ei, 1);
                    }

                    break;
                }
            }
        }
    }

    /* ------------------------------------------------------------
       LASERS : un trait fin clignote (préavis), puis le faisceau part
       dans la direction verrouillée. On a le temps de s'écarter.
    ------------------------------------------------------------ */

    function spawnBeam(x0, y0, tx, ty, o) {

        beams.push({
            x0, y0,
            ang: Math.atan2(ty - y0, tx - x0),
            warn: o.warn || 1.0,
            fire: o.fire || 0.45,
            t: 0,
            w: o.w || 32,
            damage: o.damage || 20,
            rgb: o.rgb || '255,77,77',
            spin: o.spin || 0,
            follow: o.follow || null,
            hit: false
        });
    }

    function distToSegment(px, py, ax, ay, bx, by) {

        const dx = bx - ax;
        const dy = by - ay;

        const l2 = dx * dx + dy * dy;

        let t = l2 === 0 ? 0 : ((px - ax) * dx + (py - ay) * dy) / l2;

        t = clamp(t, 0, 1);

        return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
    }

    function updateBeams(dt) {

        for (let i = beams.length - 1; i >= 0; i--) {

            const b = beams[i];
            b.t += dt;

            if (b.spin && b.t > b.warn) b.ang += b.spin * dt;

            if (b.follow && boss && !boss.dying) {
                b.x0 = boss.x + b.follow[0];
                b.y0 = boss.y + b.follow[1];
            }

            if (b.t >= b.warn + b.fire) {
                beams.splice(i, 1);
                continue;
            }

            if (b.t >= b.warn && !b.hit) {

                const ex = b.x0 + Math.cos(b.ang) * 1300;
                const ey = b.y0 + Math.sin(b.ang) * 1300;

                if (distToSegment(player.x, player.y, b.x0, b.y0, ex, ey) < b.w / 2 + 14) {

                    if (shieldTimer > 0) {

                        b.hit = true;
                        explode(player.x, player.y);

                    } else if (invincibilityTimer <= 0) {

                        b.hit = true;
                        beamHitCount++;

                        hull -= b.damage;
                        lastDamage = b.damage;
                        damageFlash = 0.25;
                        invincibilityTimer = 0.7;

                        if (hull < 0) hull = 0;
                    }
                }
            }
        }
    }

    function drawBeams() {

        if (!beams.length) return;

        const now = performance.now();

        ctx.save();

        for (const b of beams) {

            const ex = b.x0 + Math.cos(b.ang) * 1300;
            const ey = b.y0 + Math.sin(b.ang) * 1300;

            if (b.t < b.warn) {

                /* préavis : trait pointillé qui clignote de plus en plus vite */

                const k = b.t / b.warn;
                const blink = 0.5 + 0.5 * Math.sin(now * (0.012 + k * 0.03));

                ctx.setLineDash([10, 8]);
                ctx.lineWidth = 2;
                ctx.strokeStyle = 'rgba(' + b.rgb + ',' + (0.25 + 0.5 * k * blink) + ')';

                ctx.beginPath();
                ctx.moveTo(b.x0, b.y0);
                ctx.lineTo(ex, ey);
                ctx.stroke();

                ctx.setLineDash([]);

                ctx.fillStyle = 'rgba(' + b.rgb + ',' + (0.4 + 0.5 * k) + ')';
                ctx.beginPath();
                ctx.arc(b.x0, b.y0, 4 + 6 * k, 0, Math.PI * 2);
                ctx.fill();

            } else {

                const left = b.warn + b.fire - b.t;
                const a = Math.min(1, left / 0.15);

                ctx.lineCap = 'round';

                ctx.shadowBlur = 26;
                ctx.shadowColor = 'rgb(' + b.rgb + ')';
                ctx.strokeStyle = 'rgba(' + b.rgb + ',' + (0.45 * a) + ')';
                ctx.lineWidth = b.w;

                ctx.beginPath();
                ctx.moveTo(b.x0, b.y0);
                ctx.lineTo(ex, ey);
                ctx.stroke();

                ctx.shadowBlur = 0;
                ctx.strokeStyle = 'rgba(255,255,255,' + (0.95 * a) + ')';
                ctx.lineWidth = b.w * 0.4;

                ctx.beginPath();
                ctx.moveTo(b.x0, b.y0);
                ctx.lineTo(ex, ey);
                ctx.stroke();
            }
        }

        ctx.restore();
    }

    function drawSpecialBullet(b) {

        const now = performance.now();

        ctx.save();
        ctx.translate(b.x, b.y);

        if (b.kind === 'missile') {

            ctx.rotate(Math.atan2(b.vy, b.vx));

            ctx.shadowBlur = 12;
            ctx.shadowColor = '#ff7a45';

            ctx.fillStyle = 'rgba(255,200,90,.95)';
            ctx.beginPath();
            ctx.moveTo(-7, -2.5);
            ctx.lineTo(-15 - Math.random() * 5, 0);
            ctx.lineTo(-7, 2.5);
            ctx.closePath();
            ctx.fill();

            ctx.shadowBlur = 0;

            ctx.fillStyle = '#ff7a45';
            ctx.beginPath();
            ctx.moveTo(-7, -3.5); ctx.lineTo(-12, -8); ctx.lineTo(-2, -3.5);
            ctx.moveTo(-7, 3.5); ctx.lineTo(-12, 8); ctx.lineTo(-2, 3.5);
            ctx.fill();

            ctx.fillStyle = '#dfe4e8';
            ctx.beginPath();
            ctx.moveTo(10, 0); ctx.lineTo(4, -3.6); ctx.lineTo(-7, -3.6);
            ctx.lineTo(-7, 3.6); ctx.lineTo(4, 3.6);
            ctx.closePath();
            ctx.fill();

            ctx.fillStyle = '#ff3b3b';
            ctx.beginPath();
            ctx.moveTo(10, 0); ctx.lineTo(4, -3.6); ctx.lineTo(4, 3.6);
            ctx.closePath();
            ctx.fill();

        } else {

            /* mine */

            const left = Math.max(0, b.fuse);
            const urgent = left < 0.8;
            const blink = urgent ? Math.sin(now * 0.05) > 0 : Math.sin(now * 0.012) > 0.6;

            ctx.strokeStyle = '#ffb347';
            ctx.lineWidth = 2;

            ctx.beginPath();

            for (let k = 0; k < 8; k++) {
                const a = k * Math.PI / 4 + now * 0.002;
                ctx.moveTo(Math.cos(a) * 8, Math.sin(a) * 8);
                ctx.lineTo(Math.cos(a) * 14, Math.sin(a) * 14);
            }

            ctx.stroke();

            ctx.fillStyle = '#3a2a10';
            ctx.beginPath();
            ctx.arc(0, 0, 9, 0, Math.PI * 2);
            ctx.fill();
            ctx.stroke();

            ctx.save();
            ctx.shadowBlur = 10;
            ctx.shadowColor = blink ? '#ff3b3b' : '#ffb347';
            ctx.fillStyle = blink ? '#ff5b4b' : '#ffcf7a';
            ctx.beginPath();
            ctx.arc(0, 0, 3.6, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();

            if (urgent) {
                ctx.strokeStyle = 'rgba(255,80,60,' + (0.7 - left * 0.6) + ')';
                ctx.lineWidth = 1.5;
                ctx.beginPath();
                ctx.arc(0, 0, 16 + (0.8 - left) * 26, 0, Math.PI * 2);
                ctx.stroke();
            }
        }

        ctx.restore();
    }

    /* ------------------------------------------------------------
       VAISSEAUX ENNEMIS DU NIVEAU 3 (nez vers le bas)
    ------------------------------------------------------------ */

    function drawDrone(e) {

        ctx.save();
        ctx.translate(e.x, e.y);

        ctx.save();
        ctx.shadowBlur = 10;
        ctx.shadowColor = '#3fe0ff';
        ctx.fillStyle = 'rgba(120,240,255,.9)';
        ctx.beginPath();
        ctx.arc(0, -13, 2.5 + Math.random() * 1.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();

        shipPoly([0, 17, 7, 2, 15, -11, 5, -7, 0, -13, -5, -7, -15, -11, -7, 2]);

        const g = ctx.createLinearGradient(-15, 0, 15, 0);
        g.addColorStop(0, '#0c3b46');
        g.addColorStop(0.5, '#2a9fb0');
        g.addColorStop(1, '#0c3b46');

        ctx.fillStyle = g;
        ctx.strokeStyle = '#6ff3ff';
        ctx.lineWidth = 1.5;
        ctx.fill();
        ctx.stroke();

        ctx.restore();
    }

    function drawMissilier(e) {

        const pulse = 0.6 + 0.4 * Math.sin(performance.now() * 0.01 + e.phase);

        ctx.save();
        ctx.translate(e.x, e.y);

        /* nacelles à missiles */

        for (const sgn of [-1, 1]) {

            ctx.fillStyle = '#1c2a20';
            ctx.strokeStyle = '#ffb347';
            ctx.lineWidth = 1.5;
            ctx.fillRect(sgn * 30 - 6, -12, 12, 30);
            ctx.strokeRect(sgn * 30 - 6, -12, 12, 30);

            ctx.fillStyle = '#ff7a45';
            ctx.beginPath();
            ctx.moveTo(sgn * 30 - 5, 18);
            ctx.lineTo(sgn * 30, 27);
            ctx.lineTo(sgn * 30 + 5, 18);
            ctx.closePath();
            ctx.fill();
        }

        shipPoly([0, 32, 22, 15, 26, -10, 16, -24, -16, -24, -26, -10, -22, 15]);

        const g = ctx.createLinearGradient(-26, 0, 26, 0);
        g.addColorStop(0, '#1a261d');
        g.addColorStop(0.5, '#4d6a52');
        g.addColorStop(1, '#1a261d');

        ctx.fillStyle = g;
        ctx.strokeStyle = '#ffb347';
        ctx.lineWidth = 2;
        ctx.fill();
        ctx.stroke();

        ctx.save();
        ctx.shadowBlur = 12 * pulse;
        ctx.shadowColor = '#ff7a45';
        ctx.fillStyle = '#ff9a5a';
        ctx.beginPath();
        ctx.arc(0, 2, 6, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();

        ctx.restore();
    }

    function drawMineur(e) {

        const pulse = 0.6 + 0.4 * Math.sin(performance.now() * 0.008 + e.phase);

        ctx.save();
        ctx.translate(e.x, e.y);

        shipPoly([0, 30, 20, 22, 32, 4, 28, -18, 12, -28, -12, -28, -28, -18, -32, 4, -20, 22]);

        const g = ctx.createLinearGradient(-32, 0, 32, 0);
        g.addColorStop(0, '#2a2412');
        g.addColorStop(0.5, '#7a6a34');
        g.addColorStop(1, '#2a2412');

        ctx.fillStyle = g;
        ctx.strokeStyle = '#ffb347';
        ctx.lineWidth = 2;
        ctx.fill();
        ctx.stroke();

        /* bandes de danger */

        ctx.save();
        ctx.beginPath();
        ctx.rect(-26, -6, 52, 10);
        ctx.clip();
        ctx.fillStyle = '#e8b923';

        for (let k = -4; k < 6; k++) {
            ctx.beginPath();
            ctx.moveTo(k * 12, -6);
            ctx.lineTo(k * 12 + 7, -6);
            ctx.lineTo(k * 12 - 1, 4);
            ctx.lineTo(k * 12 - 8, 4);
            ctx.closePath();
            ctx.fill();
        }

        ctx.restore();

        /* soute à mines */

        ctx.fillStyle = '#100c04';
        ctx.fillRect(-9, 12, 18, 12);

        ctx.save();
        ctx.shadowBlur = 10 * pulse;
        ctx.shadowColor = '#ff3b3b';
        ctx.fillStyle = pulse > 0.75 ? '#ff6b5a' : '#7a2018';
        ctx.beginPath();
        ctx.arc(0, -17, 4, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();

        ctx.restore();
    }

    function drawSniper(e) {

        const pulse = 0.6 + 0.4 * Math.sin(performance.now() * 0.012 + e.phase);

        ctx.save();
        ctx.translate(e.x, e.y);

        /* canon long */

        ctx.fillStyle = '#2a2f3a';
        ctx.strokeStyle = '#ff6b6b';
        ctx.lineWidth = 1.5;
        ctx.fillRect(-3, 12, 6, 28);
        ctx.strokeRect(-3, 12, 6, 28);

        shipPoly([0, 34, 9, 10, 14, -14, 7, -26, -7, -26, -14, -14, -9, 10]);

        const g = ctx.createLinearGradient(-14, 0, 14, 0);
        g.addColorStop(0, '#161a22');
        g.addColorStop(0.5, '#4a5468');
        g.addColorStop(1, '#161a22');

        ctx.fillStyle = g;
        ctx.strokeStyle = '#ff6b6b';
        ctx.lineWidth = 2;
        ctx.fill();
        ctx.stroke();

        /* ailerons */

        for (const sgn of [-1, 1]) {
            shipPoly([sgn * 12, -8, sgn * 30, -22, sgn * 26, -28, sgn * 10, -20]);
            ctx.fillStyle = '#242a36';
            ctx.fill();
            ctx.stroke();
        }

        /* lentille */

        ctx.save();
        ctx.shadowBlur = 14 * pulse;
        ctx.shadowColor = '#ff3b3b';
        ctx.fillStyle = '#ff5b5b';
        ctx.beginPath();
        ctx.arc(0, 4, 5, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();

        ctx.restore();
    }

    /* ------------------------------------------------------------
       BOSS 3 : LA CITADELLE (forteresse d'acier, noyau vert)
    ------------------------------------------------------------ */

    function drawBossCitadel() {

        const b = boss;
        const now = performance.now();
        const t = now * 0.004;
        const shieldUp = b.shield > 0;

        ctx.save();
        ctx.translate(b.x, b.y);

        if (b.dying) {
            ctx.translate((Math.random() - 0.5) * 6, (Math.random() - 0.5) * 6);
        }

        /* réacteurs */

        const flame = 22 + Math.sin(t * 6) * 6;

        ctx.save();
        ctx.shadowBlur = 20;
        ctx.shadowColor = '#7dff9a';

        for (const ex of [-112, -56, 56, 112]) {

            const fg = ctx.createLinearGradient(0, -52, 0, -52 - flame);

            fg.addColorStop(0, '#ffffff');
            fg.addColorStop(0.4, '#9dffb6');
            fg.addColorStop(1, 'rgba(60,255,120,0)');

            ctx.fillStyle = fg;

            ctx.beginPath();
            ctx.moveTo(ex - 13, -52);
            ctx.lineTo(ex, -52 - flame);
            ctx.lineTo(ex + 13, -52);
            ctx.closePath();
            ctx.fill();
        }

        ctx.restore();

        /* coque */

        const hullPath = () => {
            shipPoly([0, 90, -44, 72, -100, 58, -152, 40, -174, 4, -160, -30, -110, -46,
                -50, -54, 0, -58, 50, -54, 110, -46, 160, -30, 174, 4, 152, 40, 100, 58, 44, 72]);
        };

        const hg = ctx.createLinearGradient(-174, 0, 174, 0);

        hg.addColorStop(0, '#10181a');
        hg.addColorStop(0.25, '#3c4f55');
        hg.addColorStop(0.5, '#6b8289');
        hg.addColorStop(0.75, '#3c4f55');
        hg.addColorStop(1, '#10181a');

        hullPath();
        ctx.fillStyle = hg;
        ctx.fill();

        ctx.save();
        ctx.shadowBlur = 10;
        ctx.shadowColor = '#7dff9a';
        ctx.strokeStyle = '#7dff9a';
        ctx.lineWidth = 3;
        ctx.stroke();
        ctx.restore();

        /* panneaux */

        ctx.strokeStyle = 'rgba(125,255,154,.35)';
        ctx.lineWidth = 1.5;

        ctx.beginPath();

        for (const sgn of [-1, 1]) {
            ctx.moveTo(sgn * 50, -50); ctx.lineTo(sgn * 100, -30); ctx.lineTo(sgn * 150, -26);
            ctx.moveTo(sgn * 58, 44); ctx.lineTo(sgn * 108, 34); ctx.lineTo(sgn * 160, 20);
            ctx.moveTo(sgn * 75, -8); ctx.lineTo(sgn * 165, 2);
        }

        ctx.stroke();

        /* hangars à missiles */

        const launching = b.attack && b.attack.type === 'missiles';

        for (const sgn of [-1, 1]) {

            ctx.fillStyle = '#0a1012';
            ctx.strokeStyle = launching ? '#ffb347' : '#7dff9a';
            ctx.lineWidth = 2;
            ctx.fillRect(sgn * 100 - 20, 4, 40, 34);
            ctx.strokeRect(sgn * 100 - 20, 4, 40, 34);

            ctx.fillStyle = launching ? '#ffb347' : '#ff7a45';

            for (let k = -1; k <= 1; k++) {
                ctx.beginPath();
                ctx.moveTo(sgn * 100 + k * 11 - 3, 36);
                ctx.lineTo(sgn * 100 + k * 11, 28);
                ctx.lineTo(sgn * 100 + k * 11 + 3, 36);
                ctx.closePath();
                ctx.fill();
            }
        }

        /* tour centrale */

        const tg = ctx.createLinearGradient(-46, 0, 46, 0);

        tg.addColorStop(0, '#1b2629');
        tg.addColorStop(0.4, '#8ea6ad');
        tg.addColorStop(0.6, '#56696f');
        tg.addColorStop(1, '#202c30');

        shipPoly([-36, -46, 36, -46, 46, 20, 0, 72, -46, 20]);
        ctx.fillStyle = tg;
        ctx.fill();
        ctx.strokeStyle = '#c9ffd8';
        ctx.lineWidth = 2;
        ctx.stroke();

        /* noyau : vert tant qu'un bouclier tient, orange ensuite */

        const pulse = 0.7 + Math.sin(now * 0.008) * 0.3;
        const core = shieldUp ? '125,255,154' : '255,120,50';

        ctx.save();

        ctx.shadowBlur = 24 * pulse;
        ctx.shadowColor = 'rgb(' + core + ')';

        ctx.strokeStyle = 'rgb(' + core + ')';
        ctx.lineWidth = 5;

        for (let k = 0; k < 6; k++) {
            const a0 = t * 1.2 + k * Math.PI / 3;
            ctx.beginPath();
            ctx.arc(0, 14, 21, a0, a0 + 0.72);
            ctx.stroke();
        }

        const rg = ctx.createRadialGradient(0, 14, 1, 0, 14, 14);

        rg.addColorStop(0, '#ffffff');
        rg.addColorStop(0.5, 'rgba(' + core + ',1)');
        rg.addColorStop(1, 'rgba(' + core + ',0.2)');

        ctx.fillStyle = rg;
        ctx.beginPath();
        ctx.arc(0, 14, 13, 0, Math.PI * 2);
        ctx.fill();

        ctx.restore();

        /* lentilles laser */

        const lasing = b.attack && b.attack.type === 'laser';

        for (const sgn of [-1, 1]) {

            ctx.fillStyle = '#0a1012';
            ctx.beginPath();
            ctx.arc(sgn * 54, 60, 8, 0, Math.PI * 2);
            ctx.fill();

            ctx.save();
            ctx.shadowBlur = lasing ? 16 : 6;
            ctx.shadowColor = lasing ? '#ff5b5b' : '#7dff9a';
            ctx.fillStyle = lasing ? '#ff7a7a' : '#7dff9a';
            ctx.beginPath();
            ctx.arc(sgn * 54, 60, 4, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
        }

        /* canons */

        ctx.fillStyle = '#b9c7cc';
        ctx.strokeStyle = '#1e2a2e';
        ctx.lineWidth = 1.5;

        for (const cx of [-118, 118]) {
            ctx.fillRect(cx - 8, 30, 16, 26);
            ctx.strokeRect(cx - 8, 30, 16, 26);
        }

        ctx.fillRect(-7, 62, 14, 22);
        ctx.strokeRect(-7, 62, 14, 22);

        if (b.attack && b.attack.type !== 'laser' && b.attack.type !== 'missiles') {

            ctx.save();
            ctx.shadowBlur = 16;
            ctx.shadowColor = '#9dffb6';
            ctx.fillStyle = '#e6ffee';
            ctx.beginPath();
            ctx.arc(-118, 57, 5, 0, Math.PI * 2);
            ctx.arc(118, 57, 5, 0, Math.PI * 2);
            ctx.arc(0, 84, 5, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
        }

        /* feux de position */

        ctx.save();
        ctx.shadowBlur = 12;
        ctx.shadowColor = '#7dff9a';
        ctx.fillStyle = Math.sin(now * 0.01) > 0 ? '#b6ffc8' : '#1c4a2c';
        ctx.beginPath();
        ctx.arc(-172, 4, 3, 0, Math.PI * 2);
        ctx.arc(172, 4, 3, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();

        /* dégâts */

        const hf = b.hull / b.maxHull;

        if (!shieldUp && hf < 0.75) {

            ctx.save();

            ctx.strokeStyle = 'rgba(0,0,0,.7)';
            ctx.lineWidth = 2;

            ctx.beginPath();
            ctx.moveTo(-96, -38); ctx.lineTo(-84, -16); ctx.lineTo(-102, 0); ctx.lineTo(-90, 26);

            if (hf < 0.5) {
                ctx.moveTo(100, -40); ctx.lineTo(110, -16); ctx.lineTo(92, 2); ctx.lineTo(104, 30);
                ctx.moveTo(-14, -44); ctx.lineTo(-4, -20); ctx.lineTo(-18, 0);
            }

            ctx.stroke();

            if (hf < 0.5) {
                ctx.shadowBlur = 10;
                ctx.shadowColor = '#ff7a2a';
                ctx.strokeStyle = 'rgba(255,140,60,.85)';
                ctx.lineWidth = 1.2;
                ctx.beginPath();
                ctx.moveTo(100, -40); ctx.lineTo(110, -16); ctx.lineTo(92, 2); ctx.lineTo(104, 30);
                ctx.stroke();
            }

            ctx.restore();
        }

        if (b.hitFlash > 0) {

            hullPath();
            ctx.fillStyle = 'rgba(255,255,255,' + Math.min(0.6, b.hitFlash * 6) + ')';
            ctx.fill();
        }

        if (b.shield > 0) drawBossShield(b, now);

        ctx.restore();
    }


        /* ============================================================
       v2.8 — NIVEAU 4
       Ennemis : FAUCHEUR (charge), BASTION (bouclier), ORBITEUR (anneaux),
                 SPECTRE (camouflage)
       Bonus   : BOMBE (efface les tirs, frappe les ennemis)
       Boss    : HÉLIOS (rayons rotatifs, météores, escorte, bouclier de secours)
    ============================================================ */

    BOSS_DEFS.push({
        name: 'HÉLIOS',
        sub: 'Rayons rotatifs, météores solaires… et une escorte',
        color: '#ffd23f',
        hp: 1.45,
        dmg: 0.95,
        delayMul: 1.3,
        bulletMul: 0.95,
        supplyEvery: 16,
        regen: 0.045,
        speeds: [0, 55, 80, 105],
        shield: [255, 200, 80],
        spark: '255,210,100',
        bar: '#ffc933',
        beam: '255,190,60',
        secondShield: 0.5,
        patterns: {
            1: ['cannons', 'sweep', 'meteors'],
            2: ['sweep', 'meteors', 'missiles', 'fan', 'summon', 'wall'],
            3: ['sweep', 'meteors', 'laser', 'nova', 'spiral', 'summon', 'mines']
        }
    });

    const warnLines = [];
    let bombFlash = 0;

    /* ------------------------------------------------------------
       CHOIX DES ENNEMIS (niveaux 3, 4 et suivants)
    ------------------------------------------------------------ */

    function pickEnemyType(forcedIndex) {

        if (forcedIndex !== undefined) return enemyTypes[forcedIndex];

        if (level >= 5) return pickLevel5();

        if (level >= 3) {

            const tt = level >= 4 ? levelTimer + (level - 4) * 30 : levelTimer + (level - 3) * 40;

            /* [type, déblocage (s), poids, nouveauté ?] */

            const table = level >= 4 ? [
                [enemyTypes[0], 0, 1, false],    // éclaireur
                [enemyTypes[1], 0, 1, false],    // chasseur
                [enemyTypes[5], 0, 1, false],    // essaim
                [enemyTypes[9], 6, 2, true],     // faucheur
                [enemyTypes[6], 12, 1, false],   // missilier
                [enemyTypes[10], 18, 2, true],   // bastion
                [enemyTypes[11], 26, 2, true],   // orbiteur
                [enemyTypes[7], 32, 1, false],   // mineur
                [enemyTypes[12], 38, 2, true],   // spectre
                [enemyTypes[8], 44, 1, false],   // sniper
                [enemyTypes[3], 48, 1, false],   // intercepteur
                [enemyTypes[4], 52, 1, false],   // comète
                [enemyTypes[2], 58, 1, false]    // croiseur
            ] : [
                [enemyTypes[0], 0, 1, false],
                [enemyTypes[1], 0, 1, false],
                [enemyTypes[5], 0, 1, true],
                [enemyTypes[6], 14, 2, true],
                [enemyTypes[7], 28, 2, true],
                [enemyTypes[3], 36, 1, false],
                [enemyTypes[8], 42, 2, true],
                [enemyTypes[4], 50, 1, false],
                [enemyTypes[2], 56, 1, false]
            ];

            const pool = [];

            for (const [t, at, w, fresh] of table) {

                if (tt < at) continue;

                if (fresh && !levelSpawned[t.type]) {
                    levelSpawned[t.type] = true;
                    return t;
                }

                for (let k = 0; k < w; k++) pool.push(t);
            }

            return pool[Math.floor(Math.random() * pool.length)];
        }

        const difficulty = Math.min(3, Math.floor((levelTimer + (level - 1) * 40) / 20));
        const available = enemyTypes.slice(0, difficulty + 1);

        if (levelTimer + (level - 1) * 40 >= 45) available.push(enemyTypes[4]);

        return available[Math.floor(Math.random() * available.length)];
    }

    /* ------------------------------------------------------------
       INITIALISATION DES NOUVEAUX ENNEMIS
    ------------------------------------------------------------ */

    function initEnemyExtras(e) {

        const k = e.type.type;

        if (k === 'bastion') {
            e.sh = 4 + Math.min(3, Math.floor(level / 3));
            e.shMax = e.sh;
            e.shFlash = 0;
        }

        if (k === 'spectre') {
            e.cloaked = false;
            e.cloakT = 1.2 + Math.random() * 0.8;
            e.blinkX = e.x;
            e.fireTimer = 99;
        }

        if (k === 'lancer') {
            e.state = 'enter';
            e.fireTimer = 99;
        }

        if (k === 'orbiter') {
            e.ox = clamp(e.x, 150, canvas.width - 150);
            e.fireTimer = 2.2 + Math.random() * 1.2;
        }
    }

    function ringShot(x, y, n, speed, rot, dmg) {

        if (Math.hypot(x - player.x, y - player.y) < 75) return;

        for (let k = 0; k < n; k++) {
            fireAngle(x, y, rot + k * (Math.PI * 2 / n), speed, 5, {
                damage: dmg,
                color: '#7dd8ff'
            });
        }
    }

    function updateSpecial(e, dt) {

        const k = e.type.type;

        if (k === 'bastion') {
            if (e.shFlash > 0) e.shFlash -= dt;
        }

        /* Spectre : visible → invisible (invulnérable) → réapparaît ailleurs et tire */

        if (k === 'spectre') {

            e.cloakT -= dt;

            if (e.cloakT <= 0) {

                e.cloaked = !e.cloaked;

                if (e.cloaked) {
                    e.cloakT = 1.3;
                    e.blinkX = clamp(e.x + (Math.random() < 0.5 ? -1 : 1) * (130 + Math.random() * 120), 60, canvas.width - 60);
                    e.fireTimer = 99;
                } else {
                    e.cloakT = 2.4;
                    e.fireTimer = 0.35;
                }
            }

            if (e.cloaked) {
                e.x += (e.blinkX - e.x) * Math.min(1, dt * 5);
                e.fireTimer = 99;
            }
        }

        /* Faucheur : approche, vise (le trait se fige 0,3 s avant), fonce */

        if (k === 'lancer') {

            if (e.state === 'enter') {

                e.py = e.y;

                if (e.hoverY === undefined) e.hoverY = 70 + Math.random() * 70;

                if (e.y >= e.hoverY) {
                    e.state = 'aim';
                    e.aimT = 0;
                    e.holdX = e.x;
                    e.holdY = e.y;
                }

            } else if (e.state === 'aim') {

                e.aimT += dt;
                e.y = e.holdY;
                e.x = e.holdX + Math.sin(e.aimT * 18) * 1.5;

                if (e.aimT < 0.75) {
                    e.tx = player.x;
                    e.ty = player.y;
                }

                if (e.aimT >= 1.05) {

                    const a = Math.atan2(e.ty - e.holdY, e.tx - e.holdX);

                    e.vx = Math.cos(a) * 560;
                    e.vy = Math.sin(a) * 560;
                    e.px = e.holdX;
                    e.py = e.holdY;
                    e.state = 'dash';
                }

            } else {

                e.px += e.vx * dt;
                e.py += e.vy * dt;
                e.x = e.px;
                e.y = e.py;

                if (e.x < -90 || e.x > canvas.width + 90 || e.y > canvas.height + 90) {
                    e.y = canvas.height + 200;
                }

                /* dans la zone, mais pas sur le joueur : traînée d'étincelles */
                if (Math.random() < 0.7) emitTrail(e.x - e.vx * 0.02, e.y - e.vy * 0.02, 'smoke');
            }
        }
    }

    /* ------------------------------------------------------------
       DESSIN DES NOUVEAUX ENNEMIS
    ------------------------------------------------------------ */

    function drawLancer(e) {

        const now = performance.now();

        if (e.state === 'aim') {

            const k = Math.min(1, e.aimT / 1.05);
            const blink = 0.5 + 0.5 * Math.sin(now * (0.015 + k * 0.04));

            ctx.save();
            ctx.setLineDash([12, 8]);
            ctx.lineWidth = 2;
            ctx.strokeStyle = 'rgba(255,90,70,' + (0.25 + 0.55 * k * blink) + ')';
            ctx.beginPath();
            ctx.moveTo(e.holdX, e.holdY);
            ctx.lineTo(
                e.holdX + (e.tx - e.holdX) * 4,
                e.holdY + (e.ty - e.holdY) * 4
            );
            ctx.stroke();
            ctx.restore();
        }

        const ang = e.state === 'dash' ? Math.atan2(e.vy, e.vx) - Math.PI / 2 : 0;

        ctx.save();
        ctx.translate(e.x, e.y);
        ctx.rotate(ang);

        /* flamme */

        ctx.save();
        ctx.shadowBlur = 16;
        ctx.shadowColor = '#ff5a3c';
        ctx.fillStyle = e.state === 'dash' ? '#fff0a0' : '#ff7a4a';
        ctx.beginPath();
        ctx.moveTo(-7, -18);
        ctx.lineTo(0, -18 - (e.state === 'dash' ? 38 : 12 + Math.random() * 6));
        ctx.lineTo(7, -18);
        ctx.closePath();
        ctx.fill();
        ctx.restore();

        /* ailes en lame */

        for (const sgn of [-1, 1]) {
            shipPoly([sgn * 6, 6, sgn * 30, -6, sgn * 26, -22, sgn * 7, -14]);
            ctx.fillStyle = '#2b1216';
            ctx.strokeStyle = '#ff5a3c';
            ctx.lineWidth = 1.5;
            ctx.fill();
            ctx.stroke();
        }

        /* pointe de lance (nez vers le bas) */

        shipPoly([0, 36, 9, 8, 8, -16, -8, -16, -9, 8]);

        const g = ctx.createLinearGradient(-9, 0, 9, 0);
        g.addColorStop(0, '#2a0f12');
        g.addColorStop(0.5, '#a8403a');
        g.addColorStop(1, '#2a0f12');

        ctx.fillStyle = g;
        ctx.strokeStyle = '#ffb09a';
        ctx.lineWidth = 1.8;
        ctx.fill();
        ctx.stroke();

        ctx.save();
        ctx.shadowBlur = 10;
        ctx.shadowColor = '#ff3b3b';
        ctx.fillStyle = '#ff6b5a';
        ctx.beginPath();
        ctx.arc(0, 0, 3.2, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();

        ctx.restore();
    }

    function drawBastion(e) {

        const now = performance.now();

        ctx.save();
        ctx.translate(e.x, e.y);

        /* coque */

        shipPoly([0, 34, 24, 22, 38, -2, 30, -26, 12, -34, -12, -34, -30, -26, -38, -2, -24, 22]);

        const g = ctx.createLinearGradient(-38, 0, 38, 0);
        g.addColorStop(0, '#142033');
        g.addColorStop(0.5, '#4a6a92');
        g.addColorStop(1, '#142033');

        ctx.fillStyle = g;
        ctx.strokeStyle = '#7dd8ff';
        ctx.lineWidth = 2;
        ctx.fill();
        ctx.stroke();

        /* canons jumelés */

        ctx.fillStyle = '#a9c4de';
        ctx.fillRect(-14, 24, 6, 14);
        ctx.fillRect(8, 24, 6, 14);

        ctx.save();
        ctx.shadowBlur = 10;
        ctx.shadowColor = '#7dd8ff';
        ctx.fillStyle = '#bff0ff';
        ctx.beginPath();
        ctx.arc(0, -4, 6, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();

        /* bouclier frontal */

        if (e.sh > 0) {

            const frac = e.sh / e.shMax;
            const fl = e.shFlash > 0 ? e.shFlash * 5 : 0;

            ctx.save();
            ctx.lineCap = 'round';
            ctx.shadowBlur = 16 + fl * 40;
            ctx.shadowColor = '#7dd8ff';
            ctx.strokeStyle = 'rgba(125,216,255,' + (0.45 + 0.4 * frac + fl) + ')';
            ctx.lineWidth = 3 + frac * 3;
            ctx.beginPath();
            ctx.ellipse(0, 10, 52, 48, 0, 0.15 * Math.PI, 0.85 * Math.PI);
            ctx.stroke();

            ctx.fillStyle = 'rgba(125,216,255,' + (0.06 + fl * 0.4) + ')';
            ctx.beginPath();
            ctx.ellipse(0, 10, 52, 48, 0, 0.15 * Math.PI, 0.85 * Math.PI);
            ctx.lineTo(0, 10);
            ctx.closePath();
            ctx.fill();
            ctx.restore();
        }

        ctx.restore();
    }

    function drawOrbiter(e) {

        const now = performance.now();
        const t = now * 0.006 + e.phase;

        ctx.save();
        ctx.translate(e.x, e.y);

        /* anneau externe qui tourne */

        ctx.save();
        ctx.shadowBlur = 12;
        ctx.shadowColor = '#7dd8ff';
        ctx.strokeStyle = '#7dd8ff';
        ctx.lineWidth = 3;

        for (let k = 0; k < 4; k++) {
            const a0 = t + k * Math.PI / 2;
            ctx.beginPath();
            ctx.arc(0, 0, 28, a0, a0 + 0.9);
            ctx.stroke();
        }

        ctx.restore();

        /* noyau */

        const pulse = 0.7 + 0.3 * Math.sin(now * 0.01 + e.phase);

        const rg = ctx.createRadialGradient(0, 0, 2, 0, 0, 16);
        rg.addColorStop(0, '#ffffff');
        rg.addColorStop(0.5, '#4aa8e6');
        rg.addColorStop(1, '#0c2c5a');

        ctx.shadowBlur = 14 * pulse;
        ctx.shadowColor = '#4aa8e6';
        ctx.fillStyle = rg;
        ctx.beginPath();
        ctx.arc(0, 0, 15, 0, Math.PI * 2);
        ctx.fill();

        ctx.shadowBlur = 0;
        ctx.strokeStyle = '#bff0ff';
        ctx.lineWidth = 1.5;
        ctx.stroke();

        /* quatre bouches */

        ctx.fillStyle = '#cfe9ff';

        for (let k = 0; k < 4; k++) {
            const a = k * Math.PI / 2 + Math.PI / 4;
            ctx.beginPath();
            ctx.arc(Math.cos(a) * 20, Math.sin(a) * 20, 3, 0, Math.PI * 2);
            ctx.fill();
        }

        ctx.restore();
    }

    function drawSpectre(e) {

        const now = performance.now();

        ctx.save();
        ctx.globalAlpha = e.cloaked ? 0.14 + 0.08 * Math.sin(now * 0.03) : 1;
        ctx.translate(e.x, e.y);

        ctx.save();
        ctx.shadowBlur = 14;
        ctx.shadowColor = '#c27dff';

        shipPoly([0, 30, 10, 12, 30, -4, 22, -16, 8, -12, 0, -26, -8, -12, -22, -16, -30, -4, -10, 12]);

        const g = ctx.createLinearGradient(-30, 0, 30, 0);
        g.addColorStop(0, '#1a0f2e');
        g.addColorStop(0.5, '#6a3fa8');
        g.addColorStop(1, '#1a0f2e');

        ctx.fillStyle = g;
        ctx.strokeStyle = '#d9a8ff';
        ctx.lineWidth = 1.8;
        ctx.fill();
        ctx.stroke();
        ctx.restore();

        ctx.save();
        ctx.shadowBlur = 12;
        ctx.shadowColor = '#e6c8ff';
        ctx.fillStyle = '#f3e4ff';
        ctx.beginPath();
        ctx.ellipse(0, 4, 4, 8, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();

        ctx.restore();
    }

    /* ------------------------------------------------------------
       BOMBE : efface tous les tirs, frappe les ennemis (3 dégâts)
    ------------------------------------------------------------ */

    function detonateBomb() {

        bombFlash = 0.6;
        shake = Math.max(shake, 10);

        for (const b of enemyBullets) spark(b.x, b.y, '255,225,120', 3);

        clearEnemyFire();

        for (let i = enemies.length - 1; i >= 0; i--) {

            const e = enemies[i];

            stats.dmgDealt += e.sh > 0 ? e.sh : 3;
            if (e.sh > 0) e.sh = 0; else e.hp -= 3;

            explode(e.x, e.y, false, '255,225,120');

            if (e.hp <= 0) { stats.kills++; score += e.type.score;
                explode(e.x, e.y, true);
                enemies.splice(i, 1);
            }
        }

        showBanner('BOMBE', 'Tirs effacés', '#ffe14d', 1.3);
    }

    function drawBombFx() {

        if (bombFlash <= 0) return;

        const k = bombFlash / 0.6;
        const r = (1 - k) * 760;

        ctx.save();

        ctx.fillStyle = 'rgba(255,245,200,' + (0.5 * k) + ')';
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        ctx.strokeStyle = 'rgba(255,225,120,' + k + ')';
        ctx.lineWidth = 8 * k + 2;
        ctx.shadowBlur = 24;
        ctx.shadowColor = '#ffe14d';
        ctx.beginPath();
        ctx.arc(player.x, player.y, r, 0, Math.PI * 2);
        ctx.stroke();

        ctx.restore();
    }

    /* ------------------------------------------------------------
       MÉTÉORES : lignes de préavis, puis la pierre tombe
    ------------------------------------------------------------ */

    function addMeteorWarning(x, delay, dmg) {

        warnLines.push({ x, t: 0, delay, dmg });
    }

    function updateWarnLines(dt) {

        for (let i = warnLines.length - 1; i >= 0; i--) {

            const w = warnLines[i];

            w.t += dt;

            if (w.t >= w.delay) {

                fireAngle(w.x, -12, Math.PI / 2, 320, 12, {
                    damage: w.dmg,
                    color: '#ffb347',
                    pat: 'meteors'
                });

                warnLines.splice(i, 1);
            }
        }
    }

    function drawWarnLines() {

        if (!warnLines.length) return;

        const now = performance.now();

        ctx.save();
        ctx.setLineDash([10, 9]);
        ctx.lineWidth = 2;

        for (const w of warnLines) {

            const k = w.t / w.delay;
            const blink = 0.5 + 0.5 * Math.sin(now * (0.012 + k * 0.03));

            ctx.strokeStyle = 'rgba(255,190,70,' + (0.2 + 0.5 * k * blink) + ')';
            ctx.beginPath();
            ctx.moveTo(w.x, 0);
            ctx.lineTo(w.x, canvas.height);
            ctx.stroke();
        }

        ctx.restore();
    }

    /* ------------------------------------------------------------
       BOSS 4 : HÉLIOS (soleil blindé, panneaux solaires)
    ------------------------------------------------------------ */

    function drawBossHelios() {

        const b = boss;
        const now = performance.now();
        const t = now * 0.004;
        const shieldUp = b.shield > 0;

        ctx.save();
        ctx.translate(b.x, b.y);

        if (b.dying) {
            ctx.translate((Math.random() - 0.5) * 6, (Math.random() - 0.5) * 6);
        }

        /* réacteurs */

        const flame = 24 + Math.sin(t * 6) * 6;

        ctx.save();
        ctx.shadowBlur = 20;
        ctx.shadowColor = '#ffb347';

        for (const ex of [-100, -44, 44, 100]) {

            const fg = ctx.createLinearGradient(0, -52, 0, -52 - flame);

            fg.addColorStop(0, '#ffffff');
            fg.addColorStop(0.4, '#ffd27a');
            fg.addColorStop(1, 'rgba(255,120,30,0)');

            ctx.fillStyle = fg;
            ctx.beginPath();
            ctx.moveTo(ex - 12, -52);
            ctx.lineTo(ex, -52 - flame);
            ctx.lineTo(ex + 12, -52);
            ctx.closePath();
            ctx.fill();
        }

        ctx.restore();

        const hullPath = () => {
            shipPoly([0, 88, -42, 70, -110, 54, -170, 30, -176, -6, -140, -34, -80, -46,
                0, -54, 80, -46, 140, -34, 176, -6, 170, 30, 110, 54, 42, 70]);
        };

        /* panneaux solaires */

        for (const sgn of [-1, 1]) {

            ctx.save();
            ctx.scale(sgn, 1);

            shipPoly([56, -40, 176, -6, 168, 34, 104, 52, 56, 34]);

            const pg = ctx.createLinearGradient(56, 0, 176, 0);
            pg.addColorStop(0, '#3a2a0c');
            pg.addColorStop(0.5, '#a87a1c');
            pg.addColorStop(1, '#3a2a0c');

            ctx.fillStyle = pg;
            ctx.fill();

            ctx.save();
            ctx.clip();
            ctx.strokeStyle = 'rgba(255,230,150,.35)';
            ctx.lineWidth = 1;
            ctx.beginPath();

            for (let x = 70; x < 180; x += 18) {
                ctx.moveTo(x, -50);
                ctx.lineTo(x, 60);
            }

            for (let y = -40; y < 60; y += 16) {
                ctx.moveTo(50, y);
                ctx.lineTo(180, y);
            }

            ctx.stroke();
            ctx.restore();

            ctx.shadowBlur = 10;
            ctx.shadowColor = '#ffd23f';
            ctx.strokeStyle = '#ffd23f';
            ctx.lineWidth = 2.5;
            shipPoly([56, -40, 176, -6, 168, 34, 104, 52, 56, 34]);
            ctx.stroke();

            ctx.restore();
        }

        /* disque central + rayons tournants */

        ctx.save();
        ctx.translate(0, 14);

        const rage = b.phase === 3 || !shieldUp;
        const rayCol = rage ? '255,120,60' : '255,210,100';

        ctx.save();
        ctx.shadowBlur = 16;
        ctx.shadowColor = 'rgb(' + rayCol + ')';
        ctx.fillStyle = 'rgba(' + rayCol + ',.9)';

        for (let k = 0; k < 12; k++) {
            const a = t * (rage ? 1.1 : 0.6) + k * Math.PI / 6;
            ctx.save();
            ctx.rotate(a);
            ctx.beginPath();
            ctx.moveTo(60, -7);
            ctx.lineTo(82, 0);
            ctx.lineTo(60, 7);
            ctx.closePath();
            ctx.fill();
            ctx.restore();
        }

        ctx.restore();

        const dg = ctx.createRadialGradient(0, 0, 8, 0, 0, 62);
        dg.addColorStop(0, '#fff7d6');
        dg.addColorStop(0.35, rage ? '#ff9a4a' : '#ffd86a');
        dg.addColorStop(0.8, '#6a4210');
        dg.addColorStop(1, '#2a1a06');

        ctx.fillStyle = dg;
        ctx.strokeStyle = '#ffe6a0';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(0, 0, 60, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();

        /* œil */

        const pulse = 0.7 + Math.sin(now * 0.008) * 0.3;

        ctx.shadowBlur = 24 * pulse;
        ctx.shadowColor = rage ? '#ff5b3b' : '#ffffff';
        ctx.fillStyle = rage ? '#fff0d0' : '#ffffff';
        ctx.beginPath();
        ctx.arc(0, 0, 16, 0, Math.PI * 2);
        ctx.fill();

        ctx.shadowBlur = 0;
        ctx.fillStyle = rage ? '#7a1a0a' : '#4a3208';
        ctx.beginPath();
        ctx.ellipse(0, 0, 4, 11, 0, 0, Math.PI * 2);
        ctx.fill();

        ctx.restore();

        /* canons */

        ctx.fillStyle = '#d9c9a0';
        ctx.strokeStyle = '#3a2a0c';
        ctx.lineWidth = 1.5;

        for (const cx of [-118, 118]) {
            ctx.fillRect(cx - 8, 30, 16, 26);
            ctx.strokeRect(cx - 8, 30, 16, 26);
        }

        ctx.fillRect(-7, 62, 14, 22);
        ctx.strokeRect(-7, 62, 14, 22);

        if (b.attack) {

            ctx.save();
            ctx.shadowBlur = 16;
            ctx.shadowColor = '#ffd23f';
            ctx.fillStyle = '#fff3c4';
            ctx.beginPath();
            ctx.arc(-118, 57, 5, 0, Math.PI * 2);
            ctx.arc(118, 57, 5, 0, Math.PI * 2);
            ctx.arc(0, 84, 5, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
        }

        /* dégâts */

        const hf = b.hull / b.maxHull;

        if (!shieldUp && hf < 0.75) {

            ctx.save();
            ctx.strokeStyle = 'rgba(0,0,0,.7)';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(-120, -20); ctx.lineTo(-104, 0); ctx.lineTo(-124, 14); ctx.lineTo(-108, 36);

            if (hf < 0.5) {
                ctx.moveTo(124, -22); ctx.lineTo(112, -2); ctx.lineTo(130, 14); ctx.lineTo(114, 34);
                ctx.moveTo(-30, -40); ctx.lineTo(-18, -22); ctx.lineTo(-34, -8);
            }

            ctx.stroke();
            ctx.restore();
        }

        if (b.hitFlash > 0) {

            hullPath();
            ctx.fillStyle = 'rgba(255,255,255,' + Math.min(0.6, b.hitFlash * 6) + ')';
            ctx.fill();
        }

        if (b.shield > 0) drawBossShield(b, now);

        ctx.restore();
    }


        /* ============================================================
       v2.9 — STATISTIQUES, TABLEAU DES SCORES, NIVEAU 5
       Ennemis : HARPIE (plongeur à tête chercheuse),
                 RELAIS (réduit de moitié les dégâts des alliés proches)
       Boss    : OMÉGA (toutes les attaques + vortex gravitationnel)
    ============================================================ */

    BOSS_DEFS.push({
        name: 'OMÉGA',
        sub: 'Le dernier verrou : rayons, météores, vortex… et une escorte',
        color: '#ff4d6d',
        hp: 1.8,
        dmg: 1.0,
        delayMul: 1.15,
        bulletMul: 1.0,
        supplyEvery: 15,
        regen: 0.05,
        speeds: [0, 60, 85, 110],
        shield: [255, 70, 100],
        spark: '255,110,130',
        bar: '#ff3b5c',
        beam: '255,60,90',
        secondShield: 0.55,
        patterns: {
            1: ['cannons', 'fan', 'sweep', 'meteors'],
            2: ['sweep', 'meteors', 'missiles', 'spiral', 'summon', 'vortex', 'wall'],
            3: ['sweep', 'meteors', 'laser', 'nova', 'spiral', 'summon', 'mines', 'vortex', 'rain']
        }
    });

    /* ------------------------------------------------------------
       STATISTIQUES
    ------------------------------------------------------------ */

    function newStats() {
        return { shots: 0, hits: 0, dmgDealt: 0, dmgTaken: 0, kills: 0, shotDown: 0, time: 0 };
    }

    function trackDamage() {
        if (hull < statHull) stats.dmgTaken += statHull - hull;
        statHull = hull;
    }

    function saveBest() {
        if (score > bestScore) {
            bestScore = score;
            recordBeaten = true;
            try { localStorage.setItem('sonicStrikerBest', String(bestScore)); } catch (e) { /* ignoré */ }
        }
    }

    function finishLevelStats() {
        levelStats.push({
            title: 'Niv. ' + level,
            boss: lastBossName,
            s: Object.assign({}, stats),
            gained: score - levelStartScore
        });
        saveBest();
    }

    const sumStats = list => {
        const t = newStats();
        let gained = 0;
        for (const c of list) {
            for (const k of Object.keys(t)) t[k] += c.s[k];
            gained += c.gained;
        }
        return { title: 'TOTAL', s: t, gained };
    };

    const fmtTime = sec => {
        const s = Math.round(sec);
        return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
    };

    const STAT_ROWS = [
        ['Tirs effectués', c => c.s.shots],
        ['Tirs au but', c => c.s.hits + (c.s.shots ? '  (' + Math.round(100 * c.s.hits / c.s.shots) + '%)' : '')],
        ['Dégâts infligés', c => c.s.dmgDealt],
        ['Dégâts subis', c => c.s.dmgTaken],
        ['Vaisseaux détruits', c => c.s.kills],
        ['Tirs ennemis abattus', c => c.s.shotDown],
        ['Temps', c => fmtTime(c.s.time)],
        ['Score gagné', c => c.gained.toLocaleString()]
    ];

    function statColumns() {

        const cols = levelStats.slice();

        if (hull <= 0 && !victory) {
            cols.push({ title: 'Niv. ' + level + ' ✗', s: Object.assign({}, stats), gained: score - levelStartScore });
        }

        return cols;
    }

    function drawStatsTable(x, y, w) {

        const all = statColumns();
        const cols = all.slice(-5);

        if (all.length > 1) cols.push(sumStats(all));

        const labelW = 190;
        const colW = Math.min(112, (w - labelW) / Math.max(1, cols.length));
        const rowH = 24;

        ctx.save();

        ctx.fillStyle = 'rgba(8,20,36,.88)';
        ctx.strokeStyle = 'rgba(69,223,255,.55)';
        ctx.lineWidth = 1.5;
        ctx.fillRect(x - 14, y - 6, w + 28, rowH * (STAT_ROWS.length + 1) + 12);
        ctx.strokeRect(x - 14, y - 6, w + 28, rowH * (STAT_ROWS.length + 1) + 12);

        ctx.font = 'bold 14px Arial';
        ctx.textAlign = 'right';

        cols.forEach((c, i) => {
            const isTotal = c.title === 'TOTAL';
            ctx.fillStyle = isTotal ? '#ffd23f' : '#45dfff';
            ctx.fillText(c.title, x + labelW + colW * (i + 1) - 8, y + 14);
        });

        STAT_ROWS.forEach(([label, fn], r) => {

            const ry = y + rowH * (r + 1) + 14;

            if (r % 2 === 0) {
                ctx.fillStyle = 'rgba(255,255,255,.05)';
                ctx.fillRect(x - 10, ry - 17, w + 20, rowH);
            }

            ctx.font = '14px Arial';
            ctx.textAlign = 'left';
            ctx.fillStyle = '#9ec5d8';
            ctx.fillText(label, x, ry);

            ctx.textAlign = 'right';

            cols.forEach((c, i) => {
                const isTotal = c.title === 'TOTAL';
                ctx.font = (isTotal ? 'bold ' : '') + '14px Arial';
                ctx.fillStyle = isTotal ? '#ffe08a' : '#d7f5ff';
                ctx.fillText(String(fn(c)), x + labelW + colW * (i + 1) - 8, ry);
            });
        });

        ctx.restore();
    }

    /* ------------------------------------------------------------
       ÉCRANS DE FIN : victoire de niveau, victoire finale, game over
    ------------------------------------------------------------ */

    function endMode() {
        if (victory) return level === 5 && !endless ? 'final' : 'win';
        if (hull <= 0 && gameStarted) return 'over';
        return null;
    }

    function endButtons() {

        const m = endMode();
        const w = canvas.width;
        const by = 376, bh = 46;

        if (m === 'win') return [{ id: 'next', label: '▶ NIVEAU ' + (level + 1), x: w / 2 - 130, y: by, w: 260, h: bh }];
        if (m === 'over') return [{ id: 'again', label: '🔄 RECOMMENCER', x: w / 2 - 110, y: by, w: 220, h: bh }];
        if (m === 'final') return [
            { id: 'endless', label: '♾ MODE SANS FIN', x: w / 2 - 280, y: by, w: 260, h: bh },
            { id: 'again', label: '↺ REJOUER', x: w / 2 + 20, y: by, w: 260, h: bh }
        ];

        return [];
    }

    function endButtonAt(px, py) {

        for (const b of endButtons()) {
            if (px >= b.x && px <= b.x + b.w && py >= b.y && py <= b.y + b.h) return b.id;
        }

        return null;
    }

    function drawEndScreen(title, titleColor, subtitle) {

        const w = canvas.width;

        saveBest();

        ctx.save();
        ctx.fillStyle = 'rgba(0,0,0,.74)';
        ctx.fillRect(0, 0, w, canvas.height);

        ctx.textAlign = 'center';
        ctx.shadowBlur = 22;
        ctx.shadowColor = titleColor;
        ctx.fillStyle = titleColor;
        ctx.font = 'bold 36px Arial';
        ctx.fillText(title, w / 2, 46);

        ctx.shadowBlur = 0;
        ctx.font = '16px Arial';
        ctx.fillStyle = '#d7f5ff';
        ctx.fillText(subtitle, w / 2, 72);

        drawStatsTable(40, 90, w - 80);

        ctx.font = '16px Arial';
        ctx.fillStyle = '#9ec5d8';
        ctx.fillText('Score : ' + score.toLocaleString() + '   •   Record : ' + bestScore.toLocaleString() +
            (recordBeaten ? '   ★ NOUVEAU RECORD ★' : ''), w / 2, 358);

        for (const b of endButtons()) {
            ctx.fillStyle = '#123d61';
            ctx.strokeStyle = '#45dfff';
            ctx.lineWidth = 2;
            ctx.fillRect(b.x, b.y, b.w, b.h);
            ctx.strokeRect(b.x, b.y, b.w, b.h);
            ctx.fillStyle = '#d7f5ff';
            ctx.font = 'bold 18px Arial';
            ctx.fillText(b.label, b.x + b.w / 2, b.y + 30);
        }

        ctx.restore();
    }

    function drawVictory() {

        if (endMode() === 'final') {
            drawEndScreen('VICTOIRE FINALE', '#ffd23f', 'OMÉGA est détruit — la galaxie est sauvée !');
        } else {
            drawEndScreen('NIVEAU ' + level + ' TERMINÉ', '#ffe08a', 'Boss détruit : ' + lastBossName);
        }
    }

    function drawGameOver() {
        drawEndScreen('GAME OVER', '#ff5365', 'Tu es tombé au niveau ' + level);
    }

    /* ------------------------------------------------------------
       NIVEAU 5 : ennemis
    ------------------------------------------------------------ */

    function pickLevel5() {

        const tt = levelTimer + (level - 5) * 30;

        const table = [
            [enemyTypes[0], 0, 1, false],
            [enemyTypes[1], 0, 1, false],
            [enemyTypes[5], 0, 1, false],
            [enemyTypes[13], 6, 2, true],     // harpie
            [enemyTypes[9], 12, 1, false],    // faucheur
            [enemyTypes[10], 18, 1, false],   // bastion
            [enemyTypes[14], 24, 2, true],    // relais
            [enemyTypes[11], 30, 1, false],   // orbiteur
            [enemyTypes[12], 36, 1, false],   // spectre
            [enemyTypes[6], 40, 1, false],    // missilier
            [enemyTypes[7], 44, 1, false],    // mineur
            [enemyTypes[8], 48, 1, false],    // sniper
            [enemyTypes[3], 52, 1, false],    // intercepteur
            [enemyTypes[2], 58, 1, false]     // croiseur
        ];

        const pool = [];

        for (const [t, at, w, fresh] of table) {

            if (tt < at) continue;

            if (fresh && !levelSpawned[t.type]) {
                levelSpawned[t.type] = true;
                return t;
            }

            for (let k = 0; k < w; k++) pool.push(t);
        }

        return pool[Math.floor(Math.random() * pool.length)];
    }

    /* Un relais vivant à moins de 230 px protège ses alliés (un tir sur deux est absorbé) */

    function relayCovers(e) {

        if (e.type.type === 'relay') return false;

        for (const r of enemies) {
            if (r !== e && r.type.type === 'relay' && Math.hypot(r.x - e.x, r.y - e.y) < 230) return true;
        }

        return false;
    }

    function drawHarpy(e) {

        const now = performance.now();
        const pulse = 0.6 + 0.4 * Math.sin(now * 0.02 + e.phase);

        ctx.save();
        ctx.translate(e.x, e.y);

        shipPoly([0, 28, 9, 6, 28, -16, 11, -8, 0, -20, -11, -8, -28, -16, -9, 6]);

        const g = ctx.createLinearGradient(-28, 0, 28, 0);
        g.addColorStop(0, '#2a1033');
        g.addColorStop(0.5, '#7a2a8c');
        g.addColorStop(1, '#2a1033');

        ctx.fillStyle = g;
        ctx.strokeStyle = '#ff4fd8';
        ctx.lineWidth = 2;
        ctx.shadowBlur = 10;
        ctx.shadowColor = '#ff4fd8';
        ctx.fill();
        ctx.stroke();

        ctx.shadowBlur = 14 * pulse;
        ctx.fillStyle = '#ffd0f6';
        ctx.beginPath();
        ctx.ellipse(0, 6, 4, 8, 0, 0, Math.PI * 2);
        ctx.fill();

        ctx.restore();
    }

    function drawRelay(e) {

        const now = performance.now();
        const pulse = 0.5 + 0.5 * Math.sin(now * 0.006 + e.phase);

        /* liens vers les alliés protégés */

        ctx.save();
        ctx.setLineDash([5, 6]);
        ctx.lineWidth = 1.5;
        ctx.strokeStyle = 'rgba(120,235,255,' + (0.25 + pulse * 0.3) + ')';

        for (const o of enemies) {
            if (o === e || o.type.type === 'relay') continue;
            if (Math.hypot(o.x - e.x, o.y - e.y) < 230) {
                ctx.beginPath();
                ctx.moveTo(e.x, e.y);
                ctx.lineTo(o.x, o.y);
                ctx.stroke();
            }
        }

        ctx.restore();

        ctx.save();
        ctx.translate(e.x, e.y);

        /* halo de protection */

        ctx.strokeStyle = 'rgba(120,235,255,' + (0.12 + pulse * 0.12) + ')';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(0, 0, 230, 0, Math.PI * 2);
        ctx.stroke();

        shipPoly([0, 30, 22, 14, 28, -10, 14, -26, -14, -26, -28, -10, -22, 14]);

        const g = ctx.createLinearGradient(-28, 0, 28, 0);
        g.addColorStop(0, '#0e2a3a');
        g.addColorStop(0.5, '#2f7f9c');
        g.addColorStop(1, '#0e2a3a');

        ctx.fillStyle = g;
        ctx.strokeStyle = '#7de8ff';
        ctx.lineWidth = 2;
        ctx.shadowBlur = 12;
        ctx.shadowColor = '#7de8ff';
        ctx.fill();
        ctx.stroke();

        /* antenne */

        ctx.beginPath();
        ctx.moveTo(0, -26);
        ctx.lineTo(0, -40);
        ctx.stroke();
        ctx.fillStyle = '#e6fbff';
        ctx.shadowBlur = 16 * pulse + 4;
        ctx.beginPath();
        ctx.arc(0, -42, 4, 0, Math.PI * 2);
        ctx.fill();

        ctx.beginPath();
        ctx.arc(0, 2, 8, 0, Math.PI * 2);
        ctx.fill();

        ctx.restore();
    }

    /* ------------------------------------------------------------
       BOSS OMÉGA
    ------------------------------------------------------------ */

    function drawBossOmega() {

        const b = boss;
        const now = performance.now();
        const t = now * 0.004;
        const shieldUp = b.shield > 0;
        const rage = b.phase === 3 || !shieldUp;

        ctx.save();
        ctx.translate(b.x, b.y);

        if (b.dying) ctx.translate((Math.random() - 0.5) * 6, (Math.random() - 0.5) * 6);

        /* réacteurs */

        const flame = 26 + Math.sin(t * 6) * 7;

        ctx.save();
        ctx.shadowBlur = 20;
        ctx.shadowColor = '#ff3b5c';

        for (const ex of [-120, -60, 0, 60, 120]) {

            const fg = ctx.createLinearGradient(0, -52, 0, -52 - flame);
            fg.addColorStop(0, '#ffffff');
            fg.addColorStop(0.4, '#ff7a90');
            fg.addColorStop(1, 'rgba(255,40,80,0)');

            ctx.fillStyle = fg;
            ctx.beginPath();
            ctx.moveTo(ex - 11, -54);
            ctx.lineTo(ex, -54 - flame);
            ctx.lineTo(ex + 11, -54);
            ctx.closePath();
            ctx.fill();
        }

        ctx.restore();

        const hullPts = [0, 92, -36, 76, -100, 64, -168, 36, -178, -4, -150, -38, -90, -52, -40, -58,
            0, -50, 40, -58, 90, -52, 150, -38, 178, -4, 168, 36, 100, 64, 36, 76];

        const hullPath = () => shipPoly(hullPts);

        hullPath();

        const hg = ctx.createLinearGradient(-178, 0, 178, 0);
        hg.addColorStop(0, '#12121c');
        hg.addColorStop(0.5, '#3a3a52');
        hg.addColorStop(1, '#12121c');

        ctx.fillStyle = hg;
        ctx.fill();
        ctx.shadowBlur = 12;
        ctx.shadowColor = '#ff3b5c';
        ctx.strokeStyle = '#ff4d6d';
        ctx.lineWidth = 3;
        ctx.stroke();
        ctx.shadowBlur = 0;

        /* nervures */

        ctx.save();
        ctx.clip();
        ctx.strokeStyle = 'rgba(255,90,120,.35)';
        ctx.lineWidth = 1.5;
        ctx.beginPath();

        for (let x = -160; x <= 160; x += 32) {
            ctx.moveTo(x, -56);
            ctx.lineTo(x * 0.6, 80);
        }

        ctx.stroke();
        ctx.restore();

        /* anneau Ω */

        ctx.save();
        ctx.translate(0, 14);

        ctx.shadowBlur = 18;
        ctx.shadowColor = rage ? '#ff3b5c' : '#ff9ab0';
        ctx.strokeStyle = rage ? '#ff4d6d' : '#ffd0da';
        ctx.lineWidth = 7;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.arc(0, 0, 46, Math.PI / 2 + 0.6, Math.PI / 2 - 0.6 + Math.PI * 2);
        ctx.stroke();

        ctx.beginPath();
        ctx.moveTo(-34, 36);
        ctx.lineTo(-58, 36);
        ctx.moveTo(34, 36);
        ctx.lineTo(58, 36);
        ctx.stroke();

        /* étincelles orbitales */

        ctx.fillStyle = '#ffffff';

        for (let k = 0; k < 3; k++) {
            const a = t * (rage ? 2.2 : 1.2) + k * Math.PI * 2 / 3;
            ctx.beginPath();
            ctx.arc(Math.cos(a) * 46, Math.sin(a) * 46, 3.5, 0, Math.PI * 2);
            ctx.fill();
        }

        /* œil */

        const pulse = 0.7 + Math.sin(now * 0.008) * 0.3;

        ctx.shadowBlur = 26 * pulse;
        ctx.shadowColor = '#ff2a55';
        ctx.fillStyle = rage ? '#ffe0e6' : '#ffffff';
        ctx.beginPath();
        ctx.arc(0, 0, 17, 0, Math.PI * 2);
        ctx.fill();

        ctx.shadowBlur = 0;
        ctx.fillStyle = rage ? '#8a0a24' : '#4a0f1c';
        ctx.beginPath();
        ctx.ellipse(0, 0, 4, 12, 0, 0, Math.PI * 2);
        ctx.fill();

        ctx.restore();

        /* canons */

        ctx.fillStyle = '#b8b8cc';
        ctx.strokeStyle = '#1a1a26';
        ctx.lineWidth = 1.5;

        for (const cx of [-118, 118]) {
            ctx.fillRect(cx - 8, 30, 16, 26);
            ctx.strokeRect(cx - 8, 30, 16, 26);
        }

        ctx.fillRect(-7, 62, 14, 22);
        ctx.strokeRect(-7, 62, 14, 22);

        if (b.attack) {

            ctx.save();
            ctx.shadowBlur = 16;
            ctx.shadowColor = '#ff3b5c';
            ctx.fillStyle = '#ffe0e6';
            ctx.beginPath();
            ctx.arc(-118, 57, 5, 0, Math.PI * 2);
            ctx.arc(118, 57, 5, 0, Math.PI * 2);
            ctx.arc(0, 84, 5, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();

            /* vortex : spirale qui aspire */

            if (b.attack.type === 'vortex') {

                ctx.save();
                ctx.translate(0, BOSS_CY);
                ctx.strokeStyle = 'rgba(255,90,130,.55)';
                ctx.lineWidth = 2;

                for (let k = 0; k < 3; k++) {
                    ctx.beginPath();
                    for (let s = 0; s <= 40; s++) {
                        const r = 20 + s * 6;
                        const a = -t * 3 + s * 0.28 + k * Math.PI * 2 / 3;
                        const px = Math.cos(a) * r, py = Math.sin(a) * r * 0.55;
                        if (s === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
                    }
                    ctx.stroke();
                }

                ctx.restore();
            }
        }

        /* dégâts */

        const hf = b.hull / b.maxHull;

        if (!shieldUp && hf < 0.75) {

            ctx.save();
            ctx.strokeStyle = 'rgba(0,0,0,.8)';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(-130, -26); ctx.lineTo(-110, -2); ctx.lineTo(-132, 16); ctx.lineTo(-114, 40);

            if (hf < 0.5) {
                ctx.moveTo(130, -28); ctx.lineTo(116, -4); ctx.lineTo(136, 14); ctx.lineTo(118, 38);
                ctx.moveTo(-30, -48); ctx.lineTo(-18, -28); ctx.lineTo(-36, -12);
            }

            ctx.stroke();
            ctx.restore();
        }

        if (b.hitFlash > 0) {
            hullPath();
            ctx.fillStyle = 'rgba(255,255,255,' + Math.min(0.6, b.hitFlash * 6) + ')';
            ctx.fill();
        }

        if (b.shield > 0) drawBossShield(b, now);

        ctx.restore();
    }


        /* ============================================================
       v3.0 — DÉCORS PAR NIVEAU (5 secteurs qui se répètent)
    ============================================================ */

    const STAGES = [
        { name: 'Espace profond', short: 'ESPACE PROFOND', base: '#030b15', star: '160,220,255' },
        { name: "Ceinture d'astéroïdes", short: 'ASTÉROÏDES', base: '#0c0807', star: '255,225,200' },
        { name: 'Géante gazeuse', short: 'GÉANTE GAZEUSE', base: '#03111a', star: '190,240,255' },
        { name: 'Cœur stellaire', short: 'CŒUR STELLAIRE', base: '#120602', star: '255,215,160' },
        { name: 'Horizon du trou noir', short: 'TROU NOIR', base: '#08020e', star: '230,190,255' }
    ];

    let bgStage = -1;
    let bgObjs = [];

    function stageIndex() { return (level - 1) % STAGES.length; }
    function stageTheme() { return STAGES[stageIndex()]; }

    function initBackdrop() {

        bgObjs = [];

        const s = stageIndex();
        const W = canvas.width;
        const H = canvas.height;

        if (s === 1) {
            for (let i = 0; i < 18; i++) {
                const r = 10 + Math.random() * 34;
                const pts = [];
                const n = 7 + Math.floor(Math.random() * 4);
                for (let k = 0; k < n; k++) {
                    const a = k / n * Math.PI * 2;
                    const rr = r * (0.72 + Math.random() * 0.45);
                    pts.push(Math.cos(a) * rr, Math.sin(a) * rr);
                }
                bgObjs.push({ x: Math.random() * W, y0: Math.random() * (H + 120), r, pts,
                    v: 10 + r * 0.9, rot0: Math.random() * 6.28, vr: (Math.random() - 0.5) * 0.6 });
            }
        }

        if (s === 3) {
            for (let i = 0; i < 55; i++) {
                bgObjs.push({ x: Math.random() * W, y0: Math.random() * H, v: 14 + Math.random() * 40,
                    size: 1 + Math.random() * 2.2, ph: Math.random() * 6.28 });
            }
        }

        if (s === 4) {
            for (let i = 0; i < 110; i++) {
                bgObjs.push({ a0: Math.random() * 6.28, r: 70 + Math.random() * 170,
                    size: 0.8 + Math.random() * 1.6, hue: Math.random() });
            }
        }
    }

    function bgBlob(x, y, r, rgb, alpha) {
        const g = ctx.createRadialGradient(x, y, 0, x, y, r);
        g.addColorStop(0, 'rgba(' + rgb + ',' + alpha + ')');
        g.addColorStop(1, 'rgba(' + rgb + ',0)');
        ctx.fillStyle = g;
        ctx.fillRect(x - r, y - r, r * 2, r * 2);
    }

    function drawBackdrop() {

        const s = stageIndex();

        if (bgStage !== s) {
            bgStage = s;
            initBackdrop();
        }

        const W = canvas.width;
        const H = canvas.height;
        const t = performance.now() / 1000;

        ctx.fillStyle = STAGES[s].base;
        ctx.fillRect(0, 0, W, H);

        ctx.save();

        if (s === 0) {

            const span = H + 500;

            [[140, '40,90,200', 0.22, 330, 7], [720, '110,50,170', 0.2, 390, 5], [430, '30,150,170', 0.14, 300, 9]]
                .forEach(([x, rgb, a, r, v], i) => {
                    const y = ((i * 220 + t * v) % span) - 250;
                    bgBlob(x + Math.sin(t * 0.05 + i) * 30, y, r, rgb, a);
                });
        }

        if (s === 1) {

            bgBlob(220, 120, 420, '150,70,40', 0.16);
            bgBlob(700, 360, 380, '120,60,50', 0.14);

            for (const o of bgObjs) {

                const y = (o.y0 + o.v * t) % (H + 2 * o.r + 40) - o.r - 20;

                ctx.save();
                ctx.translate(o.x, y);
                ctx.rotate(o.rot0 + o.vr * t);
                ctx.globalAlpha = 0.5;

                ctx.beginPath();
                ctx.moveTo(o.pts[0], o.pts[1]);
                for (let k = 2; k < o.pts.length; k += 2) ctx.lineTo(o.pts[k], o.pts[k + 1]);
                ctx.closePath();

                const g = ctx.createLinearGradient(-o.r, -o.r, o.r, o.r);
                g.addColorStop(0, '#5a4235');
                g.addColorStop(1, '#1c120d');
                ctx.fillStyle = g;
                ctx.strokeStyle = '#7a5a46';
                ctx.lineWidth = 1.5;
                ctx.fill();
                ctx.stroke();

                ctx.restore();
            }
        }

        if (s === 2) {

            const cx = 690, cy = 150 + Math.sin(t * 0.05) * 6, R = 170;

            bgBlob(cx, cy, 380, '40,160,190', 0.16);

            const ring = (a0, a1) => {
                ctx.save();
                ctx.translate(cx, cy);
                ctx.rotate(-0.38);
                for (const [rx, w, al] of [[255, 16, 0.3], [285, 8, 0.22], [310, 22, 0.16]]) {
                    ctx.strokeStyle = 'rgba(150,225,235,' + al + ')';
                    ctx.lineWidth = w;
                    ctx.beginPath();
                    ctx.ellipse(0, 0, rx, rx * 0.22, 0, a0, a1);
                    ctx.stroke();
                }
                ctx.restore();
            };

            ring(Math.PI, Math.PI * 2);

            ctx.save();
            ctx.beginPath();
            ctx.arc(cx, cy, R, 0, Math.PI * 2);
            ctx.clip();

            const pg = ctx.createLinearGradient(cx, cy - R, cx, cy + R);
            pg.addColorStop(0, '#2c6f86');
            pg.addColorStop(0.5, '#1d4a62');
            pg.addColorStop(1, '#0a2234');
            ctx.fillStyle = pg;
            ctx.fillRect(cx - R, cy - R, R * 2, R * 2);

            for (let k = 0; k < 9; k++) {
                const by = cy - R + (k + 0.5) * (R * 2 / 9) + Math.sin(t * 0.3 + k) * 4;
                ctx.fillStyle = 'rgba(' + (k % 2 ? '120,210,225' : '20,60,80') + ',0.22)';
                ctx.fillRect(cx - R, by - 9, R * 2, 14 + (k % 3) * 4);
            }

            const sh = ctx.createRadialGradient(cx - R * 0.45, cy - R * 0.4, R * 0.1, cx, cy, R * 1.05);
            sh.addColorStop(0, 'rgba(255,255,255,0.12)');
            sh.addColorStop(0.6, 'rgba(0,0,0,0.1)');
            sh.addColorStop(1, 'rgba(0,0,0,0.65)');
            ctx.fillStyle = sh;
            ctx.fillRect(cx - R, cy - R, R * 2, R * 2);

            ctx.restore();

            ring(0, Math.PI);

            /* petite lune */

            const ma = t * 0.05;
            const mx = 150 + Math.cos(ma) * 20, my = 330;
            ctx.fillStyle = '#51606a';
            ctx.beginPath();
            ctx.arc(mx, my, 22, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = 'rgba(0,0,0,.35)';
            ctx.beginPath();
            ctx.arc(mx + 7, my + 4, 18, 0, Math.PI * 2);
            ctx.fill();
        }

        if (s === 3) {

            const cx = 150, cy = -30, R = 190;

            bgBlob(cx, cy, 620, '255,110,30', 0.2);
            bgBlob(cx, cy, 340, '255,170,60', 0.28);

            ctx.save();
            ctx.translate(cx, cy);

            ctx.strokeStyle = 'rgba(255,200,110,0.25)';
            ctx.lineWidth = 6;

            for (let k = 0; k < 7; k++) {
                const a = t * 0.12 + k * 0.9;
                ctx.beginPath();
                ctx.arc(0, 0, R + 24 + Math.sin(t * 0.8 + k) * 14, a, a + 0.5);
                ctx.stroke();
            }

            const sg = ctx.createRadialGradient(0, 0, 10, 0, 0, R);
            sg.addColorStop(0, '#fff7d6');
            sg.addColorStop(0.55, '#ffc255');
            sg.addColorStop(1, '#e0521a');
            ctx.fillStyle = sg;
            ctx.beginPath();
            ctx.arc(0, 0, R, 0, Math.PI * 2);
            ctx.fill();

            ctx.restore();

            for (const o of bgObjs) {
                const y = H - ((o.y0 + o.v * t) % (H + 20));
                const x = o.x + Math.sin(t + o.ph) * 14;
                ctx.fillStyle = 'rgba(255,' + (140 + Math.floor(o.size * 30)) + ',60,' + (0.25 + 0.2 * Math.sin(t * 3 + o.ph)) + ')';
                ctx.fillRect(x, y, o.size, o.size);
            }
        }

        if (s === 4) {

            const cx = 690, cy = 170;

            bgBlob(cx, cy, 340, '170,40,120', 0.2);

            ctx.save();
            ctx.translate(cx, cy);
            ctx.rotate(-0.25);

            for (const [rx, w, col] of [[230, 26, '120,30,90'], [180, 22, '220,70,70'], [135, 16, '255,160,70'], [100, 10, '255,230,170']]) {
                ctx.strokeStyle = 'rgba(' + col + ',0.28)';
                ctx.lineWidth = w;
                ctx.beginPath();
                ctx.ellipse(0, 0, rx, rx * 0.3, 0, 0, Math.PI * 2);
                ctx.stroke();
            }

            for (const o of bgObjs) {
                const a = o.a0 + t * (28 / (o.r + 20));
                ctx.fillStyle = o.hue < 0.5 ? 'rgba(255,170,110,0.65)' : 'rgba(255,110,170,0.55)';
                ctx.fillRect(Math.cos(a) * o.r, Math.sin(a) * o.r * 0.3, o.size, o.size);
            }

            ctx.restore();

            /* lentille gravitationnelle + horizon */

            ctx.strokeStyle = 'rgba(255,200,230,' + (0.35 + 0.1 * Math.sin(t * 2)) + ')';
            ctx.lineWidth = 3;
            ctx.beginPath();
            ctx.arc(cx, cy, 50, 0, Math.PI * 2);
            ctx.stroke();

            ctx.fillStyle = '#000';
            ctx.beginPath();
            ctx.arc(cx, cy, 46, 0, Math.PI * 2);
            ctx.fill();
        }

        ctx.restore();
    }


    function update(dt) {

        if (
            !gameStarted ||
            paused
        ) return;
/* INVINCIBILITÉ APRÈS IMPACT */

if (invincibilityTimer > 0) {
    invincibilityTimer -= dt;

    if (invincibilityTimer < 0) {
        invincibilityTimer = 0;
    }
}

/* FLASH DE DÉGÂTS */

if (damageFlash > 0) {
    damageFlash -= dt;

    if (damageFlash < 0) {
        damageFlash = 0;
    }
}
        /* BOUCLIER */

        if (shieldTimer > 0) {

            shieldTimer -= dt;

            if (shieldTimer < 0) {

                shieldTimer = 0;
            }
        }

        /* CADENCE */

        fireCooldown -= dt;

        if (fireCooldown < 0) {

            fireCooldown = 0;
        }

        difficultyTimer += dt;

        if (mouseHeld || keys[keyBinds.fire]) { shoot(); }

        updateTrails(dt);

        /* JOUEUR */

        const currentSpeed = CONFIG.playerSpeed * shipSpeedMul() * (
                1 +
                (speedLevel - 1) * 0.15
            );

        let dirX = 0;
        let dirY = 0;

        if (keys[keyBinds.left]) dirX -= 1;
        if (keys[keyBinds.right]) dirX += 1;
        if (keys[keyBinds.up]) dirY -= 1;
        if (keys[keyBinds.down]) dirY += 1;

        if (dirX !== 0 && dirY !== 0) {
            dirX *= 0.7071;
            dirY *= 0.7071;
        }

        player.x += dirX * currentSpeed * dt;
        player.y += dirY * currentSpeed * 0.9 * dt;

        player.x = clamp(player.x, 35, canvas.width - 35);
        player.y = clamp(player.y, playerMinY(), playerMaxY());

        pushPlayerOutOfBoss();

        /* ÉTOILES */

        for (const star of stars) {

            star.y +=
                star.speed * dt;

            if (star.y > canvas.height) {

                star.y = -3;

                star.x =
                    Math.random() *
                    canvas.width;
            }
        }

        /* TIRS */

        for (
            let i = bullets.length - 1;
            i >= 0;
            i--
        ) {

            const bullet =
                bullets[i];

            bullet.x +=
                bullet.vx * dt;

            bullet.y +=
                bullet.vy * dt;

            if (
                bullet.y < -30 ||
                bullet.x < -30 ||
                bullet.x > canvas.width + 30
            ) {

                bullets.splice(i, 1);
            }
        }
/* ============================================================
   DÉPLACEMENT DES TIRS ENNEMIS
============================================================ */

for (
    let i = enemyBullets.length - 1;
    i >= 0;
    i--
) {

    const bullet =
        enemyBullets[i];

    if (bullet.kind === 'missile') {

        steerMissile(bullet, dt);

        if (bullet.age > bullet.life) {
            explode(bullet.x, bullet.y, false, '255,170,80');
            enemyBullets.splice(i, 1);
            continue;
        }

    } else if (bullet.kind === 'mine') {

        bullet.fuse -= dt;

        if (bullet.fuse <= 0) {
            burstMine(bullet);
            enemyBullets.splice(i, 1);
            continue;
        }
    }


    bullet.x +=
        bullet.vx * dt;

    bullet.y +=
        bullet.vy * dt;



    /* SUPPRESSION HORS ÉCRAN */

    if (
        bullet.y > canvas.height + 40 ||
        bullet.y < -40 ||
        bullet.x < -40 ||
        bullet.x > canvas.width + 40
    ) {

        enemyBullets.splice(i, 1);
    }
}
 /* ============================================================
   COLLISIONS TIRS ENNEMIS → JOUEUR
============================================================ */

for (
    let i = enemyBullets.length - 1;
    i >= 0;
    i--
) {

    const bullet =
        enemyBullets[i];

    const hitDistance =
        20 + (bullet.size || 5);

    if (
        distance(bullet, player) <
        hitDistance
    ) {

        enemyBullets.splice(i, 1);

        /* BOUCLIER */

        if (shieldTimer > 0) {

            explode(
                bullet.x,
                bullet.y
            );

            continue;
        }

        /* DÉGÂTS */

        if (invincibilityTimer <= 0) {

            hull -= (bullet.damage || 8);
            lastDamage = bullet.damage || 8;

            damageFlash = 0.25;

            invincibilityTimer = 0.7;

            if (hull < 0) {

                hull = 0;
            }
        }

        explode(
            bullet.x,
            bullet.y
        );
    }
}
        /* SPAWN */

        /* ============================================================
   SPAWN INTELLIGENT
============================================================ */

spawnTimer += dt;


/* ------------------------------------------------------------
   NOMBRE MAXIMUM D'ENNEMIS

   La difficulté augmente avec le temps,
   mais l'écran ne sera jamais rempli.
------------------------------------------------------------ */

let maxEnemies, spawnRate;

    if (bossState === 0) {

        maxEnemies = Math.min(level >= 5 ? 10 : level >= 4 ? 9 : level >= 3 ? 8 : 7, 3 + Math.floor(levelTimer / 28) + (level - 1));

        spawnRate = Math.max(
            0.85,
            CONFIG.enemySpawnBase - levelTimer * 0.006 - (level - 1) * 0.12
        );

    } else if (bossState === 2 && boss && boss.phase >= 2 && !boss.dying) {

        /* escortes légères pendant le combat */
        maxEnemies = 2;
        spawnRate = 6.5;

    } else {

        maxEnemies = 0;
        spawnRate = 999;
    }

    if (spawnTimer >= spawnRate && enemies.length < maxEnemies) {

        spawnTimer = 0;

        spawnEnemy(bossState === 2 ? 0 : undefined);
    }

        /* ENNEMIS */

        for (
            let i = enemies.length - 1;
            i >= 0;
            i--
        ) {

            const enemy =
                enemies[i];

          enemy.phase += dt;
            /* ========================================================
   TIR DU SCOUT
======================================================== */

enemy.fireTimer -= dt;

        if (
            enemy.fireTimer <= 0 &&
            enemy.y > 20 &&
            enemy.y < canvas.height - 120 &&
            bossState !== 3
        ) {
            enemyFire(enemy);
        }


/* ========================================================
   MOUVEMENT VERTICAL COMMUN
======================================================== */

enemy.y += enemy.type.speed * (1 + (level - 1) * 0.08) * dt;


/* ========================================================
   MOUVEMENTS SPÉCIFIQUES
======================================================== */

switch (enemy.type.movement) {


    /* SCOUT — zigzag nerveux */

    case 'zigzag':

        enemy.x +=
            Math.sin(enemy.phase * 7) *
            110 *
            dt;

        break;


    /* CHASSEUR — grandes vagues */

    case 'wave':

        enemy.x +=
            Math.sin(enemy.phase * 2.3) *
            70 *
            dt;

        break;


    /* CROISEUR — dérive lente */

    case 'drift':

        enemy.x +=
            enemy.direction *
            38 *
            dt;

        /* rebond sur les côtés */

        if (
            enemy.x < 55 ||
            enemy.x > canvas.width - 55
        ) {

            enemy.direction *= -1;
        }

        break;


    /* INTERCEPTEUR — déplacements rapides */

    case 'harpy':
        if (enemy.y < 330) enemy.x += clamp((player.x - enemy.x) / 40, -1, 1) * 120 * dt;
        enemy.x = clamp(enemy.x, 30, canvas.width - 30);
        emitTrail(enemy.x, enemy.y - 24, 'smoke');
        break;

    case 'orbit':
        enemy.x = clamp(enemy.ox + Math.cos(enemy.phase * 1.4) * 95, 40, canvas.width - 40);
        break;

    case 'phase':
        enemy.x += Math.sin(enemy.phase * 2.0) * 60 * dt;
        enemy.x = clamp(enemy.x, 40, canvas.width - 40);
        break;

    case 'swarm':
        enemy.x += Math.sin(enemy.phase * 1.7) * 110 * dt;
        enemy.x = clamp(enemy.x, 25, canvas.width - 25);
        break;

    case 'hover':

        if (enemy.hoverY === undefined) {
            enemy.hoverY = enemy.type.hoverMin + Math.random() * (enemy.type.hoverMax - enemy.type.hoverMin);
        }

        if (enemy.y >= enemy.hoverY) {

            enemy.y = enemy.hoverY;
            enemy.hoverTime = (enemy.hoverTime || 0) + dt;

            enemy.x += enemy.direction * enemy.type.glide * dt;

            if (enemy.x < 60) { enemy.x = 60; enemy.direction = 1; }
            if (enemy.x > canvas.width - 60) { enemy.x = canvas.width - 60; enemy.direction = -1; }

            if (enemy.hoverTime > enemy.type.stay) enemy.hoverY = 99999;
        }

        break;

    case 'swoop':
        enemy.x += Math.sin(enemy.phase * 2.2) * 170 * dt;
        enemy.x = clamp(enemy.x, 40, canvas.width - 40);
        emitTrail(enemy.x, enemy.y - 26, 'smoke');
        if (Math.random() < 0.6) emitTrail(enemy.x, enemy.y - 30, 'smoke');
        break;

    case 'dash':

        enemy.x +=
            Math.sin(enemy.phase * 4.5) *
            150 *
            dt;

        break;
}

            updateSpecial(enemy, dt);

            /* COLLISION JOUEUR */

            if (
                distance(enemy, player) <
                enemy.type.size * 0.65 + 18
            ) {

                /* BOUCLIER */

                if (shieldTimer > 0) {

                    score += enemy.type.score * 2;
                    stats.kills++;

                    explode(
                        enemy.x,
                        enemy.y,
                        true
                    );

                    enemies.splice(i, 1);

                    continue;
                }

                /* COLLISION NORMALE */

            if (invincibilityTimer <= 0) {

    hull -= 15;
    lastDamage = 15;

    damageFlash = 0.35;

    invincibilityTimer = 1.2;
}

explode(
    enemy.x,
    enemy.y,
    true
);

enemies.splice(i, 1);

continue;
            }

            if (
                enemy.y >
                canvas.height + 80
            ) {

                enemies.splice(i, 1);
            }
        }

        /* COLLISIONS TIRS */

        for (
            let bi = bullets.length - 1;
            bi >= 0;
            bi--
        ) {

            const bullet =
                bullets[bi];

            let hit = false;

            for (
                let ei = enemies.length - 1;
                ei >= 0;
                ei--
            ) {

                const enemy = enemies[ei];
                if (enemy.cloaked) continue;

               const hitWidth =
    enemy.type.size * 1.15;

const hitHeight =
    enemy.type.size * 1.25;

if (
    bullet.x >= enemy.x - hitWidth &&
    bullet.x <= enemy.x + hitWidth &&
    bullet.y >= enemy.y - hitHeight &&
    bullet.y <= enemy.y + hitHeight
) {
                    stats.hits++;

                    if (relayCovers(enemy) && Math.random() < 0.5) {
                        spark(bullet.x, bullet.y, '120,235,255', 5);
                    } else if (enemy.sh > 0) {
                        enemy.sh--;
                        stats.dmgDealt++;
                        enemy.shFlash = 0.14;
                        spark(bullet.x, bullet.y, '125,216,255', 4);
                    } else {
                        enemy.hp--;
                        stats.dmgDealt++;
                    }

                    bullets.splice(bi, 1);

                    hit = true;

                    explode(
                        bullet.x,
                        bullet.y
                    );

                    if (enemy.hp <= 0) {

                        score += enemy.type.score;
                        stats.kills++;
                        explode(enemy.x, enemy.y, enemy.type.hp > 2);

                        if (
                            Math.random() < 0.22
                        ) {

                            spawnBonus(
                                enemy.x,
                                enemy.y
                            );
                        }

                        enemies.splice(ei, 1);
                    }

                    break;
                }
            }

            if (hit) continue;
        }

        updateBossSystem(dt);

        /* BONUS */

        for (
            let i = bonuses.length - 1;
            i >= 0;
            i--
        ) {

            const bonus =
                bonuses[i];

            bonus.y +=
                bonus.speed * dt;

            if (
                distance(bonus, player) < 40
            ) {

                if (
                    bonus.type === 'weapon'
                ) {

                    weaponLevel =
                        Math.min(
                            5,
                            weaponLevel + 1
                        );
                }

                if (
                    bonus.type === 'speed'
                ) {

                    speedLevel =
                        Math.min(
                            5,
                            speedLevel + 1
                        );
                }

                if (
                    bonus.type === 'repair'
                ) {

                    hull =
                        Math.min(
                            100,
                            hull + 25
                        );
                }

                if (bonus.type === 'shield') {
                    shieldTimer = CONFIG.shieldDuration;
                }
                if (bonus.type === 'bomb') {
                    detonateBomb();
                }

                score += 150;

                bonuses.splice(i, 1);

                continue;
            }

            if (
                bonus.y >
                canvas.height + 40
            ) {

                bonuses.splice(i, 1);
            }
        }

        /* PARTICULES */

        for (
            let i = particles.length - 1;
            i >= 0;
            i--
        ) {

            const particle =
                particles[i];

            particle.x +=
                particle.vx * dt;

            particle.y +=
                particle.vy * dt;

            particle.life -= dt;

            if (
                particle.life <= 0
            ) {

                particles.splice(i, 1);
            }
        }

        /* GAME OVER */

        if (hull <= 0) {

            hull = 0;

            paused = true;
        }

        updateHUD();
    }

    /* ============================================================
       HUD
    ============================================================ */
/* ============================================================
   RECOMMENCER LA PARTIE
============================================================ */


    /* ============================================================
   RECOMMENCER
============================================================ */


    function updateHUD() {

        trackDamage();

        document.getElementById(
            'ss-score'
        ).textContent =
            score.toLocaleString();

        document.getElementById(
            'ss-hull'
        ).textContent =
            hull + '%';

        document.getElementById(
            'ss-weapon'
        ).textContent =
            'LV' + weaponLevel;

        document.getElementById(
            'ss-speed'
        ).textContent =
            'LV' + speedLevel;

        const shieldElement =
            document.getElementById(
                'ss-shield'
            );

        shieldElement.textContent =
            shieldTimer > 0
                ? Math.ceil(shieldTimer) + 's'
                : 'OFF';
    }

    /* ============================================================
       DESSIN JOUEUR
    ============================================================ */

   function drawClassicShip(x, y) {

    /* légère animation des réacteurs */

    const enginePulse =
        0.85 + Math.sin(performance.now() * 0.012) * 0.15;

    ctx.save();

    ctx.translate(x, y);

    /* ========================================================
       RÉACTEURS
    ======================================================== */

    ctx.save();

    ctx.shadowBlur = 18;
    ctx.shadowColor = '#00d9ff';

    const engineGradient =
        ctx.createLinearGradient(
            0,
            10,
            0,
            55
        );

    engineGradient.addColorStop(
        0,
        '#ffffff'
    );

    engineGradient.addColorStop(
        0.25,
        '#35eaff'
    );

    engineGradient.addColorStop(
        0.65,
        '#168cff'
    );

    engineGradient.addColorStop(
        1,
        'rgba(0,80,255,0)'
    );

    ctx.fillStyle = engineGradient;

    /* réacteur gauche */

    ctx.beginPath();

    ctx.moveTo(-18, 18);

    ctx.lineTo(
        -10,
        18 + 38 * enginePulse
    );

    ctx.lineTo(-2, 18);

    ctx.closePath();

    ctx.fill();

    /* réacteur droit */

    ctx.beginPath();

    ctx.moveTo(2, 18);

    ctx.lineTo(
        10,
        18 + 38 * enginePulse
    );

    ctx.lineTo(18, 18);

    ctx.closePath();

    ctx.fill();

    ctx.restore();


    /* ========================================================
       AILES PRINCIPALES
    ======================================================== */

    const wingGradient =
        ctx.createLinearGradient(
            -55,
            0,
            55,
            0
        );

    wingGradient.addColorStop(
        0,
        '#1a2635'
    );

    wingGradient.addColorStop(
        0.5,
        '#526b80'
    );

    wingGradient.addColorStop(
        1,
        '#1a2635'
    );

    ctx.fillStyle = wingGradient;

    ctx.strokeStyle = '#5ee7ff';

    ctx.lineWidth = 2;

    ctx.beginPath();

    /* aile gauche */

    ctx.moveTo(-8, -12);

    ctx.lineTo(-58, 20);

    ctx.lineTo(-38, 28);

    ctx.lineTo(-12, 14);

    /* aile droite */

    ctx.lineTo(12, 14);

    ctx.lineTo(38, 28);

    ctx.lineTo(58, 20);

    ctx.lineTo(8, -12);

    ctx.closePath();

    ctx.fill();

    ctx.stroke();


    /* ========================================================
       MOTEURS MÉTALLIQUES
    ======================================================== */

    ctx.fillStyle = '#172331';

    ctx.strokeStyle = '#4bc9ff';

    ctx.lineWidth = 2;

    ctx.fillRect(
        -25,
        8,
        14,
        22
    );

    ctx.strokeRect(
        -25,
        8,
        14,
        22
    );

    ctx.fillRect(
        11,
        8,
        14,
        22
    );

    ctx.strokeRect(
        11,
        8,
        14,
        22
    );


    /* ========================================================
       CORPS CENTRAL
    ======================================================== */

    const bodyGradient =
        ctx.createLinearGradient(
            -22,
            -35,
            22,
            35
        );

    bodyGradient.addColorStop(
        0,
        '#d8f3ff'
    );

    bodyGradient.addColorStop(
        0.3,
        '#6e8ca3'
    );

    bodyGradient.addColorStop(
        0.65,
        '#2b4256'
    );

    bodyGradient.addColorStop(
        1,
        '#111c28'
    );

    ctx.fillStyle = bodyGradient;

    ctx.strokeStyle = '#9deeff';

    ctx.lineWidth = 2;

    ctx.beginPath();

    /* nez */

    ctx.moveTo(0, -52);

    /* côté gauche */

    ctx.lineTo(-20, -8);

    ctx.lineTo(-15, 30);

    /* arrière */

    ctx.lineTo(15, 30);

    /* côté droit */

    ctx.lineTo(20, -8);

    ctx.closePath();

    ctx.fill();

    ctx.stroke();


    /* ========================================================
       COCKPIT
    ======================================================== */

    ctx.save();

    ctx.shadowBlur = 14;

    ctx.shadowColor = '#00eaff';

    const cockpitGradient =
        ctx.createLinearGradient(
            0,
            -38,
            0,
            5
        );

    cockpitGradient.addColorStop(
        0,
        '#dfffff'
    );

    cockpitGradient.addColorStop(
        0.35,
        '#21dfff'
    );

    cockpitGradient.addColorStop(
        1,
        '#075b9c'
    );

    ctx.fillStyle = cockpitGradient;

    ctx.beginPath();

    ctx.moveTo(0, -35);

    ctx.lineTo(-10, -5);

    ctx.lineTo(0, 8);

    ctx.lineTo(10, -5);

    ctx.closePath();

    ctx.fill();

    ctx.restore();


    /* ========================================================
       CANONS
    ======================================================== */

    ctx.fillStyle = '#a9c8d8';

    ctx.strokeStyle = '#5ee7ff';

    ctx.lineWidth = 1;

    /* canon gauche */

    ctx.fillRect(
        -50,
        -2,
        28,
        6
    );

    ctx.strokeRect(
        -50,
        -2,
        28,
        6
    );

    /* canon droit */

    ctx.fillRect(
        22,
        -2,
        28,
        6
    );

    ctx.strokeRect(
        22,
        -2,
        28,
        6
    );


    /* ========================================================
       LUMIÈRES
    ======================================================== */

    ctx.save();

    ctx.shadowBlur = 12;

    ctx.shadowColor = '#00eaff';

    ctx.fillStyle = '#8cffff';

    ctx.beginPath();

    ctx.arc(
        -34,
        18,
        3,
        0,
        Math.PI * 2
    );

    ctx.fill();

    ctx.beginPath();

    ctx.arc(
        34,
        18,
        3,
        0,
        Math.PI * 2
    );

    ctx.fill();

    ctx.restore();


    /* ========================================================
       BOUCLIER
    ======================================================== */

    if (shieldTimer > 0) {

        ctx.save();

        ctx.strokeStyle =
            'rgba(80,230,255,.8)';

        ctx.lineWidth = 3;

        ctx.shadowBlur = 20;

        ctx.shadowColor = '#00eaff';

        ctx.beginPath();

        ctx.arc(
            0,
            0,
            62,
            0,
            Math.PI * 2
        );

        ctx.stroke();

        ctx.restore();
    }


    /* ======================================================== */

    ctx.restore();
}
    /* ============================================================
       SCOUT
    ============================================================ */

    function drawScout(e) {

    const time = performance.now() * 0.008;

    ctx.save();

    ctx.translate(e.x, e.y);

    /* ========================================================
       ORIENTATION
       Le vaisseau descend vers le joueur
    ======================================================== */

    ctx.rotate(Math.PI);


    /* ========================================================
       RÉACTEURS
    ======================================================== */

    const flame =
        18 + Math.sin(time + e.x) * 5;

    ctx.save();

    ctx.shadowBlur = 16;
    ctx.shadowColor = '#ff4b32';

    const engineGradient =
        ctx.createLinearGradient(
            0,
            18,
            0,
            45
        );

    engineGradient.addColorStop(
        0,
        '#fff3a0'
    );

    engineGradient.addColorStop(
        0.35,
        '#ff9d32'
    );

    engineGradient.addColorStop(
        0.75,
        '#ff4028'
    );

    engineGradient.addColorStop(
        1,
        'rgba(255,40,20,0)'
    );

    ctx.fillStyle = engineGradient;

    /* moteur gauche */

    ctx.beginPath();

    ctx.moveTo(-13, 17);
    ctx.lineTo(-8, 17 + flame);
    ctx.lineTo(-3, 17);

    ctx.closePath();

    ctx.fill();


    /* moteur droit */

    ctx.beginPath();

    ctx.moveTo(3, 17);
    ctx.lineTo(8, 17 + flame);
    ctx.lineTo(13, 17);

    ctx.closePath();

    ctx.fill();

    ctx.restore();


    /* ========================================================
       GRANDES AILES
    ======================================================== */

    const wingGradient =
        ctx.createLinearGradient(
            -36,
            0,
            36,
            0
        );

    wingGradient.addColorStop(
        0,
        '#121923'
    );

    wingGradient.addColorStop(
        0.5,
        '#596879'
    );

    wingGradient.addColorStop(
        1,
        '#121923'
    );

    ctx.fillStyle = wingGradient;

    ctx.strokeStyle = '#ff5964';

    ctx.lineWidth = 2;

    ctx.beginPath();

    /* aile gauche */

    ctx.moveTo(-5, -18);
    ctx.lineTo(-34, 6);
    ctx.lineTo(-29, 18);
    ctx.lineTo(-10, 14);

    /* corps arrière */

    ctx.lineTo(-7, 24);
    ctx.lineTo(7, 24);

    /* aile droite */

    ctx.lineTo(10, 14);
    ctx.lineTo(29, 18);
    ctx.lineTo(34, 6);
    ctx.lineTo(5, -18);

    ctx.closePath();

    ctx.fill();
    ctx.stroke();


    /* ========================================================
       FUSELAGE CENTRAL
    ======================================================== */

    const bodyGradient =
        ctx.createLinearGradient(
            -14,
            0,
            14,
            0
        );

    bodyGradient.addColorStop(
        0,
        '#263340'
    );

    bodyGradient.addColorStop(
        0.35,
        '#b6c5d0'
    );

    bodyGradient.addColorStop(
        0.55,
        '#657887'
    );

    bodyGradient.addColorStop(
        1,
        '#1b2630'
    );

    ctx.fillStyle = bodyGradient;

    ctx.strokeStyle = '#d3e0e8';

    ctx.lineWidth = 1.5;

    ctx.beginPath();

    /* nez */

    ctx.moveTo(0, -36);

    /* côté gauche */

    ctx.lineTo(-13, 5);

    ctx.lineTo(-8, 25);

    /* arrière */

    ctx.lineTo(8, 25);

    /* côté droit */

    ctx.lineTo(13, 5);

    ctx.closePath();

    ctx.fill();
    ctx.stroke();


    /* ========================================================
       COCKPIT ROUGE
    ======================================================== */

    ctx.save();

    ctx.shadowBlur = 14;
    ctx.shadowColor = '#ff3040';

    const cockpitGradient =
        ctx.createLinearGradient(
            0,
            -25,
            0,
            8
        );

    cockpitGradient.addColorStop(
        0,
        '#ffe2e2'
    );

    cockpitGradient.addColorStop(
        0.35,
        '#ff5262'
    );

    cockpitGradient.addColorStop(
        1,
        '#7d1520'
    );

    ctx.fillStyle = cockpitGradient;

    ctx.beginPath();

    ctx.moveTo(0, -24);

    ctx.lineTo(-6, -3);

    ctx.lineTo(0, 8);

    ctx.lineTo(6, -3);

    ctx.closePath();

    ctx.fill();

    ctx.restore();


    /* ========================================================
       CANONS SUR LES AILES
    ======================================================== */

    ctx.fillStyle = '#aab8c2';

    ctx.strokeStyle = '#293642';

    ctx.lineWidth = 1;

    /* canon gauche */

    ctx.fillRect(
        -31,
        3,
        12,
        5
    );

    ctx.strokeRect(
        -31,
        3,
        12,
        5
    );

    /* canon droit */

    ctx.fillRect(
        19,
        3,
        12,
        5
    );

    ctx.strokeRect(
        19,
        3,
        12,
        5
    );


    /* ========================================================
       LUMIÈRES DE BORD
    ======================================================== */

    ctx.save();

    ctx.shadowBlur = 10;

    ctx.shadowColor = '#ff3344';

    ctx.fillStyle = '#ff6b72';

    ctx.beginPath();

    ctx.arc(
        -27,
        15,
        2.5,
        0,
        Math.PI * 2
    );

    ctx.arc(
        27,
        15,
        2.5,
        0,
        Math.PI * 2
    );

    ctx.fill();

    ctx.restore();


    /* ========================================================
       PETIT DÉTAIL MÉCANIQUE CENTRAL
    ======================================================== */

    ctx.fillStyle = '#26333e';

    ctx.fillRect(
        -4,
        12,
        8,
        10
    );


    ctx.restore();
}

    /* ============================================================
       CHASSEUR
    ============================================================ */

    function drawFighter(e) {

    const t = performance.now() * 0.01;

    ctx.save();

    ctx.translate(e.x, e.y);

    /* Il descend vers le joueur */

    ctx.rotate(Math.PI);


    /* ========================================================
       PROPULSEURS
    ======================================================== */

    const flame =
        22 + Math.sin(t + e.x * 0.02) * 6;

    ctx.save();

    ctx.shadowBlur = 18;
    ctx.shadowColor = '#ff7a18';

    const fire =
        ctx.createLinearGradient(
            0,
            20,
            0,
            20 + flame
        );

    fire.addColorStop(0, '#fff4a0');
    fire.addColorStop(0.35, '#ffb000');
    fire.addColorStop(0.7, '#ff4b18');
    fire.addColorStop(1, 'rgba(255,40,0,0)');

    ctx.fillStyle = fire;

    /* moteur gauche */

    ctx.beginPath();

    ctx.moveTo(-20, 18);
    ctx.lineTo(-15, 18 + flame);
    ctx.lineTo(-10, 18);

    ctx.closePath();

    ctx.fill();

    /* moteur droit */

    ctx.beginPath();

    ctx.moveTo(10, 18);
    ctx.lineTo(15, 18 + flame);
    ctx.lineTo(20, 18);

    ctx.closePath();

    ctx.fill();

    ctx.restore();


    /* ========================================================
       GRANDES AILES
    ======================================================== */

    const wing =
        ctx.createLinearGradient(
            -42,
            0,
            42,
            0
        );

    wing.addColorStop(0, '#151922');
    wing.addColorStop(0.5, '#6b2830');
    wing.addColorStop(1, '#151922');

    ctx.fillStyle = wing;

    ctx.strokeStyle = '#ff5360';

    ctx.lineWidth = 2;

    ctx.beginPath();

    ctx.moveTo(0, -28);

    /* aile gauche */

    ctx.lineTo(-16, -5);
    ctx.lineTo(-46, 14);
    ctx.lineTo(-36, 26);
    ctx.lineTo(-12, 15);

    /* arrière */

    ctx.lineTo(-8, 30);
    ctx.lineTo(8, 30);

    /* aile droite */

    ctx.lineTo(12, 15);
    ctx.lineTo(36, 26);
    ctx.lineTo(46, 14);
    ctx.lineTo(16, -5);

    ctx.closePath();

    ctx.fill();
    ctx.stroke();


    /* ========================================================
       FUSELAGE CENTRAL
    ======================================================== */

    const body =
        ctx.createLinearGradient(
            -15,
            0,
            15,
            0
        );

    body.addColorStop(0, '#252b34');
    body.addColorStop(0.35, '#d2d8dd');
    body.addColorStop(0.6, '#707984');
    body.addColorStop(1, '#202630');

    ctx.fillStyle = body;

    ctx.strokeStyle = '#ff8a45';

    ctx.lineWidth = 1.5;

    ctx.beginPath();

    ctx.moveTo(0, -42);

    ctx.lineTo(-15, 10);

    ctx.lineTo(-10, 30);

    ctx.lineTo(10, 30);

    ctx.lineTo(15, 10);

    ctx.closePath();

    ctx.fill();
    ctx.stroke();


    /* ========================================================
       COCKPIT
    ======================================================== */

    ctx.save();

    ctx.shadowBlur = 16;
    ctx.shadowColor = '#ff401f';

    const cockpit =
        ctx.createLinearGradient(
            0,
            -28,
            0,
            10
        );

    cockpit.addColorStop(0, '#fff0c0');
    cockpit.addColorStop(0.3, '#ff8a32');
    cockpit.addColorStop(0.7, '#d62c20');
    cockpit.addColorStop(1, '#651018');

    ctx.fillStyle = cockpit;

    ctx.beginPath();

    ctx.moveTo(0, -28);

    ctx.lineTo(-7, -4);

    ctx.lineTo(0, 10);

    ctx.lineTo(7, -4);

    ctx.closePath();

    ctx.fill();

    ctx.restore();


    /* ========================================================
       CANONS LOURDS
    ======================================================== */

    ctx.fillStyle = '#b9c2c9';

    ctx.strokeStyle = '#303842';

    ctx.lineWidth = 1;

    /* gauche */

    ctx.fillRect(
        -40,
        5,
        18,
        6
    );

    ctx.strokeRect(
        -40,
        5,
        18,
        6
    );

    /* droite */

    ctx.fillRect(
        22,
        5,
        18,
        6
    );

    ctx.strokeRect(
        22,
        5,
        18,
        6
    );


    /* ========================================================
       FEUX
    ======================================================== */

    ctx.save();

    ctx.shadowBlur = 12;
    ctx.shadowColor = '#ff3030';

    ctx.fillStyle = '#ff5964';

    ctx.beginPath();

    ctx.arc(
        -37,
        18,
        3,
        0,
        Math.PI * 2
    );

    ctx.arc(
        37,
        18,
        3,
        0,
        Math.PI * 2
    );

    ctx.fill();

    ctx.restore();


    ctx.restore();
}

    /* ============================================================
       CROISEUR
    ============================================================ */

    function drawCruiser(e) {

    const t = performance.now() * 0.006;

    ctx.save();

    ctx.translate(e.x, e.y);

    /* ========================================================
       ORIENTATION
       Le Cruiser descend vers le joueur
    ======================================================== */

    ctx.rotate(Math.PI);


    /* ========================================================
       GROS PROPULSEURS
    ======================================================== */

    const flame =
        20 + Math.sin(t + e.x * 0.01) * 5;

    ctx.save();

    ctx.shadowBlur = 18;
    ctx.shadowColor = '#29bfff';

    const engineGlow =
        ctx.createLinearGradient(
            0,
            28,
            0,
            28 + flame
        );

    engineGlow.addColorStop(0, '#dfffff');
    engineGlow.addColorStop(0.25, '#4eeaff');
    engineGlow.addColorStop(0.65, '#197dff');
    engineGlow.addColorStop(1, 'rgba(20,100,255,0)');

    ctx.fillStyle = engineGlow;

    /* moteur gauche */

    ctx.beginPath();

    ctx.moveTo(-23, 24);
    ctx.lineTo(-17, 24 + flame);
    ctx.lineTo(-11, 24);

    ctx.closePath();

    ctx.fill();


    /* moteur central */

    ctx.beginPath();

    ctx.moveTo(-6, 27);
    ctx.lineTo(0, 27 + flame + 5);
    ctx.lineTo(6, 27);

    ctx.closePath();

    ctx.fill();


    /* moteur droit */

    ctx.beginPath();

    ctx.moveTo(11, 24);
    ctx.lineTo(17, 24 + flame);
    ctx.lineTo(23, 24);

    ctx.closePath();

    ctx.fill();

    ctx.restore();


    /* ========================================================
       GRAND CORPS / AILES
    ======================================================== */

    const wingGradient =
        ctx.createLinearGradient(
            -52,
            0,
            52,
            0
        );

    wingGradient.addColorStop(0, '#111a25');
    wingGradient.addColorStop(0.25, '#263f58');
    wingGradient.addColorStop(0.5, '#506f89');
    wingGradient.addColorStop(0.75, '#263f58');
    wingGradient.addColorStop(1, '#111a25');

    ctx.fillStyle = wingGradient;

    ctx.strokeStyle = '#55dfff';

    ctx.lineWidth = 2;

    ctx.beginPath();

    /* nez central */

    ctx.moveTo(0, -45);

    /* aile gauche supérieure */

    ctx.lineTo(-18, -20);
    ctx.lineTo(-48, -4);

    /* aile gauche extérieure */

    ctx.lineTo(-55, 15);
    ctx.lineTo(-35, 25);

    /* arrière gauche */

    ctx.lineTo(-18, 20);

    ctx.lineTo(-12, 34);

    /* arrière central */

    ctx.lineTo(12, 34);

    /* arrière droit */

    ctx.lineTo(18, 20);

    /* aile droite */

    ctx.lineTo(35, 25);
    ctx.lineTo(55, 15);
    ctx.lineTo(48, -4);
    ctx.lineTo(18, -20);

    ctx.closePath();

    ctx.fill();
    ctx.stroke();


    /* ========================================================
       FUSELAGE CENTRAL LOURD
    ======================================================== */

    const bodyGradient =
        ctx.createLinearGradient(
            -20,
            0,
            20,
            0
        );

    bodyGradient.addColorStop(0, '#17232e');
    bodyGradient.addColorStop(0.3, '#61788a');
    bodyGradient.addColorStop(0.5, '#b9d0df');
    bodyGradient.addColorStop(0.7, '#506b7d');
    bodyGradient.addColorStop(1, '#16212b');

    ctx.fillStyle = bodyGradient;

    ctx.strokeStyle = '#a9efff';

    ctx.lineWidth = 1.5;

    ctx.beginPath();

    ctx.moveTo(0, -48);

    ctx.lineTo(-17, -10);

    ctx.lineTo(-14, 25);

    ctx.lineTo(-7, 38);

    ctx.lineTo(7, 38);

    ctx.lineTo(14, 25);

    ctx.lineTo(17, -10);

    ctx.closePath();

    ctx.fill();
    ctx.stroke();


    /* ========================================================
       COCKPIT BLEU
    ======================================================== */

    ctx.save();

    ctx.shadowBlur = 16;
    ctx.shadowColor = '#28dfff';

    const cockpit =
        ctx.createLinearGradient(
            0,
            -35,
            0,
            5
        );

    cockpit.addColorStop(0, '#efffff');
    cockpit.addColorStop(0.25, '#73efff');
    cockpit.addColorStop(0.65, '#187ed8');
    cockpit.addColorStop(1, '#083d78');

    ctx.fillStyle = cockpit;

    ctx.beginPath();

    ctx.moveTo(0, -34);

    ctx.lineTo(-9, -6);

    ctx.lineTo(0, 8);

    ctx.lineTo(9, -6);

    ctx.closePath();

    ctx.fill();

    ctx.restore();


    /* ========================================================
       TOURELLES LATÉRALES
    ======================================================== */

    ctx.fillStyle = '#9fb4c2';

    ctx.strokeStyle = '#263846';

    ctx.lineWidth = 1;

    /* gauche */

    ctx.fillRect(
        -48,
        5,
        18,
        8
    );

    ctx.strokeRect(
        -48,
        5,
        18,
        8
    );


    /* droite */

    ctx.fillRect(
        30,
        5,
        18,
        8
    );

    ctx.strokeRect(
        30,
        5,
        18,
        8
    );


    /* ========================================================
       PANNEAUX MÉCANIQUES
    ======================================================== */

    ctx.strokeStyle =
        'rgba(130,220,255,.65)';

    ctx.lineWidth = 1;

    ctx.beginPath();

    ctx.moveTo(-32, 4);
    ctx.lineTo(-15, 10);

    ctx.moveTo(32, 4);
    ctx.lineTo(15, 10);

    ctx.moveTo(-18, 22);
    ctx.lineTo(-8, 18);

    ctx.moveTo(18, 22);
    ctx.lineTo(8, 18);

    ctx.stroke();


    /* ========================================================
       FEUX BLEUS
    ======================================================== */

    ctx.save();

    ctx.shadowBlur = 14;

    ctx.shadowColor = '#2de8ff';

    ctx.fillStyle = '#73f4ff';

    ctx.beginPath();

    ctx.arc(
        -42,
        16,
        3,
        0,
        Math.PI * 2
    );

    ctx.arc(
        42,
        16,
        3,
        0,
        Math.PI * 2
    );

    ctx.arc(
        0,
        26,
        2.5,
        0,
        Math.PI * 2
    );

    ctx.fill();

    ctx.restore();


    ctx.restore();
}
/* ============================================================
   INTERCEPTEUR
============================================================ */

function drawInterceptor(e) {

    const t = performance.now() * 0.008;

    ctx.save();

    ctx.translate(e.x, e.y);

    /* Le vaisseau descend vers le joueur */

    ctx.rotate(Math.PI);


    /* ========================================================
       RÉACTEURS
    ======================================================== */

    ctx.save();

    ctx.shadowBlur = 18;
    ctx.shadowColor = '#b65cff';

    const flameLength =
        18 + Math.sin(t + e.phase) * 5;

    const engineGradient =
        ctx.createLinearGradient(
            0,
            20,
            0,
            20 + flameLength
        );

    engineGradient.addColorStop(
        0,
        '#ffffff'
    );

    engineGradient.addColorStop(
        0.3,
        '#d58cff'
    );

    engineGradient.addColorStop(
        0.7,
        '#7b25ff'
    );

    engineGradient.addColorStop(
        1,
        'rgba(100,20,255,0)'
    );

    ctx.fillStyle =
        engineGradient;


    /* moteur gauche */

    ctx.beginPath();

    ctx.moveTo(-14, 18);
    ctx.lineTo(-10, 18 + flameLength);
    ctx.lineTo(-6, 18);

    ctx.closePath();

    ctx.fill();


    /* moteur droit */

    ctx.beginPath();

    ctx.moveTo(6, 18);
    ctx.lineTo(10, 18 + flameLength);
    ctx.lineTo(14, 18);

    ctx.closePath();

    ctx.fill();

    ctx.restore();


    /* ========================================================
       AILES
    ======================================================== */

    const wingGradient =
        ctx.createLinearGradient(
            -42,
            0,
            42,
            0
        );

    wingGradient.addColorStop(
        0,
        '#180d28'
    );

    wingGradient.addColorStop(
        0.35,
        '#4b236e'
    );

    wingGradient.addColorStop(
        0.5,
        '#6f3fa0'
    );

    wingGradient.addColorStop(
        0.65,
        '#4b236e'
    );

    wingGradient.addColorStop(
        1,
        '#180d28'
    );

    ctx.fillStyle =
        wingGradient;

    ctx.strokeStyle =
        '#cf78ff';

    ctx.lineWidth =
        2;


    ctx.beginPath();

    /* nez */

    ctx.moveTo(0, -48);

    /* aile gauche */

    ctx.lineTo(-13, -18);
    ctx.lineTo(-42, 8);
    ctx.lineTo(-30, 18);
    ctx.lineTo(-12, 12);

    /* arrière */

    ctx.lineTo(-7, 30);
    ctx.lineTo(7, 30);

    /* aile droite */

    ctx.lineTo(12, 12);
    ctx.lineTo(30, 18);
    ctx.lineTo(42, 8);
    ctx.lineTo(13, -18);

    ctx.closePath();

    ctx.fill();

    ctx.stroke();


    /* ========================================================
       CORPS CENTRAL
    ======================================================== */

    const bodyGradient =
        ctx.createLinearGradient(
            -14,
            0,
            14,
            0
        );

    bodyGradient.addColorStop(
        0,
        '#130d1d'
    );

    bodyGradient.addColorStop(
        0.35,
        '#5d3a72'
    );

    bodyGradient.addColorStop(
        0.5,
        '#b88bd1'
    );

    bodyGradient.addColorStop(
        0.65,
        '#513365'
    );

    bodyGradient.addColorStop(
        1,
        '#130d1d'
    );

    ctx.fillStyle =
        bodyGradient;


    ctx.beginPath();

    ctx.moveTo(0, -52);

    ctx.lineTo(-12, -12);

    ctx.lineTo(-9, 22);

    ctx.lineTo(0, 34);

    ctx.lineTo(9, 22);

    ctx.lineTo(12, -12);

    ctx.closePath();

    ctx.fill();

    ctx.stroke();


    /* ========================================================
       COCKPIT ÉNERGÉTIQUE
    ======================================================== */

    ctx.save();

    ctx.shadowBlur = 20;

    ctx.shadowColor =
        '#df8cff';

    const cockpitGradient =
        ctx.createLinearGradient(
            0,
            -35,
            0,
            4
        );

    cockpitGradient.addColorStop(
        0,
        '#ffffff'
    );

    cockpitGradient.addColorStop(
        0.25,
        '#f0aaff'
    );

    cockpitGradient.addColorStop(
        0.7,
        '#7827d8'
    );

    cockpitGradient.addColorStop(
        1,
        '#31105f'
    );

    ctx.fillStyle =
        cockpitGradient;

    ctx.beginPath();

    ctx.moveTo(0, -36);

    ctx.lineTo(-7, -8);

    ctx.lineTo(0, 4);

    ctx.lineTo(7, -8);

    ctx.closePath();

    ctx.fill();

    ctx.restore();


    /* ========================================================
       CANONS LATÉRAUX
    ======================================================== */

    ctx.fillStyle =
        '#c5a5d8';

    ctx.fillRect(
        -37,
        3,
        14,
        4
    );

    ctx.fillRect(
        23,
        3,
        14,
        4
    );


    /* ========================================================
       POINTS D'ÉNERGIE
    ======================================================== */

    ctx.save();

    ctx.shadowBlur = 14;

    ctx.shadowColor =
        '#d55cff';

    ctx.fillStyle =
        '#f0b3ff';

    ctx.beginPath();

    ctx.arc(
        -27,
        12,
        2.5,
        0,
        Math.PI * 2
    );

    ctx.arc(
        27,
        12,
        2.5,
        0,
        Math.PI * 2
    );

    ctx.fill();

    ctx.restore();


    ctx.restore();
}
  /* ============================================================
   BONUS
============================================================ */

function drawBonus(b) {

    const time =
        performance.now() * 0.003;

    /* --------------------------------------------------------
       COULEURS SELON LE BONUS
    -------------------------------------------------------- */

    let color = '#ffcf4f';
    let lightColor = '#fff3a6';
    let symbol = '↑';

    if (b.type === 'weapon') {

        color = '#ff7a35';
        lightColor = '#ffd0a8';
        symbol = '✦';
    }

    if (b.type === 'speed') {

        color = '#42eaff';
        lightColor = '#b8ffff';
        symbol = '»';
    }

    if (b.type === 'repair') {

        color = '#ff4f62';
        lightColor = '#ffc1c8';
        symbol = '+';
    }

    if (b.type === 'shield') {
        color = '#a05cff';
        lightColor = '#e1c4ff';
        symbol = '◉';
    }
    if (b.type === 'bomb') {
        color = '#ffd21a';
        lightColor = '#fff3a6';
        symbol = '✹';
    }


    /* --------------------------------------------------------
       BALANCEMENT DU PARACHUTE
    -------------------------------------------------------- */

    const swing =
        Math.sin(time + b.x * 0.05) * 0.12;


    const glow =
        10 + Math.sin(time * 2) * 4;


    ctx.save();

    ctx.translate(
        b.x,
        b.y
    );

    ctx.rotate(swing);


    /* ========================================================
       HALO LUMINEUX
    ======================================================== */

    ctx.shadowBlur =
        glow;

    ctx.shadowColor =
        color;

    ctx.strokeStyle =
        color;

    ctx.lineWidth =
        2;


    /* ========================================================
       PARACHUTE
    ======================================================== */

    const parachuteGradient =
        ctx.createLinearGradient(
            0,
            -34,
            0,
            -6
        );

    parachuteGradient.addColorStop(
        0,
        lightColor
    );

    parachuteGradient.addColorStop(
        0.35,
        color
    );

    parachuteGradient.addColorStop(
        1,
        '#17202c'
    );

    ctx.fillStyle =
        parachuteGradient;


    ctx.beginPath();

    ctx.moveTo(
        -28,
        -8
    );

    ctx.quadraticCurveTo(
        -20,
        -34,
        0,
        -36
    );

    ctx.quadraticCurveTo(
        20,
        -34,
        28,
        -8
    );

    ctx.lineTo(
        22,
        -6
    );

    ctx.quadraticCurveTo(
        0,
        -14,
        -22,
        -6
    );

    ctx.closePath();

    ctx.fill();

    ctx.stroke();


    /* --------------------------------------------------------
       PANNEAUX DU PARACHUTE
    -------------------------------------------------------- */

    ctx.beginPath();

    ctx.moveTo(
        -14,
        -30
    );

    ctx.lineTo(
        -10,
        -9
    );

    ctx.moveTo(
        0,
        -34
    );

    ctx.lineTo(
        0,
        -10
    );

    ctx.moveTo(
        14,
        -30
    );

    ctx.lineTo(
        10,
        -9
    );

    ctx.stroke();


    /* ========================================================
       CORDES
    ======================================================== */

    ctx.shadowBlur = 0;

    ctx.strokeStyle =
        '#c7d4dd';

    ctx.lineWidth =
        1.5;


    ctx.beginPath();

    ctx.moveTo(
        -23,
        -8
    );

    ctx.lineTo(
        -11,
        10
    );


    ctx.moveTo(
        -8,
        -10
    );

    ctx.lineTo(
        -7,
        10
    );


    ctx.moveTo(
        8,
        -10
    );

    ctx.lineTo(
        7,
        10
    );


    ctx.moveTo(
        23,
        -8
    );

    ctx.lineTo(
        11,
        10
    );

    ctx.stroke();


    /* ========================================================
       CAISSE MÉTALLIQUE
    ======================================================== */

    ctx.save();

    ctx.shadowBlur =
        12;

    ctx.shadowColor =
        color;


    const boxGradient =
        ctx.createLinearGradient(
            -16,
            10,
            16,
            32
        );

    boxGradient.addColorStop(
        0,
        '#344657'
    );

    boxGradient.addColorStop(
        0.35,
        color
    );

    boxGradient.addColorStop(
        0.65,
        '#263746'
    );

    boxGradient.addColorStop(
        1,
        '#101820'
    );


    ctx.fillStyle =
        boxGradient;


    ctx.fillRect(
        -16,
        10,
        32,
        24
    );


    /* Bordure métallique */

    ctx.strokeStyle =
        lightColor;

    ctx.lineWidth =
        2;

    ctx.strokeRect(
        -16,
        10,
        32,
        24
    );


    /* Coins renforcés */

    ctx.fillStyle =
        '#101820';

    ctx.fillRect(
        -16,
        10,
        6,
        6
    );

    ctx.fillRect(
        10,
        10,
        6,
        6
    );

    ctx.fillRect(
        -16,
        28,
        6,
        6
    );

    ctx.fillRect(
        10,
        28,
        6,
        6
    );


    /* ========================================================
       SYMBOLE DU BONUS
    ======================================================== */

    ctx.save();

    ctx.shadowBlur =
        10;

    ctx.shadowColor =
        lightColor;

    ctx.fillStyle =
        '#ffffff';

    ctx.font =
        'bold 21px Arial';

    ctx.textAlign =
        'center';

    ctx.textBaseline =
        'middle';

    ctx.fillText(
        symbol,
        0,
        22
    );

    ctx.restore();


    /* Petite ligne lumineuse */

    ctx.fillStyle =
        lightColor;

    ctx.fillRect(
        -9,
        13,
        18,
        2
    );


    ctx.restore();


    /* ========================================================
       PETIT SIGNAL LUMINEUX SOUS LA CAISSE
    ======================================================== */

    ctx.save();

    ctx.globalAlpha =
        0.5 +
        Math.sin(time * 3) * 0.2;

    ctx.fillStyle =
        color;

    ctx.beginPath();

    ctx.arc(
        0,
        38,
        3,
        0,
        Math.PI * 2
    );

    ctx.fill();

    ctx.restore();


    ctx.restore();
}

    /* ============================================================
       DRAW
    ============================================================ */

    function draw() {

        ctx.clearRect(
            0,
            0,
            canvas.width,
            canvas.height
        );

        drawBackdrop();

        /* ÉTOILES */

        for (const star of stars) {

            ctx.fillStyle =
                `rgba(${stageTheme().star},${
                    .35 + star.size / 4
                })`;

            ctx.fillRect(
                star.x,
                star.y,
                star.size,
                star.size
            );
        }

        /* ========================================================
           ÉCRAN D'ACCUEIL
        ======================================================== */

        if (!gameStarted) {
            drawStartScreen();
            return;
        }

        ctx.save();
    if (shake > 0) {
        ctx.translate((Math.random() - 0.5) * shake, (Math.random() - 0.5) * shake);
    }

    drawTrails();
    drawBeams();
    drawWarnLines();

    /* JOUEUR */
    drawPlayer();

        /* ENNEMIS */

        for (const enemy of enemies) {

            if (
                enemy.type.type === 'scout'
            ) {

                drawScout(enemy);
            }

            if (
                enemy.type.type === 'fighter'
            ) {

                drawFighter(enemy);
            }

            if (
                enemy.type.type === 'cruiser'
            ) {

                drawCruiser(enemy); } if (enemy.type.type === 'interceptor') { drawInterceptor(enemy); } if (enemy.type.type === 'comet') { drawComet(enemy); }
    if (enemy.type.type === 'drone') { drawDrone(enemy); }
    if (enemy.type.type === 'missilier') { drawMissilier(enemy); }
    if (enemy.type.type === 'mineur') { drawMineur(enemy); }
    if (enemy.type.type === 'sniper') {
        drawSniper(enemy);
    }
    if (enemy.type.type === 'lancer') { drawLancer(enemy); }
    if (enemy.type.type === 'bastion') { drawBastion(enemy); }
    if (enemy.type.type === 'orbiter') { drawOrbiter(enemy); }
    if (enemy.type.type === 'spectre') {
        drawSpectre(enemy);
    }
    if (enemy.type.type === 'harpy') { drawHarpy(enemy); }
    if (enemy.type.type === 'relay') {
        drawRelay(enemy);
            }
        }

        if (boss) { drawBoss(); }

    /* TIRS */
    for (const bullet of bullets) {

            ctx.save();

            ctx.shadowBlur = 15;

            ctx.shadowColor =
                '#55eaff';

            ctx.fillStyle =
                '#d7ffff';

            ctx.fillRect(
                bullet.x - 2,
                bullet.y - 12,
                4,
                18
            );

            ctx.restore();
        }
/* ============================================================
   AFFICHAGE DES TIRS ENNEMIS
============================================================ */

for (const bullet of enemyBullets) {
    if (bullet.kind) { drawSpecialBullet(bullet); continue; }
    ctx.save();

    ctx.shadowBlur = 14;

    ctx.shadowColor = bullet.color || '#ff5365';
        ctx.fillStyle = bullet.color || '#ff5365';

    ctx.beginPath();

    ctx.arc(
        bullet.x,
        bullet.y,
        bullet.size || 5,
        0,
        Math.PI * 2
    );

    ctx.fill();


    /* CENTRE LUMINEUX */

    ctx.fillStyle =
        '#fff4d6';

    ctx.beginPath();

    ctx.arc(
        bullet.x,
        bullet.y,
        (bullet.size || 5) * 0.45,
        0,
        Math.PI * 2
    );

    ctx.fill();

    ctx.restore();
}
        /* BONUS */

        for (const bonus of bonuses) {

            drawBonus(bonus);
        }

        /* PARTICULES */

        for (const particle of particles) {

            ctx.fillStyle = `rgba(${particle.color || '255,150,50'},${Math.max(0, particle.life)})`;

            ctx.fillRect(
                particle.x,
                particle.y,
                particle.size,
                particle.size
            );
        }
/* FLASH DE DÉGÂTS */

ctx.restore();
    drawBossUI();
    drawBanner();
    drawUltraTag();
    drawBombFx();

    if (damageFlash > 0) { ctx.save(); ctx.fillStyle =
        `rgba(255, 30, 30, ${damageFlash * 0.65})`;

    ctx.fillRect(
        0,
        0,
        canvas.width,
        canvas.height
    );

    ctx.fillStyle = '#ffffff';

    ctx.font = 'bold 32px Arial';

    ctx.textAlign = 'center';

    ctx.shadowBlur = 15;
    ctx.shadowColor = '#ff0000';

    ctx.fillText(
        '-' + lastDamage + ' COQUE',
        canvas.width / 2,
        canvas.height / 2 - 80
    );

    ctx.restore();
}
        if (victory) { drawVictory(); }

    /* PAUSE */
    if (paused && !victory && hull <= 0) { drawGameOver(); }
    if (paused && !victory && hull > 0) {

            ctx.fillStyle =
                'rgba(0,0,0,.55)';

            ctx.fillRect(
                0,
                0,
                canvas.width,
                canvas.height
            );

            ctx.fillStyle =
                hull <= 0
                    ? '#ff5365'
                    : '#d7f5ff';

            ctx.font =
                'bold 42px Arial';

            ctx.textAlign =
                'center';

            ctx.fillText(
                hull <= 0
                    ? 'GAME OVER'
                    : 'PAUSE',
                canvas.width / 2,
                canvas.height / 2
            );

            ctx.font =
                '18px Arial';

            ctx.fillStyle =
                '#9ec5d8';

     if (hull <= 0) {

    ctx.fillText(
        'Score : ' + score,
        canvas.width / 2,
        canvas.height / 2 + 42
    );

    /* BOUTON RECOMMENCER */

    ctx.fillStyle = '#123d61';

    ctx.strokeStyle = '#45dfff';

    ctx.lineWidth = 2;

    const buttonWidth = 220;
    const buttonHeight = 52;

    const buttonX =
        canvas.width / 2 - buttonWidth / 2;

    const buttonY =
        canvas.height / 2 + 75;

    ctx.fillRect(
        buttonX,
        buttonY,
        buttonWidth,
        buttonHeight
    );

    ctx.strokeRect(
        buttonX,
        buttonY,
        buttonWidth,
        buttonHeight
    );

    ctx.fillStyle = '#d7f5ff';

    ctx.font = 'bold 18px Arial';

    ctx.textAlign = 'center';

    ctx.fillText(
        '🔄 RECOMMENCER',
        canvas.width / 2,
        buttonY + 33
    );

} else {

    ctx.fillText(
        'Appuie sur P pour continuer',
        canvas.width / 2,
        canvas.height / 2 + 42
    );
}
        }
    }

    /* ============================================================
       GAME LOOP
    ============================================================ */

    function loop(now) {

        if (!gameRunning) return;

        let dt =
            (now - lastTime) / 1000;

        lastTime = now;

        dt = Math.min(dt, 0.05);

        update(dt);

        draw();

        requestAnimationFrame(loop);
    }

    requestAnimationFrame(loop);

    console.log(
        '🚀 SoNiC STRIKER 3.0 chargé'
    );

})();