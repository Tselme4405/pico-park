"use client";

import { useEffect, useRef } from "react";
import { Fredoka } from "next/font/google";

const fredoka = Fredoka({ subsets: ["latin"], weight: ["500", "600", "700"] });

const TILE = 32;
const COLS = 30;
const ROWS = 17;
const W = COLS * TILE;
const H = ROWS * TILE;
const PW = 30;
const PH = 30;

// PICO PARK palette
const COLORS = [
  "#6abe30", // green
  "#ef5f9a", // pink
  "#4fa4f4", // blue
  "#f7941d", // orange
  "#f8d838", // yellow
  "#a06ee1", // purple
  "#4ecdc4", // cyan
  "#e8534f", // red
];
const INK = "#26282e"; // near-black used for tiles/text
const TILE_C = "#33353d";

interface SPlayer {
  id: string;
  i: number;
  x: number;
  y: number;
  d: number;
  dd: number;
  en: number;
  k: number;
}
interface SButton {
  ch: string;
  q: number;
  l: number;
  c: number;
}
interface Snapshot {
  t: "s";
  ph: string;
  lv: number;
  it: number;
  n: number;
  p: SPlayer[];
  key: { x: number; y: number; tk: number; us: number } | null;
  dr: number;
  go: number;
  bt: SButton[];
}
interface LevelMsg {
  t: "level";
  idx: number;
  name: string;
  tiles: string[];
  total: number;
}
interface Fx {
  phase: number;
  lastX: number;
  lastY: number;
  squash: number;
  nextBlink: number;
  blinkT: number;
  falling: boolean;
}

function shade(hex: string, f: number): string {
  const n = parseInt(hex.slice(1), 16);
  const ch = (v: number) => Math.max(0, Math.min(255, Math.round(v * f)));
  return `rgb(${ch((n >> 16) & 255)},${ch((n >> 8) & 255)},${ch(n & 255)})`;
}

export default function Home() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const FAM = fredoka.style.fontFamily;
    try {
      document.fonts.load(`700 24px ${FAM}`);
      document.fonts.load(`600 24px ${FAM}`);
      document.fonts.load(`500 24px ${FAM}`);
    } catch {}
    const font = (weight: number, size: number) => `${weight} ${size}px ${FAM}`;

    let closed = false;
    let ws: WebSocket | null = null;
    let myId = "";
    let level: LevelMsg | null = null;
    let serverFull = false;
    let everConnected = false;
    let connected = false;
    let raf = 0;
    let reconnectT: ReturnType<typeof setTimeout> | null = null;
    const snaps: { at: number; s: Snapshot }[] = [];
    const input = { l: false, r: false, j: false };
    const fx = new Map<string, Fx>();

    function send(o: object) {
      if (ws && ws.readyState === 1) ws.send(JSON.stringify(o));
    }
    function sendInput() {
      send({ t: "in", l: input.l ? 1 : 0, r: input.r ? 1 : 0, j: input.j ? 1 : 0 });
    }
    function latest(): Snapshot | null {
      return snaps.length ? snaps[snaps.length - 1].s : null;
    }

    function connect() {
      if (closed) return;
      const proto = location.protocol === "https:" ? "wss" : "ws";
      ws = new WebSocket(`${proto}://${location.host}/ws`);
      ws.onopen = () => {
        connected = true;
        everConnected = true;
        sendInput();
      };
      ws.onmessage = (e) => {
        let m: { t?: string } & Record<string, unknown>;
        try {
          m = JSON.parse(e.data as string);
        } catch {
          return;
        }
        if (m.t === "hi") myId = m.id as string;
        else if (m.t === "level") level = m as unknown as LevelMsg;
        else if (m.t === "s") {
          snaps.push({ at: performance.now(), s: m as unknown as Snapshot });
          while (snaps.length > 8) snaps.shift();
        } else if (m.t === "full") serverFull = true;
      };
      ws.onclose = () => {
        connected = false;
        ws = null;
        if (!closed && !serverFull) reconnectT = setTimeout(connect, 1000);
      };
      ws.onerror = () => {
        try {
          ws?.close();
        } catch {}
      };
    }

    // StrictMode-safe delayed connect
    const connectT = setTimeout(connect, 60);

    function onKey(e: KeyboardEvent, down: boolean) {
      let used = true;
      switch (e.code) {
        case "ArrowLeft":
        case "KeyA":
          if (input.l !== down) {
            input.l = down;
            sendInput();
          }
          break;
        case "ArrowRight":
        case "KeyD":
          if (input.r !== down) {
            input.r = down;
            sendInput();
          }
          break;
        case "ArrowUp":
        case "KeyW":
        case "Space":
          if (input.j !== down) {
            input.j = down;
            sendInput();
          }
          break;
        case "Enter": {
          if (down) {
            const ph = latest()?.ph;
            if (ph === "lobby") send({ t: "start" });
            else if (ph === "allclear") send({ t: "lobby" });
          }
          break;
        }
        case "KeyR":
          if (down && latest()?.ph === "play") send({ t: "restart" });
          break;
        default:
          used = false;
      }
      if (used) e.preventDefault();
    }
    const kd = (e: KeyboardEvent) => onKey(e, true);
    const ku = (e: KeyboardEvent) => onKey(e, false);
    const onBlur = () => {
      input.l = input.r = input.j = false;
      sendInput();
    };
    const onClick = (e: MouseEvent) => {
      const s = latest();
      if (!s || !canvas) return;
      const r = canvas.getBoundingClientRect();
      const mx = ((e.clientX - r.left) * W) / r.width;
      const my = ((e.clientY - r.top) * H) / r.height;
      if (s.ph === "lobby" && my > 330 && my < 420 && mx > W / 2 - 220 && mx < W / 2 + 220) {
        send({ t: "start" });
      } else if (s.ph === "allclear") {
        send({ t: "lobby" });
      }
    };
    window.addEventListener("keydown", kd);
    window.addEventListener("keyup", ku);
    window.addEventListener("blur", onBlur);
    canvas.addEventListener("click", onClick);

    // debug/testing hook
    (window as unknown as Record<string, unknown>).__pp = {
      state: () => latest(),
      level: () => level,
      me: () => myId,
    };

    // interpolate between the two snapshots straddling (now - 100ms)
    function lerped(now: number): Snapshot | null {
      if (!snaps.length) return null;
      const rt = now - 100;
      let s0 = snaps[snaps.length - 1];
      let s1 = s0;
      for (let i = 0; i < snaps.length - 1; i++) {
        if (snaps[i].at <= rt && snaps[i + 1].at >= rt) {
          s0 = snaps[i];
          s1 = snaps[i + 1];
          break;
        }
      }
      if (s0 === s1) return s1.s;
      const a = Math.min(1, Math.max(0, (rt - s0.at) / (s1.at - s0.at)));
      const prev = new Map(s0.s.p.map((p) => [p.id, p]));
      return {
        ...s1.s,
        p: s1.s.p.map((p) => {
          const q = prev.get(p.id);
          if (!q || Math.abs(q.x - p.x) > 80 || Math.abs(q.y - p.y) > 80) return p;
          return { ...p, x: q.x + (p.x - q.x) * a, y: q.y + (p.y - q.y) * a };
        }),
      };
    }

    function drawTiles(s: Snapshot) {
      if (!level || !ctx) return;
      const tiles = level.tiles;
      for (let r = 0; r < ROWS; r++) {
        for (let c = 0; c < COLS; c++) {
          const ch = tiles[r][c];
          const x = c * TILE;
          const y = r * TILE;
          if (ch === "#") {
            ctx.fillStyle = TILE_C;
            ctx.fillRect(x, y, TILE, TILE);
            ctx.strokeStyle = INK;
            ctx.lineWidth = 1;
            ctx.strokeRect(x + 0.5, y + 0.5, TILE - 1, TILE - 1);
          } else if (ch === "G") {
            if (!s.go) {
              ctx.fillStyle = "#565a66";
              ctx.fillRect(x, y, TILE, TILE);
              ctx.save();
              ctx.beginPath();
              ctx.rect(x, y, TILE, TILE);
              ctx.clip();
              ctx.strokeStyle = "#3f424c";
              ctx.lineWidth = 4;
              ctx.beginPath();
              for (let k = -TILE; k < TILE; k += 11) {
                ctx.moveTo(x + k, y + TILE);
                ctx.lineTo(x + k + TILE, y);
              }
              ctx.stroke();
              ctx.restore();
              ctx.strokeStyle = INK;
              ctx.lineWidth = 1.5;
              ctx.strokeRect(x + 0.75, y + 0.75, TILE - 1.5, TILE - 1.5);
            }
          } else if (ch === "^") {
            ctx.fillStyle = TILE_C;
            for (let k = 0; k < 2; k++) {
              const bx = x + k * (TILE / 2);
              ctx.beginPath();
              ctx.moveTo(bx, y + TILE);
              ctx.lineTo(bx + TILE / 4, y + 5);
              ctx.lineTo(bx + TILE / 2, y + TILE);
              ctx.closePath();
              ctx.fill();
            }
          }
        }
      }
      // number buttons (PICO PARK style: red block with the number on it)
      for (const bt of s.bt) {
        for (let r = 0; r < ROWS; r++) {
          for (let c = 0; c < COLS; c++) {
            if (tiles[r][c] !== bt.ch) continue;
            const x = c * TILE;
            const y = r * TILE;
            const pressedNow = !bt.l && bt.c > 0;
            const off = bt.l ? 6 : pressedNow ? 4 : 0;
            ctx.fillStyle = bt.l ? "#6abe30" : "#e8534f";
            ctx.beginPath();
            ctx.roundRect(x + 2, y + 12 + off, TILE - 4, TILE - 12 - off, [6, 6, 0, 0]);
            ctx.fill();
          }
        }
        // number centered across the button tiles
        let minC = COLS;
        let maxC = -1;
        let rowR = -1;
        for (let r = 0; r < ROWS; r++) {
          for (let c = 0; c < COLS; c++) {
            if (tiles[r][c] === bt.ch) {
              minC = Math.min(minC, c);
              maxC = Math.max(maxC, c);
              rowR = r;
            }
          }
        }
        if (rowR < 0) continue;
        const cx = ((minC + maxC + 1) / 2) * TILE;
        ctx.fillStyle = "#ffffff";
        ctx.font = font(700, 17);
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(bt.l ? "✓" : String(bt.q), cx, rowR * TILE + 24);
        if (!bt.l && bt.c > 0) {
          ctx.fillStyle = INK;
          ctx.font = font(600, 14);
          ctx.fillText(`${bt.c}/${bt.q}`, cx, rowR * TILE - 8);
        }
      }
    }

    function drawDoor(s: Snapshot) {
      if (!level || !ctx) return;
      for (let r = 0; r < ROWS; r++) {
        const c = level.tiles[r].indexOf("D");
        if (c < 0) continue;
        const x = c * TILE;
        const y = (r - 1) * TILE;
        // arch-shaped door, PICO PARK style
        ctx.fillStyle = s.dr ? "#101014" : TILE_C;
        ctx.beginPath();
        ctx.roundRect(x + 1, y + 2, TILE - 2, TILE * 2 - 2, [15, 15, 0, 0]);
        ctx.fill();
        if (s.dr) {
          ctx.strokeStyle = "#6abe30";
          ctx.lineWidth = 3;
          ctx.beginPath();
          ctx.roundRect(x + 1.5, y + 2.5, TILE - 3, TILE * 2 - 3, [15, 15, 0, 0]);
          ctx.stroke();
        } else {
          // gold keyhole
          ctx.fillStyle = "#f8c822";
          ctx.beginPath();
          ctx.arc(x + TILE / 2, y + 34, 4.5, 0, Math.PI * 2);
          ctx.fill();
          ctx.beginPath();
          ctx.moveTo(x + TILE / 2 - 3, y + 46);
          ctx.lineTo(x + TILE / 2 + 3, y + 46);
          ctx.lineTo(x + TILE / 2 + 1.5, y + 36);
          ctx.lineTo(x + TILE / 2 - 1.5, y + 36);
          ctx.closePath();
          ctx.fill();
        }
      }
    }

    function drawKeyIcon(x: number, y: number, scale = 1) {
      if (!ctx) return;
      ctx.save();
      ctx.translate(x, y);
      ctx.scale(scale, scale);
      ctx.fillStyle = "#f8c822";
      ctx.beginPath();
      ctx.arc(-7, 0, 7, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#ffffff";
      ctx.beginPath();
      ctx.arc(-7, 0, 3, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#f8c822";
      ctx.beginPath();
      ctx.roundRect(-2, -2.5, 16, 5, 2);
      ctx.fill();
      ctx.fillRect(8, 2, 3, 6);
      ctx.fillRect(12, 2, 3, 5);
      ctx.restore();
    }

    function drawKey(s: Snapshot, now: number) {
      if (!s.key || s.key.us || s.key.tk) return;
      const bob = Math.sin(now / 280) * 3;
      drawKeyIcon(s.key.x + 12, s.key.y + 12 + bob, 1.1);
    }

    function getFx(id: string, now: number): Fx {
      let f = fx.get(id);
      if (!f) {
        f = { phase: 0, lastX: 0, lastY: 0, squash: 1, nextBlink: now + 1500 + Math.random() * 3000, blinkT: 0, falling: false };
        fx.set(id, f);
      }
      return f;
    }

    function drawPlayers(s: Snapshot, now: number, dtMs: number) {
      if (!ctx) return;
      for (const p of s.p) {
        if (p.en) continue;
        const f = getFx(p.id, now);
        const dx = p.x - f.lastX;
        const dy = p.y - f.lastY;
        f.lastX = p.x;
        f.lastY = p.y;
        // walk cycle
        if (Math.abs(dx) > 0.2 && Math.abs(dy) < 1) f.phase += dx * 0.16;
        // squash & stretch
        const rising = dy < -1.2;
        const fallingNow = dy > 1.2;
        if (f.falling && !fallingNow && Math.abs(dy) < 0.8) f.squash = 0.78; // landed
        f.falling = fallingNow;
        let target = 1;
        if (rising) target = 1.12;
        else if (fallingNow) target = 1.06;
        f.squash += (target - f.squash) * Math.min(1, dtMs / 90);
        // blink
        if (f.blinkT > 0) f.blinkT -= dtMs;
        else if (now > f.nextBlink) {
          f.blinkT = 130;
          f.nextBlink = now + 1800 + Math.random() * 3200;
        }

        const col = p.dd ? "#b9bdc4" : COLORS[p.i % COLORS.length];
        const cx = p.x + PW / 2;
        const bottom = p.y + PH;
        const sy = p.dd ? 1 : f.squash;
        const sx = 1 / Math.sqrt(sy);

        ctx.save();
        if (p.dd) ctx.globalAlpha = 0.55;
        ctx.translate(cx, bottom);
        ctx.scale(sx, sy);

        // legs (walk animation)
        const legLift = Math.sin(f.phase) * 3;
        const moving = Math.abs(dx) > 0.2;
        ctx.fillStyle = shade(col, 0.62);
        ctx.beginPath();
        ctx.roundRect(-11, -6 - (moving ? Math.max(0, legLift) : 0), 8, 6 + (moving ? Math.max(0, legLift) : 0), 2);
        ctx.fill();
        ctx.beginPath();
        ctx.roundRect(3, -6 - (moving ? Math.max(0, -legLift) : 0), 8, 6 + (moving ? Math.max(0, -legLift) : 0), 2);
        ctx.fill();

        // body
        ctx.fillStyle = col;
        ctx.beginPath();
        ctx.roundRect(-PW / 2, -PH, PW, PH - 4, 7);
        ctx.fill();

        // eyes: black vertical ovals, offset toward facing direction
        const eyeY = -PH + 12;
        const eo = p.d * 2.5;
        if (p.dd) {
          ctx.strokeStyle = INK;
          ctx.lineWidth = 2;
          for (const off of [-6, 6]) {
            ctx.beginPath();
            ctx.moveTo(off + eo - 3, eyeY - 3);
            ctx.lineTo(off + eo + 3, eyeY + 3);
            ctx.moveTo(off + eo + 3, eyeY - 3);
            ctx.lineTo(off + eo - 3, eyeY + 3);
            ctx.stroke();
          }
        } else if (f.blinkT > 0) {
          ctx.strokeStyle = INK;
          ctx.lineWidth = 2;
          for (const off of [-6, 6]) {
            ctx.beginPath();
            ctx.moveTo(off + eo - 3, eyeY);
            ctx.lineTo(off + eo + 3, eyeY);
            ctx.stroke();
          }
        } else {
          ctx.fillStyle = INK;
          for (const off of [-6, 6]) {
            ctx.beginPath();
            ctx.ellipse(off + eo, eyeY, 3, 4.6, 0, 0, Math.PI * 2);
            ctx.fill();
          }
        }
        ctx.restore();

        // held key above head
        if (p.k) drawKeyIcon(cx, p.y - 14 + Math.sin(now / 280) * 2, 0.8);
        // "YOU" marker, lobby only
        if (p.id === myId && s.ph === "lobby") {
          ctx.fillStyle = "#9aa0a8";
          ctx.font = font(600, 12);
          ctx.textAlign = "center";
          ctx.textBaseline = "alphabetic";
          ctx.fillText("YOU", cx, p.y - 8);
        }
      }
      // prune fx for gone players
      if (fx.size > s.p.length + 4) {
        const ids = new Set(s.p.map((p) => p.id));
        for (const id of fx.keys()) if (!ids.has(id)) fx.delete(id);
      }
    }

    function colorText(text: string, x: number, y: number, size: number, now: number, bounce = 0) {
      if (!ctx) return;
      ctx.font = font(700, size);
      ctx.textBaseline = "middle";
      ctx.textAlign = "left";
      const widths = [...text].map((c) => ctx.measureText(c).width);
      const total = widths.reduce((a, b) => a + b, 0);
      let tx = x - total / 2;
      let ci = 0;
      for (let i = 0; i < text.length; i++) {
        const c = text[i];
        if (c !== " ") {
          const by = bounce ? Math.sin(now / 260 + i * 0.7) * bounce : 0;
          ctx.fillStyle = COLORS[ci % COLORS.length];
          ctx.fillText(c, tx, y + by);
          ci++;
        }
        tx += widths[i];
      }
    }

    function inkText(text: string, x: number, y: number, size: number, weight = 700, color = INK) {
      if (!ctx) return;
      ctx.font = font(weight, size);
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillStyle = color;
      ctx.fillText(text, x, y);
    }

    function drawLobby(s: Snapshot, now: number) {
      if (!ctx) return;
      colorText("PICO PARK", W / 2, 150, 92, now, 5);
      inkText("2-8 PLAYERS  ·  LOCAL CO-OP", W / 2, 222, 20, 600, "#9aa0a8");
      inkText(`PLAYERS: ${s.n}`, W / 2, 272, 26, 700);
      if (s.n < 2) {
        inkText("Хамтрагчаа урь — өөр цонхонд энэ хуудсыг нээ!", W / 2, 308, 16, 600, "#e8534f");
      }
      if (Math.floor(now / 600) % 2 === 0) {
        inkText("PRESS ENTER TO START", W / 2, 372, 30, 700);
      }
      inkText("← → / A D : хөдлөх     SPACE / ↑ : үсрэх", W / 2, 428, 17, 600, "#9aa0a8");
    }

    let lastFrame = 0;
    function draw(now: number) {
      if (!ctx) return;
      const dtMs = lastFrame ? Math.min(100, now - lastFrame) : 16;
      lastFrame = now;
      ctx.clearRect(0, 0, W, H);
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, W, H);

      const s = lerped(now);

      if (serverFull) {
        inkText("SERVER FULL (MAX 8)", W / 2, H / 2, 36, 700, "#e8534f");
        raf = requestAnimationFrame(draw);
        return;
      }
      if (!s || !level) {
        inkText(everConnected ? "RECONNECTING..." : "CONNECTING...", W / 2, H / 2, 30, 600, "#9aa0a8");
        raf = requestAnimationFrame(draw);
        return;
      }

      drawTiles(s);
      drawDoor(s);
      drawKey(s, now);
      drawPlayers(s, now, dtMs);

      if (s.ph === "lobby") {
        drawLobby(s, now);
      } else {
        // minimal HUD: level top-left, mini player faces top-right
        ctx.font = font(700, 24);
        ctx.textAlign = "left";
        ctx.textBaseline = "top";
        ctx.fillStyle = INK;
        ctx.fillText(`LEVEL ${s.lv + 1}`, 16, 12);
        let mx = W - 16;
        for (let i = s.p.length - 1; i >= 0; i--) {
          const p = s.p[i];
          mx -= 20;
          ctx.fillStyle = p.dd ? "#c9ccd2" : COLORS[p.i % COLORS.length];
          ctx.beginPath();
          ctx.roundRect(mx, 14, 16, 16, 4);
          ctx.fill();
          if (p.en) {
            ctx.strokeStyle = "#ffffff";
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(mx + 4, 22);
            ctx.lineTo(mx + 7, 25);
            ctx.lineTo(mx + 12, 18);
            ctx.stroke();
          } else {
            ctx.fillStyle = INK;
            ctx.beginPath();
            ctx.ellipse(mx + 6, 21, 1.6, 2.4, 0, 0, Math.PI * 2);
            ctx.ellipse(mx + 11, 21, 1.6, 2.4, 0, 0, Math.PI * 2);
            ctx.fill();
          }
        }
        ctx.font = font(600, 13);
        ctx.textAlign = "left";
        ctx.fillStyle = "#c9ccd2";
        ctx.fillText("R : RESTART", 16, H - 26);
      }

      if (s.ph === "play" && s.it > 0) {
        const alpha = Math.min(1, s.it / 0.6);
        ctx.fillStyle = `rgba(255,255,255,${0.96 * alpha})`;
        ctx.fillRect(0, 0, W, H);
        ctx.save();
        ctx.globalAlpha = alpha;
        inkText(`LEVEL ${s.lv + 1}`, W / 2, H / 2 - 26, 76, 700);
        inkText(level.name, W / 2, H / 2 + 42, 24, 600, "#9aa0a8");
        ctx.restore();
      }

      if (s.ph === "clear") {
        ctx.fillStyle = "rgba(255,255,255,0.92)";
        ctx.fillRect(0, 0, W, H);
        colorText("CLEAR!", W / 2, H / 2, 90, now, 6);
      }

      if (s.ph === "allclear") {
        ctx.fillStyle = "rgba(255,255,255,0.97)";
        ctx.fillRect(0, 0, W, H);
        colorText("THANK YOU", W / 2, H / 2 - 70, 64, now, 5);
        colorText("FOR PLAYING!", W / 2, H / 2 + 4, 64, now, 5);
        if (Math.floor(now / 600) % 2 === 0) {
          inkText("PRESS ENTER", W / 2, H / 2 + 90, 24, 700);
        }
      }

      if (!connected && everConnected && !serverFull) {
        inkText("RECONNECTING...", W / 2, 40, 20, 700, "#e8534f");
      }

      raf = requestAnimationFrame(draw);
    }
    raf = requestAnimationFrame(draw);

    return () => {
      closed = true;
      clearTimeout(connectT);
      if (reconnectT) clearTimeout(reconnectT);
      cancelAnimationFrame(raf);
      window.removeEventListener("keydown", kd);
      window.removeEventListener("keyup", ku);
      window.removeEventListener("blur", onBlur);
      canvas.removeEventListener("click", onClick);
      try {
        ws?.close();
      } catch {}
    };
  }, []);

  return (
    <div className="flex min-h-screen flex-1 items-center justify-center bg-white">
      <canvas
        ref={canvasRef}
        width={W}
        height={H}
        style={{ width: "min(100vw, calc(100dvh * 1.7647))", height: "auto" }}
      />
    </div>
  );
}
