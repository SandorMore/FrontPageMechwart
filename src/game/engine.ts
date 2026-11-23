import { createShoe, handValue, isBlackjack, isTenValue, type Card } from './cards'

// ---------------------------------------------------------------------------
// Table rules
// ---------------------------------------------------------------------------

export const DECKS = 6
/** A new shoe is shuffled before a round when fewer cards than this are left (75% penetration). */
export const RESHUFFLE_AT = (DECKS * 52) / 4
export const MAX_SPOTS = 5
export const MIN_BET = 100
export const MAX_BET = 100_000
/** Hands a single spot can be split into. */
export const MAX_HANDS_PER_SPOT = 4
export const CHIP_VALUES = [100, 500, 1_000, 5_000, 10_000, 25_000] as const

export const BONUS_AMOUNT = 50_000
export const BONUS_INTERVAL_MS = 45 * 60 * 1000

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

export type Phase = 'betting' | 'insurance' | 'playing' | 'dealer' | 'settled'
export type Outcome = 'blackjack' | 'win' | 'push' | 'lose' | 'bust' | 'surrender'

export interface PlayerHand {
  /** Betting spot this hand belongs to (0 = leftmost). */
  spot: number
  cards: Card[]
  bet: number
  /** Insurance staked on this hand (half the original bet), or 0. */
  insurance: number
  doubled: boolean
  fromSplit: boolean
  surrendered: boolean
  /** No more actions on this hand. */
  done: boolean
  outcome: Outcome | null
  /** Chips returned to the balance at settlement, stake included. */
  payout: number
}

export interface Notice {
  id: number
  text: string
}

export interface Stats {
  rounds: number
  handsWon: number
  handsLost: number
  pushes: number
  blackjacks: number
}

export interface GameState {
  version: 1
  balance: number
  phase: Phase
  /** Spots in use, 1 to MAX_SPOTS. */
  spotCount: number
  /** Chips on each spot while betting. Always MAX_SPOTS long. */
  bets: number[]
  /** Bets of the previous round, for "Rebet". */
  lastBets: number[]
  shoe: Card[]
  hands: PlayerHand[]
  dealer: Card[]
  holeRevealed: boolean
  /** Index into `hands` of the hand being played. */
  active: number | null
  /** Net chips won (positive) or lost in the last settled round. */
  roundNet: number | null
  lastBonusAt: number
  notice: Notice | null
  stats: Stats
}

export class RuleError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'RuleError'
  }
}

const zeros = () => Array.from({ length: MAX_SPOTS }, () => 0)

/** A fresh player: the first bonus is paid right away. */
export function newGame(now: number, makeShoe: () => Card[] = () => createShoe(DECKS)): GameState {
  return {
    version: 1,
    balance: BONUS_AMOUNT,
    phase: 'betting',
    spotCount: 3,
    bets: zeros(),
    lastBets: zeros(),
    shoe: makeShoe(),
    hands: [],
    dealer: [],
    holeRevealed: false,
    active: null,
    roundNet: null,
    lastBonusAt: now,
    notice: { id: now, text: `Welcome! Here are ${BONUS_AMOUNT.toLocaleString('en-US')} chips.` },
    stats: { rounds: 0, handsWon: 0, handsLost: 0, pushes: 0, blackjacks: 0 },
  }
}

function notify(s: GameState, text: string) {
  s.notice = { id: (s.notice?.id ?? 0) + 1, text }
}

// ---------------------------------------------------------------------------
// Bonus
// ---------------------------------------------------------------------------

/** Milliseconds until the next bonus. */
export function bonusRemaining(s: GameState, now: number): number {
  return Math.max(0, s.lastBonusAt + BONUS_INTERVAL_MS - now)
}

/**
 * Pays the bonus when 45 minutes have passed since the last one. Time away
 * does not stack: coming back after three hours pays one bonus, and the
 * timer starts again. Returns the same object when nothing changed.
 */
export function applyBonus(state: GameState, now: number): GameState {
  if (state.lastBonusAt > now) {
    // The clock was set back; restart the timer instead of waiting for the future.
    return { ...state, lastBonusAt: now }
  }
  if (now - state.lastBonusAt < BONUS_INTERVAL_MS) return state
  const s = structuredClone(state)
  s.balance += BONUS_AMOUNT
  s.lastBonusAt = now
  notify(s, `Bonus! +${BONUS_AMOUNT.toLocaleString('en-US')} chips`)
  return s
}

// ---------------------------------------------------------------------------
// Betting
// ---------------------------------------------------------------------------

function requirePhase(s: GameState, ...phases: Phase[]) {
  if (!phases.includes(s.phase)) throw new RuleError('Not now.')
}

export function setSpotCount(state: GameState, count: number): GameState {
  requirePhase(state, 'betting')
  if (!Number.isInteger(count) || count < 1 || count > MAX_SPOTS) throw new RuleError('Choose 1 to 5 spots.')
  const s = structuredClone(state)
  for (let i = count; i < MAX_SPOTS; i++) {
    s.balance += s.bets[i]
    s.bets[i] = 0
  }
  s.spotCount = count
  return s
}

export function placeBet(state: GameState, spot: number, amount: number): GameState {
  requirePhase(state, 'betting')
  if (!Number.isInteger(spot) || spot < 0 || spot >= state.spotCount) throw new RuleError('No such spot.')
  if (!Number.isInteger(amount) || amount <= 0 || amount % MIN_BET !== 0) throw new RuleError('Invalid chip.')
  if (amount > state.balance) throw new RuleError('Not enough chips.')
  if (state.bets[spot] + amount > MAX_BET) throw new RuleError(`The table limit is ${MAX_BET.toLocaleString('en-US')}.`)
  const s = structuredClone(state)
  s.balance -= amount
  s.bets[spot] += amount
  return s
}

export function clearSpot(state: GameState, spot: number): GameState {
  requirePhase(state, 'betting')
  const s = structuredClone(state)
  s.balance += s.bets[spot] ?? 0
  s.bets[spot] = 0
  return s
}

export function clearBets(state: GameState): GameState {
  requirePhase(state, 'betting')
  const s = structuredClone(state)
  s.balance += s.bets.reduce((a, b) => a + b, 0)
  s.bets = zeros()
  return s
}

/** Total chips needed to repeat the previous round's bets on the spots in use. */
export function rebetCost(s: GameState): number {
  return s.lastBets.slice(0, s.spotCount).reduce((a, b) => a + b, 0)
}

/** Puts the previous round's bets back on the table, replacing whatever is there. */
export function rebet(state: GameState): GameState {
  requirePhase(state, 'betting')
  const s = clearBets(state)
  const cost = rebetCost(s)
  if (cost === 0) throw new RuleError('No previous bets.')
  if (cost > s.balance) throw new RuleError('Not enough chips to repeat those bets.')
  for (let i = 0; i < s.spotCount; i++) s.bets[i] = s.lastBets[i]
  s.balance -= cost
  return s
}

// ---------------------------------------------------------------------------
// Dealing
// ---------------------------------------------------------------------------

function draw(s: GameState): Card {
  const card = s.shoe.pop()
  if (!card) throw new Error('The shoe is empty')
  return card
}

export function deal(state: GameState, makeShoe: () => Card[] = () => createShoe(DECKS)): GameState {
  requirePhase(state, 'betting')
  if (!state.bets.some((b) => b > 0)) throw new RuleError('Place a bet first.')
  const s = structuredClone(state)

  if (s.shoe.length < RESHUFFLE_AT) {
    s.shoe = makeShoe()
    notify(s, 'New shoe shuffled.')
  }

  s.lastBets = s.bets.slice()
  s.hands = []
  for (let spot = 0; spot < s.spotCount; spot++) {
    if (s.bets[spot] <= 0) continue
    s.hands.push({
      spot,
      cards: [],
      bet: s.bets[spot],
      insurance: 0,
      doubled: false,
      fromSplit: false,
      surrendered: false,
      done: false,
      outcome: null,
      payout: 0,
    })
  }
  s.bets = zeros()
  s.dealer = []
  s.holeRevealed = false
  s.roundNet = null
  s.active = null

  // One card to each hand, the dealer's up card, a second card each, the hole card.
  for (const hand of s.hands) hand.cards.push(draw(s))
  s.dealer.push(draw(s))
  for (const hand of s.hands) hand.cards.push(draw(s))
  s.dealer.push(draw(s))

  if (s.dealer[0][0] === 'A') {
    s.phase = 'insurance'
    return s
  }
  return afterPeek(s)
}

/** Chips needed to insure every hand. */
export function insuranceCost(s: GameState): number {
  return s.hands.reduce((sum, h) => sum + h.bet / 2, 0)
}

/** Answer to the insurance offer when the dealer shows an ace. Insurance pays 2 to 1. */
export function insurance(state: GameState, take: boolean): GameState {
  requirePhase(state, 'insurance')
  const s = structuredClone(state)
  if (take) {
    const cost = insuranceCost(s)
    if (cost > s.balance) throw new RuleError('Not enough chips for insurance.')
    for (const hand of s.hands) hand.insurance = hand.bet / 2
    s.balance -= cost
  }
  return afterPeek(s)
}

/** The dealer checks for blackjack under an ace or a ten. */
function afterPeek(s: GameState): GameState {
  const up = s.dealer[0]
  if ((up[0] === 'A' || isTenValue(up)) && isBlackjack(s.dealer)) {
    return settle(s)
  }
  for (const hand of s.hands) {
    if (isBlackjack(hand.cards)) hand.done = true
  }
  s.phase = 'playing'
  s.active = -1
  return advance(s)
}

// ---------------------------------------------------------------------------
// Player actions
// ---------------------------------------------------------------------------

function activeHand(s: GameState): PlayerHand {
  if (s.phase !== 'playing' || s.active === null) throw new RuleError('Not now.')
  return s.hands[s.active]
}

/** Moves to the next hand that still needs a decision, or hands over to the dealer. */
function advance(s: GameState): GameState {
  const start = s.active ?? -1
  for (let i = start + 1; i < s.hands.length; i++) {
    if (!s.hands[i].done) {
      s.active = i
      return s
    }
  }
  s.active = null
  s.holeRevealed = true
  const live = s.hands.some((h) => !h.surrendered && handValue(h.cards).total <= 21 && !isBlackjack(h.cards, h.fromSplit))
  if (!live) return settle(s)
  s.phase = 'dealer'
  return s
}

/** After a card lands: 21 or more ends the hand. */
function afterCard(s: GameState, hand: PlayerHand): GameState {
  if (handValue(hand.cards).total >= 21) {
    hand.done = true
    return advance(s)
  }
  return s
}

const isSplitAces = (hand: PlayerHand) => hand.fromSplit && hand.cards[0][0] === 'A'

export interface Allowed {
  hit: boolean
  stand: boolean
  double: boolean
  split: boolean
  surrender: boolean
}

export function allowedActions(s: GameState): Allowed {
  const none = { hit: false, stand: false, double: false, split: false, surrender: false }
  if (s.phase !== 'playing' || s.active === null) return none
  const hand = s.hands[s.active]
  const twoCards = hand.cards.length === 2
  const handsOnSpot = s.hands.filter((h) => h.spot === hand.spot).length
  return {
    hit: true,
    stand: true,
    double: twoCards && hand.bet <= s.balance,
    split:
      twoCards &&
      handValue([hand.cards[0]]).total === handValue([hand.cards[1]]).total &&
      handsOnSpot < MAX_HANDS_PER_SPOT &&
      !isSplitAces(hand) &&
      hand.bet <= s.balance,
    surrender: twoCards && !hand.fromSplit,
  }
}

export function hit(state: GameState): GameState {
  const s = structuredClone(state)
  const hand = activeHand(s)
  hand.cards.push(draw(s))
  return afterCard(s, hand)
}

export function stand(state: GameState): GameState {
  const s = structuredClone(state)
  activeHand(s).done = true
  return advance(s)
}

/** Doubles the bet, takes exactly one more card. */
export function double(state: GameState): GameState {
  if (!allowedActions(state).double) throw new RuleError('You cannot double now.')
  const s = structuredClone(state)
  const hand = activeHand(s)
  s.balance -= hand.bet
  hand.bet *= 2
  hand.doubled = true
  hand.cards.push(draw(s))
  hand.done = true
  return advance(s)
}

/** Splits a pair into two hands with one bet each. Split aces get one card each. */
export function split(state: GameState): GameState {
  if (!allowedActions(state).split) throw new RuleError('You cannot split now.')
  const s = structuredClone(state)
  const index = s.active!
  const hand = s.hands[index]
  s.balance -= hand.bet
  const second: PlayerHand = { ...hand, cards: [hand.cards[1]], insurance: 0, fromSplit: true }
  hand.cards = [hand.cards[0]]
  hand.fromSplit = true
  s.hands.splice(index + 1, 0, second)
  hand.cards.push(draw(s))
  second.cards.push(draw(s))

  if (hand.cards[0][0] === 'A') {
    hand.done = true
    second.done = true
    return advance(s)
  }
  if (handValue(second.cards).total === 21) second.done = true
  return afterCard(s, hand)
}

/** Gives up the hand for half the bet back. Only as the first decision on an unsplit hand. */
export function surrender(state: GameState): GameState {
  if (!allowedActions(state).surrender) throw new RuleError('You cannot surrender now.')
  const s = structuredClone(state)
  const hand = activeHand(s)
  hand.surrendered = true
  hand.done = true
  return advance(s)
}

// ---------------------------------------------------------------------------
// Dealer and settlement
// ---------------------------------------------------------------------------

/** The dealer draws to 17 and stands on all 17s, soft ones included. */
export function dealerMustHit(dealer: Card[]): boolean {
  return handValue(dealer).total < 17
}

/** One step of the dealer's turn: draw a card, or settle the round when done. */
export function dealerStep(state: GameState): GameState {
  requirePhase(state, 'dealer')
  const s = structuredClone(state)
  if (dealerMustHit(s.dealer)) {
    s.dealer.push(draw(s))
    return s
  }
  return settle(s)
}

function settle(s: GameState): GameState {
  s.holeRevealed = true
  s.active = null
  const dealer = handValue(s.dealer).total
  const dealerBlackjack = isBlackjack(s.dealer)
  let returned = 0
  let staked = 0

  for (const hand of s.hands) {
    const player = handValue(hand.cards).total
    const blackjack = isBlackjack(hand.cards, hand.fromSplit)
    let outcome: Outcome
    let main: number
    if (hand.surrendered) {
      outcome = 'surrender'
      main = hand.bet / 2
    } else if (player > 21) {
      outcome = 'bust'
      main = 0
    } else if (blackjack && dealerBlackjack) {
      outcome = 'push'
      main = hand.bet
    } else if (blackjack) {
      outcome = 'blackjack'
      main = hand.bet * 2.5
    } else if (dealerBlackjack) {
      outcome = 'lose'
      main = 0
    } else if (dealer > 21 || player > dealer) {
      outcome = 'win'
      main = hand.bet * 2
    } else if (player === dealer) {
      outcome = 'push'
      main = hand.bet
    } else {
      outcome = 'lose'
      main = 0
    }
    const insured = dealerBlackjack ? hand.insurance * 3 : 0
    hand.outcome = outcome
    hand.payout = main + insured
    hand.done = true
    returned += hand.payout
    staked += hand.bet + hand.insurance

    if (outcome === 'blackjack') s.stats.blackjacks++
    if (outcome === 'win' || outcome === 'blackjack') s.stats.handsWon++
    else if (outcome === 'push') s.stats.pushes++
    else s.stats.handsLost++
  }

  s.balance += returned
  s.roundNet = returned - staked
  s.stats.rounds++
  s.phase = 'settled'
  return s
}

/** Clears the table for the next round. */
export function nextRound(state: GameState): GameState {
  requirePhase(state, 'settled')
  const s = structuredClone(state)
  s.phase = 'betting'
  s.hands = []
  s.dealer = []
  s.holeRevealed = false
  s.active = null
  return s
}

/** Chips currently on the table (bets and insurance not yet settled). */
export function chipsInPlay(s: GameState): number {
  if (s.phase === 'betting') return s.bets.reduce((a, b) => a + b, 0)
  if (s.phase === 'settled') return 0
  return s.hands.reduce((sum, h) => sum + h.bet + h.insurance, 0)
}
