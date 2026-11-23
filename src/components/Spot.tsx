import { handValue } from '../game/cards'
import type { GameState, Outcome, PlayerHand } from '../game/engine'
import { chipLabel, chips, signedChips, totalLabel } from '../format'
import { Card } from './Card'

export const DEAL_STEP_MS = 140

const OUTCOME_TEXT: Record<Outcome, string> = {
  blackjack: 'Blackjack',
  win: 'Win',
  push: 'Push',
  lose: 'Lose',
  bust: 'Bust',
  surrender: 'Surrender',
}

interface SpotProps {
  state: GameState
  spot: number
  /** Order of this spot in the first deal, or -1 when it has no hand this round. */
  dealPosition: number
  dealtHands: number
  selectedChip: number
  onBet: (spot: number) => void
  onClear: (spot: number) => void
}

export function Spot({ state, spot, dealPosition, dealtHands, selectedChip, onBet, onClear }: SpotProps) {
  if (state.phase === 'betting') {
    const bet = state.bets[spot]
    return (
      <div className="spot betting">
        <button
          type="button"
          className={`bet-circle${bet ? ' has-bet' : ''}`}
          onClick={() => onBet(spot)}
          aria-label={`Spot ${spot + 1}: bet ${chips(bet)}. Add ${chips(selectedChip)}.`}
        >
          {bet ? <ChipStack amount={bet} /> : <span className="bet-hint">+{chipLabel(selectedChip)}</span>}
        </button>
        {bet > 0 && (
          <button type="button" className="clear-spot" onClick={() => onClear(spot)} aria-label={`Clear spot ${spot + 1}`}>
            ×
          </button>
        )}
      </div>
    )
  }

  const hands = state.hands.map((hand, index) => ({ hand, index })).filter((h) => h.hand.spot === spot)
  if (hands.length === 0) {
    return (
      <div className="spot idle">
        <div className="bet-circle" aria-hidden="true" />
      </div>
    )
  }

  return (
    <div className="spot">
      <div className="spot-hands">
        {hands.map(({ hand, index }) => (
          <Hand
            key={index - hands[0].index}
            hand={hand}
            active={state.active === index}
            settled={state.phase === 'settled'}
            delays={hand.fromSplit ? [0, 0] : [dealPosition * DEAL_STEP_MS, (dealtHands + 1 + dealPosition) * DEAL_STEP_MS]}
          />
        ))}
      </div>
    </div>
  )
}

function Hand({
  hand,
  active,
  settled,
  delays,
}: {
  hand: PlayerHand
  active: boolean
  settled: boolean
  delays: number[]
}) {
  const bust = handValue(hand.cards).total > 21
  const classes = ['hand']
  if (active) classes.push('active')
  if (hand.outcome) classes.push(`outcome-${hand.outcome}`)
  const net = hand.payout - hand.bet - hand.insurance

  return (
    <div className={classes.join(' ')} aria-current={active ? 'true' : undefined}>
      <div className="cards">
        {hand.cards.map((card, i) => (
          <Card key={i} card={card} delay={delays[i] ?? 0} />
        ))}
      </div>
      <div className={`total${bust ? ' bust' : ''}`}>{totalLabel(hand.cards, hand.done)}</div>
      <div className="hand-bet">
        <ChipStack amount={hand.bet} small />
        {hand.doubled && (
          <span className="tag" title="Doubled down">
            Dbl
          </span>
        )}
        {hand.insurance > 0 && (
          <span className="tag" title={`Insured for ${chips(hand.insurance)}`}>
            Ins
          </span>
        )}
      </div>
      {settled && hand.outcome && (
        <div className={`result ${net > 0 ? 'good' : net < 0 ? 'bad' : 'even'}`}>
          {OUTCOME_TEXT[hand.outcome]}
          <span className="result-net">{signedChips(net)}</span>
        </div>
      )}
    </div>
  )
}

const CHIP_COLORS: [number, string][] = [
  [25_000, 'c25k'],
  [10_000, 'c10k'],
  [5_000, 'c5k'],
  [1_000, 'c1k'],
  [500, 'c500'],
  [100, 'c100'],
]

/** A bet drawn as a small stack in the colour of its largest chip. */
export function ChipStack({ amount, small }: { amount: number; small?: boolean }) {
  const color = CHIP_COLORS.find(([value]) => amount >= value)?.[1] ?? 'c100'
  return (
    <span className={`chip-stack${small ? ' small' : ''}`}>
      <span className={`chip ${color}`} aria-hidden="true" />
      <span className="chip-amount">{chips(amount)}</span>
    </span>
  )
}
