const W = 4, H = 5;
const TYPES = [
  { key: 'v', name: 'vertical 1×2', w: 1, h: 2 },
  { key: 'h', name: 'horizontal 2×1', w: 2, h: 1 },
  { key: 'q', name: 'square 2×2', w: 2, h: 2 },
  { key: 's', name: 'singlet 1×1', w: 1, h: 1 }
];
const FULL = (1 << (W * H)) - 1;
const DIRS = [[-1, 0, 'L'], [1, 0, 'R'], [0, -1, 'U'], [0, 1, 'D']];
const cache = new Map();

const $ = id => document.getElementById(id);
const setupSelect = $('setup');
const componentSelect = $('component');
const status = $('status');
const graphCanvas = $('graph');
const boardEl = $('board');
const stateInfo = $('stateInfo');
const statsEl = $('stats');
const graphEmpty = $('graphEmpty');

function bit(x, y) { return 1 << (y * W + x); }
function maskFor(t, x, y) {
  let m = 0;
  for (let dy = 0; dy < t.h; dy++) for (let dx = 0; dx < t.w; dx++) m |= bit(x + dx, y + dy);
  return m;
}
function keyOf(parts) { return parts.map(a => a.join(',')).join(';'); }
function encode(state) {
  return state.map(part => part.map(([x, y]) => `${x + y * W}`).join(',')).join('|');
}
function decode(key) {
  return key.split('|').map((part, ti) => part ? part.split(',').map(n => {
    const p = Number(n); return [p % W, Math.floor(p / W)];
  }) : []);
}
function areaFor(v, h, s) { return 2 * v + 2 * h + 4 + s; }

// Every valid setup has exactly one 2×2 block and occupies 18 of the 20 cells,
// leaving exactly two empty squares. Thus s = 14 - 2(v+h).
function makeSetups() {
  const result = [];
  for (let v = 0; v <= 7; v++) for (let h = 0; h <= 7 - v; h++) {
    const s = 14 - 2 * (v + h);
    if (s < 0 || areaFor(v, h, s) !== 18) continue;
    result.push({ v, h, q: 1, s });
  }
  return result;
}

const SETUPS = makeSetups();
SETUPS.forEach((c, i) => {
  const option = document.createElement('option');
  option.value = i;
  option.textContent = `V${c.v} · H${c.h} · Q1 · S${c.s}`;
  setupSelect.appendChild(option);
});

function firstEmpty(mask) {
  for (let i = 0; i < W * H; i++) if (!(mask & (1 << i))) return i;
  return -1;
}

// Enumerate every placement of the requested blocks while leaving exactly two
// cells empty. At each step we cover the first empty cell whenever possible;
// the two final uncovered cells are the holes. This generates each board once.
function enumerateTilings(counts) {
  const out = [];
  const parts = TYPES.map(() => []);
  const totalBlocks = counts.v + counts.h + counts.q + counts.s;

  function rec(mask, remaining, blocksLeft) {
    if (blocksLeft === 0) {
      if (mask !== FULL && (W * H - popcount(mask)) === 2) out.push(encode(parts));
      return;
    }

    const p = firstEmpty(mask);
    if (p < 0) return;
    const x = p % W, y = Math.floor(p / W);

    for (let ti = 0; ti < TYPES.length; ti++) {
      if (!remaining[ti]) continue;
      const t = TYPES[ti];
      if (x + t.w > W || y + t.h > H) continue;
      const m = maskFor(t, x, y);
      if (mask & m) continue;

      parts[ti].push([x, y]);
      remaining[ti]--;
      rec(mask | m, remaining, blocksLeft - 1);
      remaining[ti]++;
      parts[ti].pop();
    }

    // The first empty cell may itself be one of the two holes. We only need to
    // branch on this when enough cells remain to leave exactly two holes.
    if (W * H - popcount(mask) > 2) {
      rec(mask | bit(x, y), remaining, blocksLeft);
    }
  }

  rec(0, [counts.v, counts.h, counts.q, counts.s], totalBlocks);
  return out;
}

function popcount(n) {
  let c = 0;
  while (n) { n &= n - 1; c++; }
  return c;
}

function neighbors(key) {
  const state = decode(key);
  const occupancy = new Int8Array(W * H);
  state.forEach((part, ti) => part.forEach(([x, y]) => {
    const t = TYPES[ti], m = maskFor(t, x, y);
    for (let i = 0; i < W * H; i++) if (m & (1 << i)) occupancy[i] = ti + 1;
  }));
  const result = [];
  state.forEach((part, ti) => {
    const t = TYPES[ti];
    part.forEach(([x, y], pi) => {
      const own = maskFor(t, x, y);
      for (const [dx, dy, dir] of DIRS) {
        const nx = x + dx, ny = y + dy;
        // Check all four board boundaries using the entire block dimensions.
        // In particular, nx+t.w and ny+t.h prevent the block's bottom/right
        // edges from crossing the board.
        if (nx < 0 || ny < 0 || nx + t.w > W || ny + t.h > H) continue;
        const nm = maskFor(t, nx, ny);
        let legal = true;
        for (let i = 0; i < W * H; i++) {
          if ((nm & (1 << i)) && !(own & (1 << i)) && occupancy[i]) { legal = false; break; }
        }
        if (!legal) continue;
        const next = state.map(a => a.map(p => [p[0], p[1]]));
        next[ti][pi] = [nx, ny];
        next[ti].sort((a, b) => (a[1] - b[1]) || (a[0] - b[0]));
        result.push({ key: encode(next), move: { ti, pi, dir } });
      }
    });
  });
  return result;
}

function buildGraph(counts) {
  const states = enumerateTilings(counts);
  const index = new Map(states.map((k, i) => [k, i]));
  const edges = [];
  const adjacency = Array.from({ length: states.length }, () => []);
  for (let i = 0; i < states.length; i++) {
    for (const n of neighbors(states[i])) {
      const j = index.get(n.key);
      if (j === undefined) throw new Error('Generated move left the setup state space.');
      if (i < j) edges.push([i, j]);
      adjacency[i].push(j);
    }
  }
  return { states, index, edges, adjacency };
}

function components(graph) {
  const seen = new Uint8Array(graph.states.length), groups = [];
  for (let i = 0; i < graph.states.length; i++) if (!seen[i]) {
    const q = [i], group = [];
    seen[i] = 1;
    for (let p = 0; p < q.length; p++) {
      const n = q[p]; group.push(n);
      for (const m of graph.adjacency[n]) if (!seen[m]) { seen[m] = 1; q.push(m); }
    }
    groups.push(group);
  }
  return groups.sort((a, b) => b.length - a.length);
}

function renderStats(graph, groups, counts) {
  const cards = [
    ['States', graph.states.length],
    ['Transitions', graph.edges.length],
    ['Components', groups.length],
    ['Setup', `V${counts.v} H${counts.h} Q${counts.q} S${counts.s}`]
  ];
  statsEl.innerHTML = cards.map(([a, b]) => `<div class="stat"><b>${b}</b><span>${a}</span></div>`).join('');
}

function renderBoard(key) {
  const state = decode(key);
  boardEl.innerHTML = '';
  for (let i = 0; i < W * H; i++) boardEl.appendChild(Object.assign(document.createElement('div'), { className: 'cell' }));
  state.forEach((part, ti) => part.forEach(([x, y], pi) => {
    const t = TYPES[ti];
    for (let dy = 0; dy < t.h; dy++) for (let dx = 0; dx < t.w; dx++) {
      const cell = boardEl.children[(y + dy) * W + x + dx];
      cell.className = `cell ${t.key}`;
      cell.textContent = (t.key === 'q' ? 'Q' : t.key.toUpperCase()) + (part.length > 1 ? pi + 1 : '');
    }
  }));
  const q = state[2][0];
  const solved = q && q[0] === 1 && q[1] === 3;
  stateInfo.innerHTML = `<b>Square:</b> (${q?.[0] ?? '?'}, ${q?.[1] ?? '?'})<br><b>Goal:</b> ${solved ? '✓ reached' : 'not reached'}`;
}

let current = null;
let selected = 0;

function layoutGraph(graph, group) {
  const nodes = group.map(i => i);
  const pos = new Map();
  const dist = new Map([[nodes[0], 0]]), q = [nodes[0]];
  const groupSet = new Set(group);
  for (let p = 0; p < q.length; p++) {
    const n = q[p];
    for (const m of graph.adjacency[n]) if (groupSet.has(m) && !dist.has(m)) { dist.set(m, dist.get(n) + 1); q.push(m); }
  }
  const layers = new Map();
  nodes.forEach(n => { const d = dist.get(n) ?? 0; if (!layers.has(d)) layers.set(d, []); layers.get(d).push(n); });
  const maxD = Math.max(...layers.keys());
  const width = graphCanvas.clientWidth, height = graphCanvas.clientHeight;
  const cx = width / 2, cy = height / 2, rx = Math.max(80, width * .43), ry = Math.max(80, height * .43);
  for (let d = 0; d <= maxD; d++) {
    const layer = layers.get(d) || [];
    const r = maxD ? (d / maxD) : 0;
    layer.forEach((n, k) => {
      const angle = (k / Math.max(1, layer.length)) * Math.PI * 2 - Math.PI / 2;
      pos.set(n, { x: cx + Math.cos(angle) * rx * r, y: cy + Math.sin(angle) * ry * r });
    });
  }
  return pos;
}

function drawGraph() {
  if (!current) return;
  const canvas = graphCanvas, rect = canvas.getBoundingClientRect(), dpr = window.devicePixelRatio || 1;
  canvas.width = rect.width * dpr; canvas.height = rect.height * dpr;
  const ctx = canvas.getContext('2d'); ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, rect.width, rect.height);
  const group = current.groups[Number(componentSelect.value) || 0];
  const pos = layoutGraph(current.graph, group);
  ctx.lineWidth = 1;
  ctx.strokeStyle = '#c8d0d9';
  current.graph.edges.forEach(([a,b]) => {
    if (!pos.has(a) || !pos.has(b)) return;
    ctx.beginPath(); ctx.moveTo(pos.get(a).x, pos.get(a).y); ctx.lineTo(pos.get(b).x, pos.get(b).y); ctx.stroke();
  });
  group.forEach(n => {
    const p = pos.get(n); const r = n === selected ? 7 : 4;
    ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
    ctx.fillStyle = n === selected ? '#0969da' : '#57606a'; ctx.fill();
    if ($('showLabels').checked && group.length < 500) {
      ctx.fillStyle = '#57606a'; ctx.font = '10px system-ui'; ctx.fillText(String(n), p.x + 6, p.y + 3);
    }
  });
  canvas._positions = pos;
}

function pickNode(e) {
  if (!current || !canvasReady()) return;
  const rect = graphCanvas.getBoundingClientRect();
  const x = e.clientX - rect.left, y = e.clientY - rect.top;
  const group = current.groups[Number(componentSelect.value) || 0];
  let best = null, bd = 12;
  group.forEach(n => { const p = graphCanvas._positions?.get(n); if (!p) return; const d = Math.hypot(p.x-x,p.y-y); if (d < bd) { bd=d; best=n; } });
  if (best !== null) { selected = best; renderBoard(current.graph.states[selected]); drawGraph(); }
}
function canvasReady() { return graphCanvas._positions; }

enumerateSetup();
$('enumerate').addEventListener('click', enumerateSetup);
componentSelect.addEventListener('change', () => { selected = current.groups[Number(componentSelect.value)][0]; renderBoard(current.graph.states[selected]); drawGraph(); });
$('showLabels').addEventListener('change', drawGraph);
graphCanvas.addEventListener('click', pickNode);
window.addEventListener('resize', drawGraph);

function enumerateSetup() {
  const counts = SETUPS[Number(setupSelect.value)];
  const cacheKey = [counts.v, counts.h, counts.q, counts.s].join(',');
  status.textContent = cache.has(cacheKey) ? 'Loading cached graph…' : 'Enumerating all tilings and transitions…';
  graphEmpty.style.display = 'none';
  setTimeout(() => {
    try {
      if (!cache.has(cacheKey)) cache.set(cacheKey, buildGraph(counts));
      const graph = cache.get(cacheKey), groups = components(graph);
      current = { graph, groups, counts };
      componentSelect.innerHTML = groups.map((g, i) => `<option value="${i}">Component ${i + 1} · ${g.length} states</option>`).join('');
      selected = groups[0][0];
      renderStats(graph, groups, counts);
      renderBoard(graph.states[selected]);
      status.textContent = `${graph.states.length.toLocaleString()} states enumerated.`;
      drawGraph();
    } catch (err) {
      status.textContent = `Error: ${err.message}`;
      console.error(err);
    }
  }, 20);
}
