'use strict'

const { createServer } = require('http')
const next = require('next')
const { WebSocketServer } = require('ws')
const { Game } = require('./game/engine')

const port = parseInt(process.env.PORT || '3000', 10)
const dev = process.env.NODE_ENV !== 'production'
const app = next({ dev })
const handle = app.getRequestHandler()

app.prepare().then(() => {
  const nextUpgrade = app.getUpgradeHandler()
  const server = createServer((req, res) => handle(req, res))
  const wss = new WebSocketServer({ noServer: true })
  const game = new Game()
  const sockets = new Map() // id -> ws
  let nextId = 1

  // Route /ws upgrades to the game, everything else (HMR) to Next.js
  server.on('upgrade', (req, socket, head) => {
    let pathname = ''
    try {
      pathname = new URL(req.url, 'http://localhost').pathname
    } catch {
      socket.destroy()
      return
    }
    if (pathname === '/ws') {
      wss.handleUpgrade(req, socket, head, (ws) => wss.emit('connection', ws, req))
    } else {
      nextUpgrade(req, socket, head)
    }
  })

  wss.on('connection', (ws) => {
    const id = 'p' + nextId++
    const player = game.addPlayer(id)
    if (!player) {
      ws.send(JSON.stringify({ t: 'full' }))
      ws.close()
      return
    }
    sockets.set(id, ws)
    ws.isAlive = true
    console.log(`+ player ${id} joined as P${player.idx + 1} (${game.players.size} online)`)

    ws.send(JSON.stringify({ t: 'hi', id, idx: player.idx }))
    ws.send(JSON.stringify(game.levelMsg()))

    ws.on('pong', () => {
      ws.isAlive = true
    })
    ws.on('message', (buf) => {
      let m
      try {
        m = JSON.parse(buf.toString())
      } catch {
        return
      }
      if (!m || typeof m !== 'object') return
      switch (m.t) {
        case 'in':
          game.setInput(id, m)
          break
        case 'start':
          game.start()
          break
        case 'restart':
          game.restartLevel()
          break
        case 'lobby':
          if (game.phase === 'allclear') game.toLobby()
          break
      }
    })
    ws.on('close', () => {
      sockets.delete(id)
      game.removePlayer(id)
      console.log(`- player ${id} left (${game.players.size} online)`)
    })
    ws.on('error', () => {})
  })

  function broadcast(str) {
    for (const ws of sockets.values()) {
      if (ws.readyState === 1) ws.send(str)
    }
  }

  // 60 Hz simulation, 30 Hz state broadcast
  const DT = 1 / 60
  let tickNo = 0
  let lastLevelKey = game.levelKey()
  setInterval(() => {
    game.tick(DT)
    tickNo++
    const lk = game.levelKey()
    if (lk !== lastLevelKey) {
      lastLevelKey = lk
      broadcast(JSON.stringify(game.levelMsg()))
    }
    if (tickNo % 2 === 0) broadcast(JSON.stringify(game.snapshot()))
  }, 1000 / 60)

  // drop dead connections
  setInterval(() => {
    for (const [id, ws] of sockets) {
      if (!ws.isAlive) {
        sockets.delete(id)
        game.removePlayer(id)
        ws.terminate()
        continue
      }
      ws.isAlive = false
      ws.ping()
    }
  }, 30000)

  server.listen(port, () => {
    console.log(`> PICO PARK ready on http://localhost:${port} (${dev ? 'dev' : 'production'})`)
  })
})
