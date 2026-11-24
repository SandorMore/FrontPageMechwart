import type { CSSProperties } from 'react'
import type { Card as CardCode } from '../game/cards'
import { cardFace } from '../format'

interface Props {
  card: CardCode
  faceDown?: boolean
  /** Milliseconds to wait before the deal animation, so the first deal lands card by card. */
  delay?: number
  /** The card moved to a new hand on a split: it slides with its hand instead of being dealt. */
  moved?: boolean
}

export function Card({ card, faceDown, delay = 0, moved }: Props) {
  const style = { animationDelay: `${delay}ms` } as CSSProperties
  if (faceDown) return <div className="card back" style={style} role="img" aria-label="Face-down card" />

  const { rank, suit, red, label } = cardFace(card)
  return (
    <div className={`card${red ? ' red' : ''}${moved ? ' moved' : ''}`} style={style} role="img" aria-label={label}>
      <span className="corner top">
        {rank}
        <br />
        {suit}
      </span>
      <span className="pip" aria-hidden="true">
        {suit}
      </span>
      <span className="corner bottom" aria-hidden="true">
        {rank}
        <br />
        {suit}
      </span>
    </div>
  )
}
