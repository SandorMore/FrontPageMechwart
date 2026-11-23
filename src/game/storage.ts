import { MAX_SPOTS, type GameState } from './engine'

export const STORAGE_KEY = 'blackjack.v1'

const isCount = (v: unknown) => Number.isInteger(v) && (v as number) >= 0
const isCardList = (v: unknown) => Array.isArray(v) && v.every((c) => typeof c === 'string' && c.length === 2)
const isBetList = (v: unknown) => Array.isArray(v) && v.length === MAX_SPOTS && v.every(isCount)

/** Checks enough of the shape that a damaged or hand-edited save cannot crash the game. */
function isGameState(v: unknown): v is GameState {
  if (!v || typeof v !== 'object') return false
  const s = v as Record<string, unknown>
  return (
    s.version === 1 &&
    isCount(s.balance) &&
    ['betting', 'insurance', 'playing', 'dealer', 'settled'].includes(s.phase as string) &&
    Number.isInteger(s.spotCount) &&
    (s.spotCount as number) >= 1 &&
    (s.spotCount as number) <= MAX_SPOTS &&
    isBetList(s.bets) &&
    isBetList(s.lastBets) &&
    isCardList(s.shoe) &&
    isCardList(s.dealer) &&
    Array.isArray(s.hands) &&
    (s.hands as unknown[]).every((h) => !!h && typeof h === 'object' && isCardList((h as { cards: unknown }).cards)) &&
    typeof s.lastBonusAt === 'number' &&
    !!s.stats &&
    typeof s.stats === 'object'
  )
}

/** Parses a saved game; null when missing or unusable. */
export function parseSave(raw: string | null): GameState | null {
  if (!raw) return null
  try {
    const value: unknown = JSON.parse(raw)
    return isGameState(value) ? value : null
  } catch {
    return null
  }
}

/** Storage can be blocked (private windows, strict settings): the game then runs without saving. */
export function loadGame(): GameState | null {
  try {
    return parseSave(window.localStorage.getItem(STORAGE_KEY))
  } catch {
    return null
  }
}

export function saveGame(state: GameState): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
  } catch {
    // Not fatal: the game keeps running in memory.
  }
}
