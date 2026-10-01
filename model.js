/* Layer 1 - Model. Rules + position + search policy, no DOM, no kernel details leaking out.
 * Public vocabulary: squares are 'e4', colours are 'white'|'black',
 * piece types are 'pawn'|'rook'|'knight'|'bishop'|'queen'|'king'.
 * Only this file talks to the kernel (engine.js globals). */
(function (root) {
'use strict';
var NS = root.P4wn = root.P4wn || {};

class Emitter {
  constructor() { this._h = {}; }
  on(ev, fn) { (this._h[ev] = this._h[ev] || []).push(fn); return this; }
  off(ev, fn) { this._h[ev] = (this._h[ev] || []).filter(f => f !== fn); return this; }
  emit(ev, arg) { (this._h[ev] || []).slice().forEach(f => f(arg)); }
}

/* ---- pieces: kernel integer code <-> immutable descriptor ---- */
const TYPE_CODE = { pawn: P4_PAWN, rook: P4_ROOK, knight: P4_KNIGHT,
                    bishop: P4_BISHOP, queen: P4_QUEEN, king: P4_KING };
/* Solid glyphs for both colours (colour comes from CSS); U+FE0E forces text
 * rather than emoji presentation, notably for the pawn. */
const GLYPH = { king: '\u265A', queen: '\u265B', rook: '\u265C',
                bishop: '\u265D', knight: '\u265E', pawn: '\u265F' };
const LETTER = { pawn: 'p', rook: 'r', knight: 'n', bishop: 'b', queen: 'q', king: 'k' };
const PIECES = {};
Object.keys(TYPE_CODE).forEach(type => [0, 1].forEach(c => {
  PIECES[TYPE_CODE[type] | c] = Object.freeze({
    type: type, colour: c ? 'black' : 'white',
    glyph: GLYPH[type] + '\uFE0E', fen: c ? LETTER[type] : LETTER[type].toUpperCase()
  });
}));
NS.glyph = type => GLYPH[type] + '\uFE0E';

/* ---- squares: 'e4' <-> kernel 10x12 mailbox index ---- */
const Square = {
  toIndex(name) {
    const f = name.charCodeAt(0) - 96, r = +name.charAt(1);
    return (f >= 1 && f <= 8 && r >= 1 && r <= 8) ? (r + 1) * 10 + f : 0;
  },
  toName(i) { return String.fromCharCode(96 + i % 10) + (Math.floor(i / 10) - 1); }
};
NS.Square = Square;

/* ---- Game: one position + its history; the only owner of kernel state ---- */
class Game extends Emitter {
  constructor(fen) { super(); this.reset(fen); }

  reset(fen) {
    this._st = p4_fen2state(fen || P4_INITIAL_BOARD);
    this._log = [];            // [{ply, colour, san, from, to}]
    this.status = 'playing';   // 'playing' | 'checkmate' | 'stalemate'
    this.emit('reset', this);
  }

  get turn() { return this._st.to_play ? 'black' : 'white'; }
  get ply() { return this._st.moveno; }          // half-moves since the start of the game
  get log() { return this._log.slice(); }
  get lastMove() { const l = this._log[this._log.length - 1]; return l ? { from: l.from, to: l.to } : null; }
  get winner() {   // side that delivered mate; the mated side is on move
    return this.status === 'checkmate' ? (this.turn === 'white' ? 'black' : 'white') : null;
  }
  fen() { return p4_state2fen(this._st); }

  pieceAt(sq) { const i = Square.toIndex(sq); return i ? PIECES[this._st.board[i]] || null : null; }

  pieces() {
    const out = [];
    for (let y = 2; y < 10; y++) for (let x = 1; x < 9; x++) {
      const p = PIECES[this._st.board[y * 10 + x]];
      if (p) out.push({ square: Square.toName(y * 10 + x), piece: p });
    }
    return out;
  }

  /* Fully legal destinations for the piece on `sq` (empty unless it is that side's turn). */
  legalMovesFrom(sq) {
    const st = this._st, s = Square.toIndex(sq), p = s && PIECES[st.board[s]];
    if (!p || p.colour !== this.turn) return [];
    const colour = st.to_play, out = [];
    p4_maybe_prepare(st);
    p4_parse(st, colour, st.enpassant, 0).forEach(m => {
      if (m[1] !== s) return;
      const undo = p4_make_move(st, s, m[2], P4_QUEEN);
      const illegal = p4_check_check(st, colour);
      p4_unmake_move(st, undo);
      if (!illegal) out.push(Square.toName(m[2]));
    });
    return out;
  }

  /* move('e2','e4'[, 'queen'])  or  move('Nf3') in algebraic notation. */
  move(from, to, promotion) {
    const st = this._st, ply = st.moveno, colour = this.turn;
    const code = TYPE_CODE[promotion || 'queen'];
    const r = (to === undefined)
      ? p4_move(st, from)
      : p4_move(st, Square.toIndex(from), Square.toIndex(to), code);
    if (!r.ok) return { ok: false, error: r.string || 'illegal move' };
    const f = r.flags, check = !!(f & P4_MOVE_FLAG_CHECK), mate = !!(f & P4_MOVE_FLAG_MATE);
    const h = st.history[st.history.length - 1];
    const res = {
      ok: true, san: r.string, ply: ply,
      from: Square.toName(h[0]), to: Square.toName(h[1]),
      check: check, checkmate: check && mate, stalemate: mate && !check,
      capture: !!(f & P4_MOVE_FLAG_CAPTURE),
      castle: (f & P4_MOVE_FLAG_CASTLE_KING) ? 'king' : (f & P4_MOVE_FLAG_CASTLE_QUEEN) ? 'queen' : null,
      drawAvailable: !!(f & P4_MOVE_FLAG_DRAW)
    };
    this.status = res.checkmate ? 'checkmate' : res.stalemate ? 'stalemate' : 'playing';
    this._log.push({ ply: ply, colour: colour, san: res.san, from: res.from, to: res.to });
    this.emit('move', res);
    return res;
  }

  /* Rewind to an absolute half-move number. */
  goto(ply) {
    const st = this._st, climber = st.treeclimber;
    p4_jump_to_moveno(st, ply);
    st.treeclimber = climber;      // the kernel's replay resets it
    this._log = this._log.filter(l => l.ply < st.moveno);
    this.status = 'playing';
    this.emit('goto', this);
  }
  undo(plies) { this.goto(this.ply - (plies || 1)); }

  /* Raw search. `depth` is the kernel's search parameter (plies - 1). */
  findMove(depth, treeclimber) {
    const st = this._st, saved = st.treeclimber;
    if (treeclimber) st.treeclimber = treeclimber;
    try {
      const r = p4_findmove(st, depth);
      return r[0] ? { from: Square.toName(r[0]), to: Square.toName(r[1]), score: r[2] } : null;
    } finally { st.treeclimber = saved; }
  }
}

/* ---- Searcher: strength policy (levels, time-adaptive depth) kept out of Game ---- */
class Searcher {
  constructor(o) {
    o = o || {};
    this.levels = o.levels || ['stupid', 'middling', 'default', 'slow', 'slowest'];
    this.defaultLevel = o.defaultLevel != null ? o.defaultLevel : 2;
    this.adaptive = !!o.adaptive;       // keep deepening until ~25ms per ply
    this.maxDepth = o.maxDepth || 10;   // guards the adaptive loop on trivial positions
    this.treeclimber = o.treeclimber || null;   // swap in a different search function
  }
  think(game, level) {
    const t0 = Date.now();
    let depth = level + 1, best = game.findMove(depth, this.treeclimber);
    if (this.adaptive && depth > 2)
      while (best && Date.now() - t0 < 25 * depth && depth < this.maxDepth)
        best = game.findMove(++depth, this.treeclimber);
    if (best) { best.depth = depth; best.ms = Date.now() - t0; }
    return best;
  }
}

NS.Emitter = Emitter; NS.Game = Game; NS.Searcher = Searcher;
})(typeof window !== 'undefined' ? window : globalThis);
