import { handValue, type Card } from './game/cards'

const number = new Intl.NumberFormat('en-US')

export const chips = (n: number) => number.format(n)

export const signedChips = (n: number) => (n > 0 ? `+${chips(n)}` : n < 0 ? `−${chips(-n)}` : '0')

/** Short chip label: 500, 1K, 25K. */
export const chipLabel = (n: number) => (n >= 1000 ? `${n / 1000}K` : String(n))

export function countdown(ms: number): string {
  const total = Math.ceil(ms / 1000)
  const m = Math.floor(total / 60)
  const s = total % 60
  return `${m}:${String(s).padStart(2, '0')}`
}

/** "17", or "7/17" for a soft hand that can still take cards. */
export function totalLabel(cards: Card[], final: boolean): string {
  const { total, soft } = handValue(cards)
  if (soft && total < 21 && !final) return `${total - 10}/${total}`
  return String(total)
}

const SUIT_SYMBOL: Record<string, string> = { S: '♠', H: '♥', D: '♦', C: '♣' }
const SUIT_NAME: Record<string, string> = { S: 'spades', H: 'hearts', D: 'diamonds', C: 'clubs' }
const RANK_NAME: Record<string, string> = { A: 'Ace', T: '10', J: 'Jack', Q: 'Queen', K: 'King' }

export function cardFace(card: Card) {
  const rank = card[0] === 'T' ? '10' : card[0]
  return {
    rank,
    suit: SUIT_SYMBOL[card[1]],
    red: card[1] === 'H' || card[1] === 'D',
    label: `${RANK_NAME[card[0]] ?? card[0]} of ${SUIT_NAME[card[1]]}`,
  }
}
