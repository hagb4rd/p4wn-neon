/* Layer 2 - Controller. Who is playing, selection, turn scheduling, draw claims.
 * No DOM, no kernel. Emits 'change' whenever anything visible changed, and 'move'. */
(function (root) {
'use strict';
var NS = root.P4wn;
const PROMOTIONS = ['queen', 'rook', 'knight', 'bishop'];

class Match extends NS.Emitter {
  constructor(o) {
    super(); o = o || {};
    this.game = o.game || new NS.Game(o.fen);
    this.searcher = o.searcher || new NS.Searcher({ adaptive: o.adaptive });
    this.players = (o.players || ['human', 'computer']).slice();   // [white, black]
    this.level = o.level != null ? o.level : this.searcher.defaultLevel;
    this.rotate = o.rotate !== false;
    this.promotion = 'queen';
    this.hints = !!o.hints;            // show legal-move dots (off by default)
    this.perspective = 'white';        // colour shown at the bottom
    this.selected = null; this.targets = [];
    this.drawAvailable = false; this.drawClaimed = false;
    this._timer = null;
    this._updatePerspective();
  }

  get over() { return this.drawClaimed || this.game.status !== 'playing'; }
  get computerToMove() { return this.players[this.game.turn === 'white' ? 0 : 1] === 'computer'; }

  start() { this._schedule(); this._changed(); return this; }

  /* ---- human input ---- */
  click(sq) {
    if (this.over || this.computerToMove) return;
    const piece = this.game.pieceAt(sq);
    if (this.selected === sq) return this._deselect();
    if (piece && piece.colour === this.game.turn) return this._select(sq);
    if (this.selected && this.targets.indexOf(sq) >= 0) this._apply(this.selected, sq, this.promotion);
  }

  /* ---- settings ---- */
  setPlayer(colour, kind) { this.players[colour === 'white' ? 0 : 1] = kind; this._settingsChanged(); }
  togglePlayer(colour) { this.setPlayer(colour, this.players[colour === 'white' ? 0 : 1] === 'human' ? 'computer' : 'human'); }
  swapSides() {
    this.players.reverse();
    if (this.rotate && this.players[0] !== this.players[1]) this._updatePerspective(true);
    this._settingsChanged();
  }
  setLevel(i) { this.level = i % this.searcher.levels.length; this._changed(); }
  toggleHints() { this.hints = !this.hints; this._changed(); }
  cyclePromotion() { this.promotion = PROMOTIONS[(PROMOTIONS.indexOf(this.promotion) + 1) % PROMOTIONS.length]; this._changed(); }

  /* ---- history ---- */
  undo() { this.goto(this.game.ply - (this.players[0] !== this.players[1] ? 2 : 1)); }
  goto(ply) {
    this._cancel(); this._deselect(true);
    this.game.goto(Math.max(0, ply));
    this.drawClaimed = false; this.drawAvailable = false;
    this._schedule(); this._changed();
  }
  claimDraw() { this._cancel(); this.drawClaimed = true; this._changed(); }

  /* ---- internals ---- */
  _select(sq) { this.selected = sq; this.targets = this.game.legalMovesFrom(sq); this._changed(); }
  _deselect(silent) { this.selected = null; this.targets = []; if (!silent) this._changed(); }

  _apply(from, to, promotion) {
    const r = this.game.move(from, to, promotion);
    if (!r.ok) return r;
    this._deselect(true);
    this.drawAvailable = r.drawAvailable;
    this.emit('move', r);
    this._schedule(); this._changed();
    return r;
  }

  _schedule() {
    if (this._timer || this.over || !this.computerToMove) return;
    const both = this.players[0] === 'computer' && this.players[1] === 'computer';
    this._timer = setTimeout(() => {
      this._timer = null;
      const best = this.searcher.think(this.game, this.level);
      if (best) this._apply(best.from, best.to, 'queen');
    }, both ? 500 : 10);
  }
  _cancel() { clearTimeout(this._timer); this._timer = null; }
  _updatePerspective(force) {
    const p = this.players;
    if (p[0] !== p[1] && (this.rotate || force)) this.perspective = p[0] === 'computer' ? 'black' : 'white';
  }
  _settingsChanged() { this._updatePerspective(); this._cancel(); this._deselect(true); this._schedule(); this._changed(); }
  _changed() { this.emit('change', this); }
}

NS.Match = Match;
})(typeof window !== 'undefined' ? window : globalThis);
