# p4wn, layered

    view.js        BoardView          DOM + Unicode glyphs; knows only Match
    controller.js  Match              players, selection, scheduling, draw claims
    model.js       Game, Searcher     rules, history, SAN log, search policy
    engine.js      p4_* kernel        UNCHANGED: mailbox board, eval weights, alpha-beta

Dependencies point strictly downward; only model.js touches kernel globals.

## Public vocabulary (nothing above the kernel sees 120-element indices or bit flags)
- squares `'e4'`, colours `'white'|'black'`, pieces `{type, colour, glyph, fen}`
- `Game`: `turn ply status winner log lastMove fen() pieceAt() pieces() legalMovesFrom(sq)
  move(from,to,promo) | move('Nf3') goto(ply) undo(n) findMove(depth, climber)`;
  `move()` returns `{ok, san, from, to, check, checkmate, stalemate, capture, castle, drawAvailable}`
- `Searcher`: `levels`, `adaptive`, `treeclimber` (plug in an alternative search), `think(game, level)`
- `Match`: `click(sq) setPlayer togglePlayer swapSides setLevel cyclePromotion undo goto claimDraw`,
  events `'change'` and `'move'`. Replacing the UI means writing a new view against these.

## What changed vs the original
- display.js reached into `state.board`, `to_play`, `moveno`, `piece & 1`, `119 - i`; now it can't.
- Move log lives in the model (it was text in the DOM); the view re-renders from it.
- Legal-move highlighting, last-move highlighting and status line come free from the new API.
- Pieces are Unicode (♚♛♜♝♞♟ + CSS colour, U+FE0E to avoid emoji pawns); no image files needed.
- `p4wnify(id)` still works. `P4_IMAGE_*` / `P4WN_IMAGE_*` settings are gone.

## Kernel issues noticed (not fixed, since engine.js is untouched)
- `p4_jump_to_moveno`: `attr instanceof Array` is always false, so it replaces rather than
  copies state, and resets `treeclimber` (Game.goto compensates).
- The adaptive-depth loop in the old display could spin forever on trivial positions (capped now).
