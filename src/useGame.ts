import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { applyBonus, dealerStep, newGame, RuleError, type GameState } from './game/engine'
import { loadGame, parseSave, saveGame, STORAGE_KEY } from './game/storage'

const DEALER_DELAY_MS = 650

function boot() {
  const now = Date.now()
  const saved = loadGame()
  const state = applyBonus(saved ?? newGame(now), now)
  // A notice already shown before the reload is not shown again.
  return { state, seenNotice: saved?.notice?.id ?? null }
}

export function useGame() {
  const [initial] = useState(boot)
  const [state, setState] = useState<GameState>(initial.state)
  const [now, setNow] = useState(() => Date.now())
  const [error, setError] = useState<string | null>(null)

  // Every change is saved, so a reload continues exactly where it stopped.
  useEffect(() => saveGame(state), [state])

  // The clock for the bonus countdown; the bonus itself is paid by the same tick.
  useEffect(() => {
    const id = window.setInterval(() => {
      const t = Date.now()
      setNow(t)
      setState((s) => applyBonus(s, t))
    }, 1000)
    return () => window.clearInterval(id)
  }, [])

  // Another tab played: take over its state so both tabs agree on the chips.
  useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      if (event.key !== STORAGE_KEY) return
      const next = parseSave(event.newValue)
      if (next) setState(next)
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [])

  // The dealer plays one card at a time.
  useEffect(() => {
    if (state.phase !== 'dealer') return
    const id = window.setTimeout(() => setState((s) => (s.phase === 'dealer' ? dealerStep(s) : s)), DEALER_DELAY_MS)
    return () => window.clearTimeout(id)
  }, [state])

  // The newest state, including changes React has not rendered yet, so that
  // quick successive clicks each build on the previous one instead of overwriting it.
  const latest = useRef(state)
  useLayoutEffect(() => {
    latest.current = state
  }, [state])

  /** Applies a rule-checked change; a rule violation is shown instead of thrown. */
  const act = useCallback((change: (s: GameState) => GameState) => {
    try {
      const next = change(latest.current)
      latest.current = next
      setState(next)
      setError(null)
    } catch (e) {
      if (e instanceof RuleError) setError(e.message)
      else throw e
    }
  }, [])

  const notice = state.notice && state.notice.id !== initial.seenNotice ? state.notice : null

  return { state, now, error, notice, act }
}
