import type { CSSProperties } from 'react'
import type { Card as CardCode } from '../game/cards'
import { cardFace } from '../format'

interface Props {
  card: CardCode
  faceDown?: boolean
  /** Milliseconds to wait before the deal animation, so the first deal lands card by card. */
  delay?: number
}

export function Card({ card, faceDown, delay = 0 }: Props) {
  const style = { animationDelay: `${delay}ms` } as CSSProperties
  if (faceDown) return <div className="card back" style={style} role="img" aria-label="Face-down card" />

  const { rank, suit, red, label } = cardFace(card)
  return (
    <div className={`card${red ? ' red' : ''}`} style={style} role="img" aria-label={label}>
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
