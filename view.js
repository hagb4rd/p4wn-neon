/* Layer 3 - View. Renders a Match with Unicode pieces; speaks only the public
 * vocabulary (square names, colours, piece types). Replaceable wholesale. */
(function (root) {
'use strict';
var NS = root.P4wn;
const FILES = 'abcdefgh';

function el(tag, cls, parent, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  if (parent) parent.appendChild(e);
  return e;
}

class BoardView {
  constructor(container, match, o) {
    o = o || {};
    this.match = match;
    this.text = Object.assign({ white: 'white', black: 'black', human: 'human', computer: 'computer',
      swap: 'swap', undo: 'undo', draw: 'Draw?', level: 'computer level', promotes: 'pawn promotes to', hints: 'hints', on: 'on', off: 'off',
      toMove: 'to move', check: 'check', mate: 'checkmate', stalemate: 'stalemate', drawn: 'draw agreed',
      wins: 'wins' }, o.text);
    const wrap = el('div', 'p4wn-wrapper', container);
    wrap.style.setProperty('--p4wn-max-sq', (o.squareSize || 48) + 'px');   // upper bound; CSS fits it to the screen
    const board = el('div', 'p4wn-board', wrap);
    this.logEl = el('div', 'p4wn-log', wrap);
    this.statusEl = el('div', 'p4wn-status', container);
    this.controlsEl = el('div', 'p4wn-controls', container);
    this.cells = [];
    for (let i = 0; i < 64; i++) {
      const c = el('div', 'p4wn-square', board);
      c.addEventListener('click', () => match.click(c.dataset.sq));
      this.cells.push(c);
    }
    this._buildControls();
    match.on('change', () => this.render());
    this.render();
  }

  _buildControls() {
    const m = this.match, t = this.text;
    const defs = [
      { label: () => t.white + ': ' + t[m.players[0]], click: () => m.togglePlayer('white') },
      { label: () => t.black + ': ' + t[m.players[1]], click: () => m.togglePlayer('black') },
      { label: () => t.swap, click: () => m.swapSides() },
      { label: () => t.undo, click: () => m.undo() },
      { label: () => t.hints + ': ' + (m.hints ? t.on : t.off), click: () => m.toggleHints() },
      { label: () => t.promotes + ' ' + NS.glyph(m.promotion), click: () => m.cyclePromotion() },
      { label: () => t.level + ': ' + m.searcher.levels[m.level], click: () => m.setLevel(m.level + 1) },
      { label: () => t.draw, click: () => m.claimDraw(), hidden: () => !m.drawAvailable || m.over }
    ];
    this.buttons = defs.map(d => {
      const b = el('button', 'p4wn-control-button', this.controlsEl);
      b.type = 'button';
      b.addEventListener('click', d.click);
      return { el: b, def: d };
    });
  }

  render() {
    const m = this.match, g = m.game, flip = m.perspective === 'black', last = g.lastMove;
    for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) {
      const file = flip ? 7 - c : c, rank = flip ? r : 7 - r;
      const sq = FILES[file] + (rank + 1), cell = this.cells[r * 8 + c], p = g.pieceAt(sq);
      cell.dataset.sq = sq;
      cell.className = 'p4wn-square ' + (((file + rank) & 1) ? 'p4wn-light' : 'p4wn-dark') +
        (p ? ' p4wn-' + p.colour : '') +
        (m.selected === sq ? ' p4wn-selected' : '') +
        (m.hints && m.targets.indexOf(sq) >= 0 ? ' p4wn-target' : '') +
        (last && (last.from === sq || last.to === sq) ? ' p4wn-last' : '');
      cell.textContent = p ? p.glyph : '';
    }
    this.buttons.forEach(b => {
      b.el.textContent = b.def.label();
      b.el.style.display = (b.def.hidden && b.def.hidden()) ? 'none' : '';
    });
    this._renderLog(); this._renderStatus();
  }

  _renderLog() {
    const m = this.match, log = this.logEl;
    log.textContent = '';
    m.game.log.forEach(e => {
      const num = e.colour === 'white' ? ((e.ply >> 1) + 1) + '.' : '';
      const row = el('div', 'p4wn-log-move', log, (num + '    ').slice(0, 4) + e.san);
      row.addEventListener('click', () => m.goto(e.ply + 1));
    });
    log.scrollTop = log.scrollHeight;
  }

  _renderStatus() {
    const m = this.match, g = m.game, t = this.text;
    let s = t[g.turn] + ' ' + t.toMove;
    if (g.status === 'checkmate') s = t.mate + ' \u2013 ' + t[g.winner] + ' ' + t.wins;
    else if (g.status === 'stalemate') s = t.stalemate;
    else if (m.drawClaimed) s = t.drawn;
    else if (g.log.length && /[+#]$/.test(g.log[g.log.length - 1].san)) s += ' (' + t.check + ')';
    this.statusEl.textContent = s;
  }
}

/* ---- convenience: mount a complete game, honouring ?start=&level=&player=&debug= ---- */
NS.mount = function (target, o) {
  o = Object.assign({}, o);
  const q = new URLSearchParams(root.location ? root.location.search : '');
  if (q.has('debug')) root.P4_DEBUG = parseInt(q.get('debug'), 10);
  if (q.has('start')) o.fen = q.get('start');
  if (q.has('hints')) o.hints = q.get('hints') === '1';
  if (q.has('level')) o.level = parseInt(q.get('level'), 10);
  const presets = { white: ['human', 'computer'], black: ['computer', 'human'],
                    both: ['human', 'human'], neither: ['computer', 'computer'] };
  const pl = q.has('player') && presets[q.get('player').toLowerCase()];
  if (pl) o.players = pl;
  const container = typeof target === 'string' ? document.getElementById(target)
                  : (target && target.jquery) ? target.get(0) : target;
  const match = new NS.Match(o);
  const view = new NS.BoardView(container, match, o);
  match.start();
  return { match: match, view: view, game: match.game, next_move: function () { match.start(); } };
};
root.p4wnify = NS.mount;   // keeps the old embedding snippet working

NS.BoardView = BoardView;
})(typeof window !== 'undefined' ? window : globalThis);
