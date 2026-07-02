'use strict'

const { LEVELS, LOBBY, COLS, ROWS } = require('./levels')

const TILE = 32
const W = COLS * TILE // 960
const H = ROWS * TILE // 544
const PW = 30
const PH = 30
const SPEED = 220
const GRAV = 2200
const JUMP_V = 800
const MAX_FALL = 1000
const MAX_PLAYERS = 8

function aabb(ax, ay, aw, ah, bx, by, bw, bh) {
  return ax < bx + bw && ax + aw > bx && ay < by + bh && ay + ah > by
}

function parseLevel(def) {
  const lv = {
    name: def.name,
    tiles: def.tiles,
    spawn: { c: 2, r: ROWS - 2 },
    key: null,
    door: null,
    buttons: [],
    spikes: [],
    hasGate: false,
  }
  const buttonMap = new Map()
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const ch = def.tiles[r][c]
      if (ch === 'S') lv.spawn = { c, r }
      else if (ch === 'K') lv.key = { x: c * TILE + 4, y: r * TILE + 4, w: TILE - 8, h: TILE - 8 }
      else if (ch === 'D') lv.door = { x: c * TILE, y: (r - 1) * TILE, w: TILE, h: TILE * 2 }
      else if (ch === '^') lv.spikes.push({ x: c * TILE + 5, y: r * TILE + 14, w: TILE - 10, h: TILE - 14 })
      else if (ch >= '1' && ch <= '8') {
        if (!buttonMap.has(ch)) buttonMap.set(ch, { ch, requires: Number(ch), tiles: [], locked: false, count: 0 })
        buttonMap.get(ch).tiles.push({ c, r })
      } else if (ch === 'G') lv.hasGate = true
    }
  }
  lv.buttons = [...buttonMap.values()]
  return lv
}

class Game {
  constructor() {
    this.players = new Map()
    this.phase = 'lobby' // lobby | play | clear | allclear
    this.levelIdx = -1
    this.introT = 0
    this.clearT = 0
    this.level = parseLevel(LOBBY)
    this.resetLevelState()
  }

  levelKey() {
    return this.phase === 'lobby' ? 'lobby' : 'L' + this.levelIdx
  }

  levelMsg() {
    return {
      t: 'level',
      idx: this.phase === 'lobby' ? -1 : this.levelIdx,
      name: this.level.name,
      tiles: this.level.tiles,
      total: LEVELS.length,
    }
  }

  resetLevelState() {
    this.keyTaken = false
    this.keyHeldBy = null
    this.keyUsed = false
    this.doorOpen = false
    for (const b of this.level.buttons) {
      b.locked = false
      b.count = 0
    }
    for (const p of this.players.values()) this.respawn(p)
  }

  gatesOpen() {
    if (!this.level.hasGate) return true
    return this.level.buttons.length > 0 && this.level.buttons.every((b) => b.locked)
  }

  solidAt(c, r) {
    if (c < 0 || c >= COLS) return true
    if (r < 0 || r >= ROWS) return false
    const ch = this.level.tiles[r][c]
    if (ch === '#') return true
    if (ch === 'G') return !this.gatesOpen()
    return false
  }

  respawn(p) {
    const s = this.level.spawn
    p.x = Math.min(s.c * TILE + p.idx * (PW + 6), W - PW)
    p.y = (s.r + 1) * TILE - PH
    p.vx = 0
    p.vy = 0
    p.dir = 1
    p.dead = false
    p.deadT = 0
    p.entered = false
    p.grounded = false
    p.standOn = null
    p.jumpBuf = 0
  }

  freeIdx() {
    const used = new Set([...this.players.values()].map((p) => p.idx))
    for (let i = 0; i < MAX_PLAYERS; i++) if (!used.has(i)) return i
    return -1
  }

  addPlayer(id) {
    const idx = this.freeIdx()
    if (idx < 0) return null
    const p = {
      id,
      idx,
      x: 0,
      y: 0,
      x0: 0,
      vx: 0,
      vy: 0,
      dir: 1,
      grounded: false,
      standOn: null,
      input: { l: 0, r: 0, j: 0 },
      prevJ: false,
      jumpBuf: 0,
      dead: false,
      deadT: 0,
      entered: false,
    }
    this.players.set(id, p)
    this.respawn(p)
    return p
  }

  removePlayer(id) {
    const p = this.players.get(id)
    if (!p) return
    if (this.keyHeldBy === id && !this.keyUsed) {
      this.keyHeldBy = null
      this.keyTaken = false
    }
    this.players.delete(id)
    if (this.players.size === 0) this.toLobby()
  }

  setInput(id, m) {
    const p = this.players.get(id)
    if (!p) return
    p.input.l = m.l ? 1 : 0
    p.input.r = m.r ? 1 : 0
    p.input.j = m.j ? 1 : 0
  }

  start() {
    if (this.phase === 'lobby' && this.players.size >= 1) this.startLevel(0)
  }

  toLobby() {
    this.phase = 'lobby'
    this.levelIdx = -1
    this.introT = 0
    this.clearT = 0
    this.level = parseLevel(LOBBY)
    this.resetLevelState()
  }

  restartLevel() {
    if (this.phase === 'play') this.startLevel(this.levelIdx)
  }

  startLevel(idx) {
    this.levelIdx = idx
    this.level = parseLevel(LEVELS[idx])
    this.phase = 'play'
    this.introT = 2
    this.clearT = 0
    this.resetLevelState()
  }

  kill(p) {
    if (p.dead) return
    p.dead = true
    p.deadT = 1
    if (this.keyHeldBy === p.id && !this.keyUsed) {
      this.keyHeldBy = null
      this.keyTaken = false
    }
  }

  // Move horizontally against tiles and canvas edges; returns actual delta.
  moveX(p, dx) {
    const x0 = p.x
    let nx = p.x + dx
    if (nx < 0) nx = 0
    if (nx > W - PW) nx = W - PW
    const r0 = Math.floor(p.y / TILE)
    const r1 = Math.floor((p.y + PH - 0.001) / TILE)
    if (nx > x0) {
      const c = Math.floor((nx + PW - 0.001) / TILE)
      for (let r = r0; r <= r1; r++) {
        if (this.solidAt(c, r)) {
          nx = Math.min(nx, c * TILE - PW)
          break
        }
      }
    } else if (nx < x0) {
      const c = Math.floor(nx / TILE)
      for (let r = r0; r <= r1; r++) {
        if (this.solidAt(c, r)) {
          nx = Math.max(nx, (c + 1) * TILE)
          break
        }
      }
    }
    p.x = nx
    return nx - x0
  }

  moveY(p, dy) {
    let ny = p.y + dy
    const c0 = Math.floor(p.x / TILE)
    const c1 = Math.floor((p.x + PW - 0.001) / TILE)
    if (dy > 0) {
      const r = Math.floor((ny + PH - 0.001) / TILE)
      for (let c = c0; c <= c1; c++) {
        if (this.solidAt(c, r)) {
          ny = r * TILE - PH
          p.vy = 0
          p.grounded = true
          break
        }
      }
    } else if (dy < 0) {
      const r = Math.floor(ny / TILE)
      for (let c = c0; c <= c1; c++) {
        if (this.solidAt(c, r)) {
          ny = (r + 1) * TILE
          p.vy = 0
          break
        }
      }
    }
    p.y = ny
  }

  tick(dt) {
    if (this.introT > 0) this.introT -= dt
    if (this.phase === 'clear') {
      this.clearT -= dt
      if (this.clearT <= 0) {
        if (this.levelIdx + 1 < LEVELS.length) this.startLevel(this.levelIdx + 1)
        else this.phase = 'allclear'
      }
    }

    for (const p of this.players.values()) {
      if (p.dead) {
        p.deadT -= dt
        if (p.deadT <= 0) this.respawn(p)
      }
    }

    if (this.phase !== 'lobby' && this.phase !== 'play') return

    const list = [...this.players.values()].filter((p) => !p.dead && !p.entered)

    // integrate each player against tiles
    for (const p of list) {
      p.x0 = p.x
      const move = (p.input.r ? 1 : 0) - (p.input.l ? 1 : 0)
      p.vx = move * SPEED
      if (move) p.dir = move
      const j = !!p.input.j
      if (j && !p.prevJ) p.jumpBuf = 0.1
      p.prevJ = j
      if (p.jumpBuf > 0) {
        p.jumpBuf -= dt
        if (p.grounded) {
          p.vy = -JUMP_V
          p.jumpBuf = 0
        }
      }
      p.vy += GRAV * dt
      if (p.vy > MAX_FALL) p.vy = MAX_FALL
      p.grounded = false
      p.standOn = null
      this.moveX(p, p.vx * dt)
      this.moveY(p, p.vy * dt)
    }

    // player-vs-player: stand on heads, headbutt lifts, horizontal pushing
    for (let it = 0; it < 3; it++) {
      for (let i = 0; i < list.length; i++) {
        for (let j = i + 1; j < list.length; j++) {
          const a = list[i]
          const b = list[j]
          const penX = Math.min(a.x + PW, b.x + PW) - Math.max(a.x, b.x)
          const penY = Math.min(a.y + PH, b.y + PH) - Math.max(a.y, b.y)
          if (penX <= 0 || penY <= 0) continue
          if (penY <= penX) {
            const top = a.y <= b.y ? a : b
            const bot = top === a ? b : a
            top.y -= penY
            const r = Math.floor(top.y / TILE)
            const c0 = Math.floor(top.x / TILE)
            const c1 = Math.floor((top.x + PW - 0.001) / TILE)
            for (let c = c0; c <= c1; c++) {
              if (this.solidAt(c, r)) {
                top.y = (r + 1) * TILE
                break
              }
            }
            if (top.vy > 0) top.vy = 0
            if (bot.vy < 0) top.vy = Math.min(top.vy, bot.vy)
            top.grounded = true
            top.standOn = bot.id
          } else {
            const dir = a.x + PW / 2 <= b.x + PW / 2 ? -1 : 1
            const half = penX / 2
            this.moveX(a, dir * half)
            this.moveX(b, -dir * half)
            const still = Math.min(a.x + PW, b.x + PW) - Math.max(a.x, b.x)
            if (still > 0.01) {
              this.moveX(a, dir * still)
              const st2 = Math.min(a.x + PW, b.x + PW) - Math.max(a.x, b.x)
              if (st2 > 0.01) this.moveX(b, -dir * st2)
            }
          }
        }
      }
    }

    // riders follow their carrier's horizontal movement (bottom of stack first)
    const byDepth = [...list].sort((p, q) => q.y - p.y)
    for (const p of byDepth) {
      if (!p.standOn) continue
      const c = this.players.get(p.standOn)
      if (!c) continue
      const cdx = c.x - c.x0
      if (cdx) this.moveX(p, cdx)
    }

    // hazards
    for (const p of list) {
      for (const s of this.level.spikes) {
        if (aabb(p.x, p.y, PW, PH, s.x, s.y, s.w, s.h)) {
          this.kill(p)
          break
        }
      }
      if (!p.dead && p.y > H + 60) this.kill(p)
    }

    if (this.phase !== 'play') return

    const alive = list.filter((p) => !p.dead)

    for (const b of this.level.buttons) {
      if (b.locked) continue
      let count = 0
      for (const p of alive) {
        const on = b.tiles.some((t) => aabb(p.x, p.y, PW, PH, t.c * TILE, t.r * TILE + TILE - 12, TILE, 12))
        if (on) count++
      }
      b.count = count
      if (count >= b.requires) b.locked = true
    }

    const k = this.level.key
    if (k && !this.keyTaken && !this.keyUsed) {
      for (const p of alive) {
        if (aabb(p.x, p.y, PW, PH, k.x, k.y, k.w, k.h)) {
          this.keyTaken = true
          this.keyHeldBy = p.id
          break
        }
      }
    }

    const d = this.level.door
    if (d && !this.doorOpen && this.keyTaken && !this.keyUsed && this.keyHeldBy) {
      const holder = this.players.get(this.keyHeldBy)
      if (holder && !holder.dead && !holder.entered && aabb(holder.x, holder.y, PW, PH, d.x, d.y, d.w, d.h)) {
        this.doorOpen = true
        this.keyUsed = true
      }
    }

    if (d && this.doorOpen) {
      for (const p of alive) {
        const cx = p.x + PW / 2
        const cy = p.y + PH / 2
        if (cx > d.x && cx < d.x + d.w && cy > d.y && cy < d.y + d.h) p.entered = true
      }
    }

    if (this.players.size > 0 && [...this.players.values()].every((p) => p.entered)) {
      this.phase = 'clear'
      this.clearT = 2.5
    }
  }

  snapshot() {
    const r1 = (v) => Math.round(v * 10) / 10
    return {
      t: 's',
      ph: this.phase,
      lv: this.levelIdx,
      it: this.introT > 0 ? r1(this.introT) : 0,
      n: this.players.size,
      p: [...this.players.values()].map((p) => ({
        id: p.id,
        i: p.idx,
        x: r1(p.x),
        y: r1(p.y),
        d: p.dir,
        dd: p.dead ? 1 : 0,
        en: p.entered ? 1 : 0,
        k: this.keyHeldBy === p.id && this.keyTaken && !this.keyUsed ? 1 : 0,
      })),
      key: this.level.key
        ? { x: this.level.key.x, y: this.level.key.y, tk: this.keyTaken ? 1 : 0, us: this.keyUsed ? 1 : 0 }
        : null,
      dr: this.doorOpen ? 1 : 0,
      go: this.level.hasGate && this.gatesOpen() ? 1 : 0,
      bt: this.level.buttons.map((b) => ({ ch: b.ch, q: b.requires, l: b.locked ? 1 : 0, c: b.count })),
    }
  }
}

module.exports = { Game, TILE, COLS, ROWS, W, H, PW, PH, MAX_PLAYERS }
