import { describe, expect, it } from 'vitest'
import { createShoe, handValue, isBlackjack } from './cards'
import {
  allowedActions,
  applyBonus,
  BONUS_AMOUNT,
  BONUS_INTERVAL_MS,
  bonusRemaining,
  chipsInPlay,
  clearBets,
  deal,
  dealerStep,
  DECKS,
  double,
  hit,
  insurance,
  MAX_BET,
  newGame,
  nextRound,
  placeBet,
  rebet,
  RESHUFFLE_AT,
  RuleError,
  setSpotCount,
  split,
  stand,
  surrender,
  type GameState,
} from './engine'

const T0 = 1_700_000_000_000

/** A game whose next cards come out in exactly this order (filler keeps the shoe from reshuffling). */
function rigged(order: string, bets: number[] = [1000], balance = 100_000): GameState {
  let s = newGame(T0)
  s.balance = balance
  s = setSpotCount(s, bets.length)
  bets.forEach((bet, spot) => {
    if (bet > 0) s = placeBet(s, spot, bet)
  })
  const drawOrder = order.split(' ')
  const filler = Array.from({ length: RESHUFFLE_AT + 10 }, () => '2C')
  s.shoe = [...filler, ...drawOrder.reverse()]
  return s
}

/** Plays the dealer out the way the UI does. */
function finish(s: GameState): GameState {
  while (s.phase === 'dealer') s = dealerStep(s)
  return s
}

const ruleError = (fn: () => unknown) => expect(fn).toThrow(RuleError)

describe('cards', () => {
  it('counts hands, soft and hard', () => {
    expect(handValue(['AS', '6H'])).toEqual({ total: 17, soft: true })
    expect(handValue(['AS', '6H', 'TD'])).toEqual({ total: 17, soft: false })
    expect(handValue(['AS', 'AH', '9D'])).toEqual({ total: 21, soft: true })
    expect(handValue(['KS', 'QH', '2D'])).toEqual({ total: 22, soft: false })
    expect(handValue(['AS', 'AH', 'AD', 'AC'])).toEqual({ total: 14, soft: true })
  })

  it('recognises blackjack only on two unsplit cards', () => {
    expect(isBlackjack(['AS', 'KH'])).toBe(true)
    expect(isBlackjack(['AS', 'KH'], true)).toBe(false)
    expect(isBlackjack(['7S', '7H', '7D'])).toBe(false)
  })

  it('builds a full shuffled shoe', () => {
    const shoe = createShoe(DECKS)
    expect(shoe).toHaveLength(DECKS * 52)
    expect(shoe.filter((c) => c === 'AS')).toHaveLength(DECKS)
    expect(createShoe(DECKS).join()).not.toBe(shoe.join())
  })
})

describe('betting', () => {
  it('moves chips from the balance to the spot and back', () => {
    let s = newGame(T0)
    expect(s.balance).toBe(BONUS_AMOUNT)
    s = placeBet(s, 0, 1000)
    s = placeBet(s, 2, 500)
    expect(s.balance).toBe(BONUS_AMOUNT - 1500)
    expect(chipsInPlay(s)).toBe(1500)
    s = clearBets(s)
    expect(s.balance).toBe(BONUS_AMOUNT)
  })

  it('rejects bad bets', () => {
    const s = newGame(T0)
    ruleError(() => placeBet(s, 0, 150)) // not a chip value
    ruleError(() => placeBet(s, 0, 60_000)) // more than the balance
    ruleError(() => placeBet(s, 4, 100)) // spot not in use (3 spots by default)
    ruleError(() => placeBet({ ...s, balance: 10 ** 7 }, 0, MAX_BET + 100))
    ruleError(() => deal(s)) // no bet
  })

  it('returns chips from spots that are switched off', () => {
    let s = setSpotCount(newGame(T0), 5)
    s = placeBet(s, 4, 2000)
    s = setSpotCount(s, 2)
    expect(s.balance).toBe(BONUS_AMOUNT)
    expect(s.bets[4]).toBe(0)
  })

  it('repeats the last bets', () => {
    let s = rigged('9S 7H TD 8C 9D TC', [1000, 500])
    s = finish(stand(stand(deal(s))))
    s = nextRound(s)
    const before = s.balance
    s = rebet(s)
    expect(s.bets.slice(0, 2)).toEqual([1000, 500])
    expect(s.balance).toBe(before - 1500)
  })
})

describe('dealing and payouts', () => {
  // Draw order for one hand: player, dealer up, player, dealer hole, then hits.
  it('pays a win 1 to 1', () => {
    let s = deal(rigged('TS 9H TD 8C')) // 20 vs 17
    s = finish(stand(s))
    expect(s.hands[0].outcome).toBe('win')
    expect(s.balance).toBe(100_000 + 1000)
    expect(s.roundNet).toBe(1000)
  })

  it('pays blackjack 3 to 2 without asking for a decision', () => {
    const s = deal(rigged('AS 9H KD 7C'))
    expect(s.phase).toBe('settled')
    expect(s.hands[0].outcome).toBe('blackjack')
    expect(s.balance).toBe(100_000 + 1500)
  })

  it('pushes a tie and keeps a busted hand lost even if the dealer busts', () => {
    // Hands T+8 = 18 and 6+9 = 15, dealer T+6 = 16; the second hand hits a 9, the dealer a 6.
    let s = deal(rigged('TS 6H TD 8S 9H 6D 9C 6C', [1000, 1000]))
    s = stand(s)
    s = hit(s) // 15 + 9 = bust
    expect(s.hands[1].outcome).toBe(null)
    s = finish(s) // dealer 16 + 6 = 22
    expect(s.hands.map((h) => h.outcome)).toEqual(['win', 'bust'])
    expect(s.balance).toBe(100_000 + 1000 - 1000)
  })

  it('dealer stands on soft 17 and hits 16', () => {
    let s = finish(stand(insurance(deal(rigged('TS AH 8D 6C')), false)))
    expect(s.dealer).toEqual(['AH', '6C'])
    expect(s.hands[0].outcome).toBe('win') // 18 vs soft 17
    s = finish(stand(deal(rigged('TS TH 9D 6C 5D'))))
    expect(handValue(s.dealer).total).toBe(21)
    expect(s.hands[0].outcome).toBe('lose')
  })

  it('pushes when both have blackjack', () => {
    const s = deal(rigged('AS KH QD AC'))
    expect(s.phase).toBe('settled')
    expect(s.hands[0].outcome).toBe('push')
    expect(s.balance).toBe(100_000)
  })

  it('dealer blackjack under a ten ends the round at once', () => {
    const s = deal(rigged('9S KH 9D AC', [1000, 0, 0]))
    expect(s.phase).toBe('settled')
    expect(s.hands[0].outcome).toBe('lose')
    expect(s.holeRevealed).toBe(true)
  })

  it('deals left to right with one card each per round', () => {
    const s = deal(rigged('2S 3S 4S 5S 6S 7S 8S 9S', [100, 100, 100]))
    expect(s.hands.map((h) => h.cards)).toEqual([
      ['2S', '6S'],
      ['3S', '7S'],
      ['4S', '8S'],
    ])
    expect(s.dealer).toEqual(['5S', '9S'])
  })
})

describe('insurance', () => {
  it('pays 2 to 1 when the dealer has blackjack', () => {
    let s = deal(rigged('TS AH 9D KC'))
    expect(s.phase).toBe('insurance')
    s = insurance(s, true)
    expect(s.phase).toBe('settled')
    expect(s.hands[0].outcome).toBe('lose')
    // Lost 1000 on the hand, won 2 x 500 on insurance: even.
    expect(s.balance).toBe(100_000)
  })

  it('is lost when the dealer has no blackjack, and play continues', () => {
    let s = insurance(deal(rigged('TS AH 9D 5C 3H')), true)
    expect(s.phase).toBe('playing')
    expect(s.balance).toBe(100_000 - 1000 - 500)
    s = finish(stand(s)) // dealer A+5+3 = soft 19 vs 19: push
    expect(s.hands[0].outcome).toBe('push')
    expect(s.balance).toBe(100_000 - 500)
  })

  it('can be declined', () => {
    const s = insurance(deal(rigged('TS AH 9D KC')), false)
    expect(s.balance).toBe(100_000 - 1000)
  })

  it('cannot be bought without the chips', () => {
    const s = deal(rigged('TS AH 9D KC', [1000], 1000))
    expect(s.balance).toBe(0)
    ruleError(() => insurance(s, true))
  })
})

describe('player options', () => {
  it('double takes one card and doubles the bet', () => {
    let s = deal(rigged('6S TH 5D 7C TD')) // 11 vs 17
    expect(allowedActions(s).double).toBe(true)
    s = double(s)
    expect(s.hands[0].cards).toHaveLength(3)
    expect(s.hands[0].bet).toBe(2000)
    s = finish(s)
    expect(s.hands[0].outcome).toBe('win')
    expect(s.balance).toBe(100_000 + 2000)
  })

  it('surrender returns half the bet', () => {
    const s = finish(surrender(deal(rigged('TS TH 6D 9C'))))
    expect(s.hands[0].outcome).toBe('surrender')
    expect(s.balance).toBe(100_000 - 500)
  })

  it('accepts 50K and 100K chips up to the table limit', () => {
    let s = newGame(T0)
    s.balance = 300_000
    s = placeBet(placeBet(s, 0, 50_000), 0, 50_000)
    expect(s.bets[0]).toBe(MAX_BET)
    s = placeBet(s, 1, 100_000)
    expect(s.bets[1]).toBe(100_000)
    ruleError(() => placeBet(s, 0, 50_000))
  })

  it('split makes two hands with a bet each', () => {
    // Pair of 8s vs dealer 6; each 8 gets a ten; dealer 6+T then T: bust.
    let s = deal(rigged('8S 6H 8D TC TD TH TS'))
    expect(allowedActions(s).split).toBe(true)
    s = split(s)
    expect(s.hands).toHaveLength(2)
    expect(s.hands.map((h) => h.cards)).toEqual([
      ['8S', 'TD'],
      ['8D', 'TH'],
    ])
    expect(s.balance).toBe(100_000 - 2000)
    s = stand(stand(s))
    s = finish(s)
    expect(s.hands.map((h) => h.outcome)).toEqual(['win', 'win'])
    expect(s.balance).toBe(100_000 + 2000)
  })

  it('split aces get one card each and 21 is not blackjack', () => {
    let s = deal(rigged('AS 9H AD 7C KD 5H')) // dealer 16 draws a 2 from the filler
    s = split(s)
    expect(s.phase).toBe('dealer')
    s = finish(s)
    expect(s.hands[0].outcome).toBe('win') // A+K = 21 but paid 1 to 1
    expect(s.hands[0].payout).toBe(2000)
    expect(s.hands[1].outcome).toBe('lose') // A+5 = 16 vs 18
  })

  it('limits splits and options to what the rules allow', () => {
    let s = deal(rigged('8S 6H 8D TC 8H 8C 8D 8S 2C 2C 2C 2C'))
    s = split(s) // [8,8] [8,8]
    s = split(s) // [8,8] [8,?] [8,8]
    s = split(s) // four hands on one spot
    expect(s.hands).toHaveLength(4)
    // Every hand keeps its own id, so the table can animate the new one.
    expect(s.hands.map((h) => h.id)).toEqual([0, 3, 2, 1])
    expect(allowedActions(s).split).toBe(false)
    expect(allowedActions(s).surrender).toBe(false)
    s = hit(s)
    expect(allowedActions(s).double).toBe(false)
  })

  it('21 ends a hand automatically', () => {
    const s = hit(deal(rigged('TS 9H 5D 8C 6H', [1000, 0])))
    expect(s.phase).toBe('dealer')
  })

  it('refuses actions out of turn', () => {
    const s = newGame(T0)
    ruleError(() => hit(s))
    ruleError(() => dealerStep(s))
    ruleError(() => insurance(s, true))
  })
})

describe('bonus', () => {
  it('pays every 45 minutes, without stacking missed periods', () => {
    let s = newGame(T0)
    expect(bonusRemaining(s, T0)).toBe(BONUS_INTERVAL_MS)
    expect(applyBonus(s, T0 + BONUS_INTERVAL_MS - 1)).toBe(s)
    s = applyBonus(s, T0 + BONUS_INTERVAL_MS)
    expect(s.balance).toBe(2 * BONUS_AMOUNT)
    s = applyBonus(s, T0 + 10 * BONUS_INTERVAL_MS) // away for hours: one bonus
    expect(s.balance).toBe(3 * BONUS_AMOUNT)
    expect(bonusRemaining(s, T0 + 10 * BONUS_INTERVAL_MS)).toBe(BONUS_INTERVAL_MS)
  })

  it('restarts the timer if the clock goes backwards', () => {
    const s = applyBonus(newGame(T0), T0 - 60_000)
    expect(s.lastBonusAt).toBe(T0 - 60_000)
    expect(s.balance).toBe(BONUS_AMOUNT)
  })
})

describe('random play', () => {
  const prng = (seed: number) => (n: number) => {
    seed = (seed * 1664525 + 1013904223) >>> 0
    return Math.floor((seed / 2 ** 32) * n)
  }

  it('keeps chips consistent over thousands of rounds and has a sane house edge', () => {
    const rand = prng(42)
    const makeShoe = () => createShoe(DECKS, rand)
    let s = newGame(T0, makeShoe)
    s.balance = 10 ** 9
    let wagered = 0
    const start = s.balance

    for (let round = 0; round < 5_000; round++) {
      const spots = 1 + rand(5)
      s = setSpotCount(s, spots)
      for (let spot = 0; spot < spots; spot++) s = placeBet(s, spot, 100 * (1 + rand(10)))
      const before = s.balance + chipsInPlay(s)
      s = deal(s, makeShoe)
      if (s.phase === 'insurance') s = insurance(s, false)

      while (s.phase === 'playing') {
        const allowed = allowedActions(s)
        const hand = s.hands[s.active!]
        const total = handValue(hand.cards).total
        const up = handValue([s.dealer[0]]).total
        // A rough basic strategy, so the measured edge is meaningful.
        if (allowed.split && (hand.cards[0][0] === 'A' || hand.cards[0][0] === '8')) s = split(s)
        else if (allowed.double && (total === 11 || (total === 10 && up < 10))) s = double(s)
        else if (total <= 11 || (total < 17 && up >= 7) || (total === 12 && up < 4)) s = hit(s)
        else s = stand(s)
      }
      s = finish(s)

      expect(s.phase).toBe('settled')
      const staked = s.hands.reduce((sum, h) => sum + h.bet + h.insurance, 0)
      const paid = s.hands.reduce((sum, h) => sum + h.payout, 0)
      expect(s.roundNet).toBe(paid - staked)
      // Nothing created or lost besides the round's result.
      expect(s.balance).toBe(before + s.roundNet!)
      expect(Number.isInteger(s.balance)).toBe(true)
      wagered += staked
      s = nextRound(s)
    }

    const edge = (start - s.balance) / wagered
    // Basic-strategy blackjack under these rules returns roughly 99 to 100.5%.
    expect(edge).toBeGreaterThan(-0.03)
    expect(edge).toBeLessThan(0.04)
    expect(s.stats.rounds).toBe(5_000)
  }, 120_000)
})
