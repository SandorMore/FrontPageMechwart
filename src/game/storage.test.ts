import { describe, expect, it } from 'vitest'
import { deal, newGame, placeBet } from './engine'
import { parseSave } from './storage'

describe('saved games', () => {
  it('round-trips a game in the middle of a round', () => {
    const s = deal(placeBet(newGame(1), 0, 1000))
    expect(parseSave(JSON.stringify(s))).toEqual(s)
  })

  it('rejects missing, broken or tampered saves', () => {
    const good = newGame(1)
    expect(parseSave(null)).toBeNull()
    expect(parseSave('{not json')).toBeNull()
    expect(parseSave(JSON.stringify({ ...good, version: 2 }))).toBeNull()
    expect(parseSave(JSON.stringify({ ...good, balance: -5 }))).toBeNull()
    expect(parseSave(JSON.stringify({ ...good, balance: 1.5 }))).toBeNull()
    expect(parseSave(JSON.stringify({ ...good, phase: 'cheating' }))).toBeNull()
    expect(parseSave(JSON.stringify({ ...good, spotCount: 9 }))).toBeNull()
    expect(parseSave(JSON.stringify({ ...good, bets: [1, 2] }))).toBeNull()
  })
})
