# Blackjack

Multi-hand blackjack that runs entirely in the browser. There is no server and no account: chips, the bonus timer and any round in progress are saved in the browser's `localStorage`. Chips are play money only.

## Playing

- Play 1 to 5 hands at once. Pick a chip, tap a spot to bet on it, then **Deal**.
- You start with 50,000 chips, and get another 50,000 every 45 minutes. Time away does not stack: coming back after three hours pays one bonus and restarts the timer.
- Reloading the page continues exactly where you left off, mid-round included. Two open tabs stay in sync.

### Table rules

| Rule | Setting |
|---|---|
| Shoe | 6 decks, reshuffled when 75% has been dealt |
| Blackjack | Pays 3 to 2 |
| Dealer | Stands on all 17s (soft 17 included); peeks for blackjack under an ace or a ten |
| Insurance | Offered when the dealer shows an ace; pays 2 to 1 |
| Double | On any first two cards, also after a split |
| Split | Pairs of equal value, up to 4 hands per spot; split aces get one card each; 21 after a split is not blackjack |
| Surrender | Late surrender on the first two cards of an unsplit hand, half the bet back |
| Bets | 100 to 100,000 per spot |

### Keyboard

| Key | Action |
|---|---|
| H / S / D / P / R | Hit / Stand / Double / Split / Surrender |
| Y / N | Take / decline insurance |
| Enter or Space | Deal, or rebet and deal after a round |

## Development

Requires Node 22 or newer.

```bash
npm install
```

```bash
npm run dev
```

```bash
npm test
```

```bash
npm run build
```

`npm test` covers hand values, every payout, the dealer's rules, split, double, surrender, insurance, the bonus timer, save-file validation, and a 5,000-round simulation that checks no chip is ever created or lost and that the house edge is realistic.

## Code layout

```
src/game/cards.ts     cards, shoe, shuffling, hand values
src/game/engine.ts    the rules: betting, dealing, actions, dealer, payouts, bonus
src/game/storage.ts   saving to and loading from localStorage
src/useGame.ts        React state, saving, bonus tick, dealer pacing, tab sync
src/App.tsx           table, controls, keyboard shortcuts
src/components/       cards, betting spots and hands
```

The engine is plain TypeScript with no React, so the rules can be tested on their own.

## Limits

Everything lives in the browser, so the chip count is not protected: anyone can edit `localStorage` to give themselves chips, and clearing site data starts over. Both are fine for a single-player play-money game, but they mean there can be no fair leaderboard without a server.

## Deployment

`npm run build` produces a static site in `dist/` that any web host can serve. The GitHub Actions workflow in `.github/workflows/deploy.yaml` uploads it over FTP on every push to `main`.
