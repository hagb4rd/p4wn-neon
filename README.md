# P4WN Neon ♟

A green-on-black, cyberpunk-styled chess game that runs in your browser, desktop or phone.
Open `index.html`. No build step, no server.

This is a refactor of **[p4wn](https://github.com/douglasbagnall/p4wn)** by Douglas Bagnall.
The chess engine (`engine.js`, the search, evaluation and move generation) is the original, unchanged.

## What's new

- Layered code: `model.js` (rules), `controller.js` (game flow), `view.js` (screen), see [ARCHITECTURE.md](ARCHITECTURE.md)
- Unicode chess pieces instead of image files
- Neon green theme, responsive for phones (the old look is in `p4wn-classic.css`)
- Optional legal-move hints (button, or `?hints=1`)

## Playing

Tap a piece, then tap a square. Buttons: swap sides, undo, choose promotion piece, computer level, hints.
Tap a move in the log to go back to it. URL options: `?start=<FEN>&level=0-4&player=white|black|both|neither`.

## Credits

p4wn was written by Douglas Bagnall, with contributions from Sven Vahar, Antony Lesuisse, Ron Winter,
Chris Lear, Ivan Yelizariev and Oliver Merkel. Thank you all.
Original: https://github.com/douglasbagnall/p4wn · http://p4wn.sf.net

Refactor and neon theme developed with Claude (Anthropic).

## License

p4wn is dedicated to the public domain under [CC0](http://creativecommons.org/publicdomain/zero/1.0/) by its authors.
The additions here are offered under CC0 too: use them for anything.
