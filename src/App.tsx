import { useEffect, useState } from 'react'
import { Card } from './components/Card'
import { DEAL_STEP_MS, Spot } from './components/Spot'
import { handValue } from './game/cards'
import {
  allowedActions,
  BONUS_AMOUNT,
  BONUS_INTERVAL_MS,
  bonusRemaining,
  CHIP_VALUES,
  clearBets,
  clearSpot,
  deal,
  double,
  hit,
  insurance,
  insuranceCost,
  MAX_SPOTS,
  MIN_BET,
  nextRound,
  placeBet,
  rebet,
  rebetCost,
  setSpotCount,
  split,
  stand,
  surrender,
  type GameState,
} from './game/engine'
import { chipLabel, chips, countdown, signedChips, totalLabel } from './format'
import { useGame } from './useGame'

const rebetAndDeal = (s: GameState) => deal(rebet(nextRound(s)))

function App() {
  const { state, now, error, notice, act } = useGame()
  const [chip, setChip] = useState<number>(1_000)

  const allowed = allowedActions(state)
  const onTable = state.bets.reduce((a, b) => a + b, 0)
  const nextBonus = bonusRemaining(state, now)
  const broke = state.phase === 'betting' && state.balance + onTable < MIN_BET

  // Keyboard shortcuts, shown on the buttons.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.ctrlKey || event.metaKey || event.altKey) return
      if ((event.target as HTMLElement).closest('input, select, textarea')) return
      const key = event.key.toLowerCase()
      const run = (change: (s: GameState) => GameState) => {
        event.preventDefault()
        act(change)
      }
      if (state.phase === 'playing') {
        if (key === 'h' && allowed.hit) run(hit)
        else if (key === 's' && allowed.stand) run(stand)
        else if (key === 'd' && allowed.double) run(double)
        else if (key === 'p' && allowed.split) run(split)
        else if (key === 'r' && allowed.surrender) run(surrender)
      } else if (state.phase === 'insurance') {
        if (key === 'y') run((s) => insurance(s, true))
        else if (key === 'n') run((s) => insurance(s, false))
      } else if (key === 'enter' || key === ' ') {
        if (state.phase === 'betting' && onTable > 0) run((s) => deal(s))
        else if (state.phase === 'settled') run(rebetAndDeal)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [state, allowed, onTable, act])

  // The order in which hands were dealt, for the staggered deal animation.
  const dealtSpots = [...new Set(state.hands.filter((h) => !h.fromSplit).map((h) => h.spot))]
  const dealtHands = dealtSpots.length
  const dealerDelays = [dealtHands * DEAL_STEP_MS, (2 * dealtHands + 1) * DEAL_STEP_MS]
  const dealerFinal = state.holeRevealed
  const dealerShown = dealerFinal ? state.dealer : state.dealer.slice(0, 1)
  const dealerBust = handValue(state.dealer).total > 21 && dealerFinal
  // Many hands or long hands reach the table's curved corners: flatten the curve and give them more room.
  const crowded = state.hands.length >= 4 || state.hands.some((h) => h.cards.length >= 4)

  return (
    <div className="app">
      <header className="topbar">
        <h1 className="brand">
          <span className="brand-mark" aria-hidden="true">
            ♠
          </span>{' '}
          Blackjack
        </h1>
        <div className="topbar-right">
          <div className="bonus" title={`${chips(BONUS_AMOUNT)} free chips every 45 minutes`}>
            <span className="bonus-label">
              +{chipLabel(BONUS_AMOUNT)} in <strong>{countdown(nextBonus)}</strong>
            </span>
            <span className="bonus-bar" aria-hidden="true">
              <span style={{ width: `${(1 - nextBonus / BONUS_INTERVAL_MS) * 100}%` }} />
            </span>
          </div>
          <div className="balance" aria-label={`Balance ${chips(state.balance)} chips`}>
            <span className="balance-chip" aria-hidden="true" />
            {chips(state.balance)}
          </div>
        </div>
      </header>

      <main className={`felt${crowded ? ' crowded' : ''}`}>
        <section className="dealer" aria-label="Dealer">
          <div className="cards">
            {state.dealer.map((card, i) => (
              <Card key={i} card={card} faceDown={i === 1 && !state.holeRevealed} delay={dealerDelays[i] ?? 0} />
            ))}
          </div>
          {state.dealer.length > 0 && (
            <div className={`total${dealerBust ? ' bust' : ''}`}>{totalLabel(dealerShown, dealerFinal)}</div>
          )}
        </section>

        <p className="rules" aria-label="Table rules">
          Blackjack pays 3 to 2 · Dealer stands on soft 17 · Insurance pays 2 to 1
        </p>

        <section className="spots" aria-label="Your spots">
          {Array.from({ length: state.spotCount }, (_, spot) => (
            <Spot
              key={spot}
              state={state}
              spot={spot}
              dealPosition={dealtSpots.indexOf(spot)}
              dealtHands={dealtHands}
              selectedChip={chip}
              onBet={(i) => act((s) => placeBet(s, i, chip))}
              onClear={(i) => act((s) => clearSpot(s, i))}
            />
          ))}
        </section>

        <div className="shoe" title="Cards left in the shoe">
          Shoe {state.shoe.length}
        </div>
        {notice && (
          <div key={notice.id} className="notice" role="status">
            {notice.text}
          </div>
        )}
      </main>

      <section className="controls" aria-label="Controls">
        <p className="message" role="status" aria-live="polite">
          {error ??
            (broke
              ? `Out of chips. ${chips(BONUS_AMOUNT)} more in ${countdown(nextBonus)}.`
              : phaseMessage(state, onTable))}
        </p>

        {state.phase === 'betting' && (
          <>
            <div className="chip-rack" role="radiogroup" aria-label="Chip value">
              {CHIP_VALUES.map((value) => (
                <button
                  key={value}
                  type="button"
                  role="radio"
                  aria-checked={chip === value}
                  className={`chip-button c${chipLabel(value).toLowerCase()}${chip === value ? ' selected' : ''}`}
                  disabled={value > state.balance}
                  onClick={() => setChip(value)}
                >
                  {chipLabel(value)}
                </button>
              ))}
            </div>
            <div className="row">
              <div className="spot-count" role="radiogroup" aria-label="Number of hands">
                <span className="muted">Hands</span>
                {Array.from({ length: MAX_SPOTS }, (_, i) => i + 1).map((n) => (
                  <button
                    key={n}
                    type="button"
                    role="radio"
                    aria-checked={state.spotCount === n}
                    className={`seg${state.spotCount === n ? ' on' : ''}`}
                    onClick={() => act((s) => setSpotCount(s, n))}
                  >
                    {n}
                  </button>
                ))}
              </div>
              <div className="buttons">
                <button type="button" className="btn" disabled={onTable === 0} onClick={() => act(clearBets)}>
                  Clear
                </button>
                <button
                  type="button"
                  className="btn"
                  disabled={rebetCost(state) === 0 || rebetCost(state) > state.balance + onTable}
                  onClick={() => act(rebet)}
                >
                  Rebet
                </button>
                <button type="button" className="btn primary" disabled={onTable === 0} onClick={() => act((s) => deal(s))}>
                  Deal <kbd>Enter</kbd>
                </button>
              </div>
            </div>
          </>
        )}

        {state.phase === 'insurance' && (
          <div className="buttons center">
            <button
              type="button"
              className="btn primary"
              disabled={insuranceCost(state) > state.balance}
              onClick={() => act((s) => insurance(s, true))}
            >
              Insure for {chips(insuranceCost(state))} <kbd>Y</kbd>
            </button>
            <button type="button" className="btn" onClick={() => act((s) => insurance(s, false))}>
              No insurance <kbd>N</kbd>
            </button>
          </div>
        )}

        {state.phase === 'playing' && (
          <div className="buttons center actions">
            <button type="button" className="btn primary" disabled={!allowed.hit} onClick={() => act(hit)}>
              Hit <kbd>H</kbd>
            </button>
            <button type="button" className="btn primary" disabled={!allowed.stand} onClick={() => act(stand)}>
              Stand <kbd>S</kbd>
            </button>
            <button type="button" className="btn" disabled={!allowed.double} onClick={() => act(double)}>
              Double <kbd>D</kbd>
            </button>
            <button type="button" className="btn" disabled={!allowed.split} onClick={() => act(split)}>
              Split <kbd>P</kbd>
            </button>
            <button type="button" className="btn" disabled={!allowed.surrender} onClick={() => act(surrender)}>
              Surrender <kbd>R</kbd>
            </button>
          </div>
        )}

        {state.phase === 'settled' && (
          <div className="buttons center">
            <button
              type="button"
              className="btn primary"
              disabled={rebetCost(state) === 0 || rebetCost(state) > state.balance}
              onClick={() => act(rebetAndDeal)}
            >
              Rebet &amp; deal <kbd>Enter</kbd>
            </button>
            <button type="button" className="btn" onClick={() => act(nextRound)}>
              New bets
            </button>
          </div>
        )}
      </section>

      <footer className="stats">
        Rounds {state.stats.rounds} · Won {state.stats.handsWon} · Lost {state.stats.handsLost} · Pushes{' '}
        {state.stats.pushes} · Blackjacks {state.stats.blackjacks}
      </footer>
    </div>
  )
}

function phaseMessage(state: GameState, onTable: number): string {
  switch (state.phase) {
    case 'betting':
      return onTable > 0 ? `${chips(onTable)} on the table. Deal when ready.` : 'Pick a chip, then tap a spot to bet.'
    case 'insurance':
      return 'The dealer shows an ace. Insure your hands?'
    case 'playing': {
      const n = state.hands.length
      return n > 1 ? `Hand ${state.active! + 1} of ${n}` : 'Your move'
    }
    case 'dealer':
      return 'Dealer plays…'
    case 'settled': {
      const net = state.roundNet ?? 0
      return net > 0 ? `You won ${signedChips(net)}` : net < 0 ? `You lost ${chips(-net)}` : 'Even round'
    }
  }
}

export default App
