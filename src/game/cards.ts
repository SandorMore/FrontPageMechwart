/** Two characters: rank (A, 2-9, T, J, Q, K) then suit (S, H, D, C). Example: "TH" is the ten of hearts. */
export type Card = string

export const RANKS = 'A23456789TJQK'
export const SUITS = 'SHDC'

/** Returns an integer in [0, n). */
export type RandomInt = (n: number) => number

/** Unbiased random integer from the browser's cryptographic generator. */
export const cryptoRandomInt: RandomInt = (n) => {
  const limit = Math.floor(0x1_0000_0000 / n) * n
  const buffer = new Uint32Array(1)
  for (;;) {
    crypto.getRandomValues(buffer)
    if (buffer[0] < limit) return buffer[0] % n
  }
}

/** A shuffled shoe of `decks` standard decks. Cards are drawn from the end. */
export function createShoe(decks: number, randomInt: RandomInt = cryptoRandomInt): Card[] {
  const shoe: Card[] = []
  for (let d = 0; d < decks; d++) {
    for (const suit of SUITS) for (const rank of RANKS) shoe.push(rank + suit)
  }
  // Fisher-Yates.
  for (let i = shoe.length - 1; i > 0; i--) {
    const j = randomInt(i + 1)
    ;[shoe[i], shoe[j]] = [shoe[j], shoe[i]]
  }
  return shoe
}

/** Blackjack value of one card, counting an ace as 11. */
export function cardValue(card: Card): number {
  const rank = card[0]
  if (rank === 'A') return 11
  if (rank === 'T' || rank === 'J' || rank === 'Q' || rank === 'K') return 10
  return Number(rank)
}

export interface HandValue {
  total: number
  /** True when an ace is still counted as 11. */
  soft: boolean
}

export function handValue(cards: Card[]): HandValue {
  let total = 0
  let aces = 0
  for (const card of cards) {
    total += cardValue(card)
    if (card[0] === 'A') aces++
  }
  while (total > 21 && aces > 0) {
    total -= 10
    aces--
  }
  return { total, soft: aces > 0 }
}

/** An ace and a ten-value card as the first two cards of an unsplit hand. */
export function isBlackjack(cards: Card[], fromSplit = false): boolean {
  return !fromSplit && cards.length === 2 && handValue(cards).total === 21
}

export function isTenValue(card: Card): boolean {
  return cardValue(card) === 10
}
