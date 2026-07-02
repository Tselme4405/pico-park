'use strict'

// Tile legend:
//   .  empty
//   #  solid block
//   S  spawn point
//   K  key
//   D  door (occupies this row and the row above)
//   ^  spikes (deadly)
//   G  gate (solid until the button is locked)
//   1-8 button plate requiring that many players at once (locks open)

const COLS = 30
const ROWS = 17

const EMPTY = '..............................'
const FLOOR = '##############################'

const LOBBY = {
  name: 'LOBBY',
  tiles: [...Array(ROWS - 1).fill(EMPTY), FLOOR],
}

const LEVELS = [
  {
    name: 'RUN & JUMP',
    tiles: [
      EMPTY,
      EMPTY,
      EMPTY,
      EMPTY,
      EMPTY,
      EMPTY,
      '..............K...............',
      '..............###.............',
      EMPTY,
      EMPTY,
      '........####..................',
      EMPTY,
      EMPTY,
      '...####.......................',
      EMPTY,
      '.S.........................D..',
      FLOOR,
    ],
  },
  {
    name: 'STACK UP',
    tiles: [
      EMPTY,
      EMPTY,
      EMPTY,
      EMPTY,
      EMPTY,
      EMPTY,
      EMPTY,
      EMPTY,
      EMPTY,
      EMPTY,
      '............K.................',
      '...........####...............',
      EMPTY,
      EMPTY,
      EMPTY,
      '.S..........................D.',
      FLOOR,
    ],
  },
  {
    name: 'PRESS TOGETHER',
    tiles: [
      '..............#...............',
      '..............#...............',
      '..............#...............',
      '..............#...............',
      '..............#...............',
      '..............#...............',
      '..............#...............',
      '..............#...............',
      '..............#...............',
      '..............#...............',
      '..............#...............',
      '..............G...............',
      '..............G...............',
      '..............G......K........',
      '..............G.....###.......',
      '.S...22.......G............D..',
      FLOOR,
    ],
  },
  {
    name: 'DANGER ZONE',
    tiles: [
      EMPTY,
      EMPTY,
      EMPTY,
      EMPTY,
      EMPTY,
      EMPTY,
      EMPTY,
      EMPTY,
      '.........................D....',
      '........................###...',
      '.....................K........',
      '....................####......',
      '............................##',
      EMPTY,
      EMPTY,
      '.S..........^^^...............',
      '######....####################',
    ],
  },
]

function validate(def) {
  if (!Array.isArray(def.tiles) || def.tiles.length !== ROWS) {
    throw new Error(`level "${def.name}": expected ${ROWS} rows, got ${def.tiles.length}`)
  }
  def.tiles.forEach((row, i) => {
    if (typeof row !== 'string' || row.length !== COLS) {
      throw new Error(`level "${def.name}" row ${i}: expected ${COLS} chars, got ${row.length}`)
    }
  })
}

validate(LOBBY)
LEVELS.forEach(validate)

module.exports = { LEVELS, LOBBY, COLS, ROWS }
