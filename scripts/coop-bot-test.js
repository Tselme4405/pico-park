'use strict'
// Two-bot co-op test for the PICO PARK server (level 2 "STACK UP").
// Bot A stands at the ledge edge; Bot B climbs onto A's head, jumps to the
// ledge, grabs the key, opens the door and enters it.

const WebSocket = require('ws')

const URL = 'ws://localhost:3000/ws'
const A_STAND_X = 285 // a step left of the ledge so the climber clears the underside

function makeBot(name) {
  const ws = new WebSocket(URL)
  const bot = {
    name,
    ws,
    id: null,
    state: null,
    input: { l: 0, r: 0, j: 0 },
    send(o) {
      if (ws.readyState === 1) ws.send(JSON.stringify(o))
    },
    setIn(l, r, j) {
      if (this.input.l !== l || this.input.r !== r || this.input.j !== j) {
        this.input = { l, r, j }
        this.send({ t: 'in', l, r, j })
      }
    },
    me() {
      if (!this.state || !this.id) return null
      return this.state.p.find((p) => p.id === this.id) || null
    },
  }
  ws.on('message', (buf) => {
    let m
    try { m = JSON.parse(buf.toString()) } catch { return }
    if (m.t === 'hi') bot.id = m.id
    else if (m.t === 's') bot.state = m
  })
  ws.on('error', (e) => console.log(name, 'ws error', e.message))
  return bot
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function waitFor(fn, timeoutMs, label) {
  const t0 = Date.now()
  while (Date.now() - t0 < timeoutMs) {
    if (fn()) return true
    await sleep(33)
  }
  console.log('TIMEOUT waiting for:', label)
  return false
}

async function walkTo(bot, x, tol = 6, timeoutMs = 15000) {
  const t0 = Date.now()
  for (;;) {
    const me = bot.me()
    if (me) {
      const dx = x - me.x
      if (Math.abs(dx) <= tol) {
        bot.setIn(0, 0, 0)
        return true
      }
      bot.setIn(dx < 0 ? 1 : 0, dx > 0 ? 1 : 0, 0)
    }
    if (Date.now() - t0 > timeoutMs) {
      bot.setIn(0, 0, 0)
      console.log(bot.name, 'walkTo timeout at', me && me.x)
      return false
    }
    await sleep(33)
  }
}

async function main() {
  const A = makeBot('botA')
  const B = makeBot('botB')
  await waitFor(() => A.id && B.id && A.state && B.state, 8000, 'both bots joined')
  console.log('joined:', A.id, B.id, 'phase:', A.state.ph, 'level:', A.state.lv)

  if (A.state.ph !== 'play' || A.state.lv !== 1) {
    console.log('NOTE: expected level index 1 (STACK UP); current:', A.state.ph, A.state.lv)
  }

  // Bot A takes position at the ledge edge and stays.
  await walkTo(A, A_STAND_X, 5)
  console.log('botA in position at x=', A.me().x)

  // Bot B: climb A, then the ledge, grab key, open door, enter.
  const posA = () => A.state.p.find((p) => p.id === A.id)
  let onLedge = false
  for (let attempt = 1; attempt <= 12 && !onLedge; attempt++) {
    await walkTo(B, A_STAND_X - 44, 8)
    // B may have shoved A while walking — put A back in position each try
    await walkTo(A, A_STAND_X, 4)
    // jump, then steer mid-air toward A's head (closed loop)
    B.setIn(0, 1, 1)
    await sleep(100)
    let onHead = false
    {
      const t0 = Date.now()
      while (Date.now() - t0 < 1600) {
        const me = B.me()
        const a = posA()
        if (me && a) {
          if (Math.abs(me.y - (a.y - 30)) < 2 && Math.abs(me.x - a.x) < 28) { onHead = true; break }
          const dx = a.x - me.x
          B.setIn(dx < -4 ? 1 : 0, dx > 4 ? 1 : 0, 0)
        }
        await sleep(33)
      }
      B.setIn(0, 0, 0)
    }
    if (!onHead) { console.log('miss head (attempt ' + attempt + ')'); continue }
    console.log('botB on botA head, y=', B.me().y)
    await sleep(150)
    // jump from the head, steer toward the middle of the ledge (x~390, top y=322)
    B.setIn(0, 1, 1)
    await sleep(100)
    {
      const t0 = Date.now()
      while (Date.now() - t0 < 1800) {
        const me = B.me()
        if (me) {
          if (Math.abs(me.y - 322) < 2 && me.x > 340 && me.x < 490) { onLedge = true; break }
          const dx = 390 - me.x
          B.setIn(dx < -4 ? 1 : 0, dx > 4 ? 1 : 0, 0)
        }
        await sleep(33)
      }
      B.setIn(0, 0, 0)
    }
    if (!onLedge) console.log('miss ledge (attempt ' + attempt + ')')
  }
  if (!onLedge) {
    console.log('FAIL: could not reach ledge')
    process.exit(1)
  }
  console.log('botB on ledge, y=', B.me().y, 'x=', B.me().x)

  // grab the key (at x~384..416 on the ledge)
  await walkTo(B, 400, 8)
  const gotKey = await waitFor(() => B.state.key && B.state.key.tk === 1, 3000, 'key pickup')
  const holder = B.state.p.find((p) => p.k === 1)
  console.log('key taken:', gotKey, 'held by:', holder && holder.id, '(botB is', B.id + ')')

  // walk right off the ledge and to the door (x~896)
  await walkTo(B, 700, 10)
  await walkTo(B, 900, 8)
  const doorOpen = await waitFor(() => B.state.dr === 1, 3000, 'door open')
  console.log('door open:', doorOpen)
  const entered = await waitFor(() => {
    const me = B.me()
    return me && me.en === 1
  }, 4000, 'botB entered')
  console.log('botB entered door:', entered)

  // Bot A also walks to the door and enters.
  await walkTo(A, 900, 8)
  const aEntered = await waitFor(() => {
    const me = A.me()
    return me && me.en === 1
  }, 5000, 'botA entered')
  console.log('botA entered door:', aEntered)

  console.log('final phase:', A.state.ph, '(clear happens only when ALL players including humans enter)')
  console.log('CO-OP TEST DONE — bots stay connected for 120s so you can play with them')
  setTimeout(() => process.exit(0), 120000)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
