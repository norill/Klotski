const W = 4, H = 5;
const TYPES = [
  { key: 'v', name: 'vertical 1×2', w: 1, h: 2, mask: 17 },
  { key: 'h', name: 'horizontal 2×1', w: 2, h: 1, mask: 3 },
  { key: 'q', name: 'square 2×2', w: 2, h: 2, mask: 51 },
  { key: 's', name: 'singlet 1×1', w: 1, h: 1, mask: 1 }
];
const DIRS = [[-1, 0, 'L'], [1, 0, 'R'], [0, -1, 'U'], [0, 1, 'D']];
const cache = new Map();

const $ = id => document.getElementById(id);
const setupSelect = $('setup');
const groupSelect = $('component');
const status = $('status');
const graphCanvas = $('graph');
const boardEl = $('board');
const stateInfo = $('stateInfo');
const statsEl = $('stats');
const graphEmpty = $('graphEmpty');

function bit(x, y) { return 1 << (y * W + x); }
function maskFor(t, x, y) {
  return t.mask << (y * W + x);
}
function encode(state) {
  return state.map(part => part.map(([x, y]) => `${x + y * W}`).join(',')).join('|');
}
function decode(key) {
  return key.split('|').map(part => part ? part.split(',').map(n => {
    const p = Number(n); return [p % W, Math.floor(p / W)];
  }) : []);
}
function areaFor(v, h, s) { return 2 * v + 2 * h + 4 + s; }

// Every valid setup has exactly one 2×2 block and occupies 18 of the 20 cells,
// leaving exactly two empty squares. Thus s = 14 - 2(v+h).
function makeSetups() {
  const result = [];
  for (let v = 0; v <= 6; v++) for (let h = 0; h <= 7 - v; h++) {
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
  option.textContent = `V${c.v} · H${c.h} · S${c.s}`;
  setupSelect.appendChild(option);
});

const FIRSTEMPTY_LUT = function() {
  let ret = new Int8Array(256);
  for (let i = 0; i < 256; i++)
    for (let j = 0; j < W * H; j++) 
      if (!(i & (1 << j))) {
        ret[i] = j;
        break;
      }
  return ret;
}();
function firstEmpty(mask) {
  if ((mask & 0xFFFF) == 0xFFFF)
    return FIRSTEMPTY_LUT[mask >> 16] + 16;
  else if ((mask & 0xFF) == 0xFF)
    return FIRSTEMPTY_LUT[mask >> 8 & 0xFF] + 8;
  else return FIRSTEMPTY_LUT[mask & 0xFF];
}

const POPCOUNT_LUT = function() {
  let ret = new Int8Array(256);
  for (let i = 0; i < 256; i++){
    let c = 0, n = i;
    while (n) { n &= n - 1; c++; }
    ret[i] = c;
  }
  return ret;
}();
function popcount(n) {
  return POPCOUNT_LUT[n & 0xFF] + POPCOUNT_LUT[n >> 8 & 0xFF] + POPCOUNT_LUT[n >> 16 & 0xFF];
}

function enumerateTilings(counts) {
  const out = [];
  const parts = TYPES.map(() => []);
  const totalBlocks = counts.v + counts.h + counts.q + counts.s;

  function rec(mask, remaining, blocksLeft) {
    if (blocksLeft === 0) {
      out.push(encode(parts));
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

    // The first empty cell may itself be one of the two holes. Only branch if
    // enough cells remain to leave exactly two holes after all blocks are placed.
    if (W * H - popcount(mask) > 1) {
      rec(mask | bit(x, y), remaining, blocksLeft);
    }
  }

  rec(0, [counts.v, counts.h, counts.q, counts.s], totalBlocks);
  return out;
}

function occupancyOf(parts) {
  const out = new Int8Array(W * H);
  parts.forEach((part, ti) => part.forEach(([x, y]) => {
    const t = TYPES[ti];
    const m = maskFor(t, x, y);
    for (let i = 0; i < W * H; i++) {
      if (m & (1 << i)) 
        out[i] = ti + 1;
    }
  }));
  return out;
}

function neighbors(key) {
  const state = decode(key);
  const occupancy = occupancyOf(state);
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

function isSolved(key) {
  const state = decode(key);
  const q = state[2]?.[0];
  // Bottom-center means the 2×2 block occupies columns 1–2 and rows 3–4.
  return !!q && q[0] === 1 && q[1] === 3;
}

const UNREACHED = 1<<30;
function computeDepths(graph) {
  const depth = new Int32Array(graph.states.length);
  depth.fill(UNREACHED);
  const queue = [];
  for (let i = 0; i < graph.states.length; i++) {
    if (isSolved(graph.states[i])) {
      depth[i] = 0;
      queue.push(i);
    }
  }
  let head = 0;
  for (; head < queue.length; head++) {
    const n = queue[head];
    for (const m of graph.adjacency[n]) {
      if (depth[m] !== UNREACHED) continue;
      depth[m] = depth[n] + 1;
      queue.push(m);
    }
  }
  for (let i = 0; i < graph.states.length; i++) {
    if (depth[i] === 1) {
      queue.push(i);
    }
    if (depth[i] === 0) {
      depth[i] = UNREACHED+1;
    }
  }
  for (; head < queue.length; head++) {
    const n = queue[head];
    for (const m of graph.adjacency[n]) {
      if (depth[m] !== UNREACHED+1) continue;
      depth[m] = depth[n] - 1;
      queue.push(m);
    }
  }
  for (let i = 0; i < graph.states.length; i++) {
    if (depth[i] === UNREACHED+1) {
      depth[i] = 0;
    }
  }
  return depth;
}

function groups(graph) {
  const seen = new Uint8Array(graph.states.length), result = [];
  for (let i = 0; i < graph.states.length; i++) if (!seen[i]) {
    const q = [i], group = [];
    seen[i] = 1;
    for (let p = 0; p < q.length; p++) {
      const n = q[p]; group.push(n);
      for (const m of graph.adjacency[n]) if (!seen[m]) { seen[m] = 1; q.push(m); }
    }
    const solvedCount = group.reduce((n, state) => n + (graph.depth[state] === 0 ? 1 : 0), 0);
    let type = 'solvable';
    if (solvedCount === 0) type = 'unsolvable';
    else if (solvedCount === group.length) type = 'trivial';
    result.push({ states: group, solvedCount, type });
  }
  return result.sort((a, b) => b.states.length - a.states.length);
}

function renderStats(graph, groupList, counts) {
  const cards = [
    ['States', graph.states.length],
    ['Transitions', graph.edges.length],
    ['Groups', groupList.length],
    ['Setup', `V${counts.v} H${counts.h} Q${counts.q} S${counts.s}`]
  ];
  statsEl.innerHTML = cards.map(([a, b]) => `<div class="stat"><b>${b}</b><span>${a}</span></div>`).join('');
}

function renderBoard(key) {
  const state = decode(key);
  boardEl.innerHTML = '';
  state.forEach((part, ti) => part.forEach(([x, y], pi) => {
    const t = TYPES[ti];
    const block = document.createElement('div');
    block.className = `block ${t.key}`;
    block.style.left = `${x * 25}%`;
    block.style.top = `${y * 20}%`;
    block.style.width = `${t.w * 25}%`;
    block.style.height = `${t.h * 20}%`;
    block.textContent = (t.key === 'q' ? 'Q' : t.key.toUpperCase()) + (part.length > 1 ? pi + 1 : '');
    boardEl.appendChild(block);
  }));
}

let editorMode = false;
let editorTool = 'q';
let editorParts = TYPES.map(() => []);

function editorBlockCount(ti) {
  return editorParts[ti].length;
}

function editorBoardKey() {
  return encode(editorParts);
}

function editorCanPlace(ti, x, y) {
  const t = TYPES[ti];
  if (x < 0 || y < 0 || x + t.w > W || y + t.h > H) return false;
  if (ti === 2 && editorParts[2].length > 0 ) return false;
  const occupancy = occupancyOf(editorParts);
  const m = maskFor(t, x, y);
  for (let i = 0; i < W * H; i++) {
    if ((m & (1 << i)) && occupancy[i]) return false;
  }
  return true;
}

function editorRemoveAt(x, y) {
  const occupancy = occupancyOf(editorParts);
  const ti = occupancy[y * W + x] - 1;
  if (ti < 0) return false;
  const t = TYPES[ti];
  const partIndex = editorParts[ti].findIndex(([px, py]) => px <= x && x < px + t.w && py <= y && y < py + t.h);
  if (partIndex < 0) return false;
  editorParts[ti].splice(partIndex, 1);
  return true;
}

function editorValidate() {
  const counts = {
    v: editorParts[0].length,
    h: editorParts[1].length,
    q: editorParts[2].length,
    s: editorParts[3].length
  };
  const occupied = 2 * counts.v + 2 * counts.h + 4 * counts.q + counts.s;
  const valid = counts.q === 1 && occupied === 18;
  return { valid, counts, occupied };
}

function editorSetupIndex(counts) {
  return SETUPS.findIndex(s =>
    s.v === counts.v &&
    s.h === counts.h &&
    s.q === counts.q &&
    s.s === counts.s
  );
}

function editorStatusText(validation) {
  const { counts, occupied, valid } = validation;
  if (valid) return 'Valid state · 2 empty cells';
  return `Place blocks until the board has exactly 18 occupied cells and one 2×2 square (currently ${occupied}/18, square: ${counts.q}).`;
}

function renderEditor() {
  boardEl.innerHTML = '';
  editorParts.forEach((part, ti) => part.forEach(([x, y], pi) => {
    const t = TYPES[ti];
    const block = document.createElement('div');
    block.className = `block ${t.key} editor-block`;
    block.style.left = `${x * 25}%`;
    block.style.top = `${y * 20}%`;
    block.style.width = `${t.w * 25}%`;
    block.style.height = `${t.h * 20}%`;
    block.textContent = t.key === 'q' ? 'Q' : t.key.toUpperCase();
    block.title = 'Click to remove';
    block.addEventListener('click', e => {
      e.stopPropagation();
      editorParts[ti].splice(pi, 1);
      renderEditor();
    });
    boardEl.appendChild(block);
  }));

  const validation = editorValidate();
  const info = $('editorInfo');
  if (info) info.textContent = editorStatusText(validation);

  document.querySelectorAll('.editor-tool').forEach(btn => {
    btn.classList.toggle('selected', btn.dataset.tool === editorTool);
    const ti = TYPES.findIndex(t => t.key === btn.dataset.tool);
    if (ti >= 0) {
      btn.dataset.count = String(editorBlockCount(ti));
      btn.textContent = `${TYPES[ti].name} (${editorBlockCount(ti)})`;
    }
  });

  const apply = $('applyEditor');
  if (apply) apply.disabled = !validation.valid;
}

function stopEditor() {
  editorMode = false;
  const editorPanel = $('editorPanel');
  if (editorPanel) editorPanel.remove();
  boardEl.onclick = null;
  if (current) {
    renderBoard(current.graph.states[selected]);
    renderStateInfo();
    drawGraph();
  }
}

function applyEditorState() {
  const validation = editorValidate();
  if (!validation.valid) return;

  const setupIndex = editorSetupIndex(validation.counts);
  if (setupIndex < 0) {
    $('editorInfo').textContent = 'This block combination is not a valid setup.';
    return;
  }

  const counts = SETUPS[setupIndex];
  const cacheKey = [counts.v, counts.h, counts.q, counts.s].join(',');
  status.textContent = cache.has(cacheKey) ? 'Loading cached graph…' : 'Enumerating selected setup…';
  setupSelect.value = String(setupIndex);

  const finish = () => {
    const graph = cache.get(cacheKey);
    const key = editorBoardKey();
    const stateId = graph.index.get(key);
    if (stateId === undefined) {
      $('editorInfo').textContent = 'That board is not a generated state.';
      status.textContent = 'Editor board was not found in the state graph.';
      return;
    }

    const groupList = groups(graph);
    current = { graph, groups: groupList, counts };
    groupSelect.innerHTML = groupList.map((g, i) => {
      const label = g.type === 'trivial' ? 'trivial' : g.type === 'unsolvable' ? 'unsolvable' : 'solvable';
      return `<option value="${i}">Group ${i + 1} · ${g.states.length} states · ${label}</option>`;
    }).join('');

    selected = stateId;
    const groupIndex = groupList.findIndex(g => g.states.includes(stateId));
    if (groupIndex >= 0) groupSelect.value = String(groupIndex);

    renderStats(graph, groupList, counts);
    renderBoard(graph.states[selected]);
    renderStateInfo();
    status.textContent = `Selected state ${selected}.`;
    stopEditor();
  };

  if (!cache.has(cacheKey)) {
    setTimeout(() => {
      try {
        const graph = buildGraph(counts);
        graph.depth = computeDepths(graph);
        cache.set(cacheKey, graph);
        finish();
      } catch (err) {
        status.textContent = `Error: ${err.message}`;
        console.error(err);
      }
    }, 20);
  } else {
    finish();
  }
}

function startEditor() {
  if (editorMode) return;

  editorMode = true;
  editorTool = 'q';
  editorParts = TYPES.map(() => []);

  const panel = document.createElement('div');
  panel.id = 'editorPanel';
  panel.className = 'editor-panel';
  panel.innerHTML = `
    <div class="editor-tools">
      <b>Block</b>
      ${TYPES.map(t => `<button type="button" class="editor-tool ${t.key}" data-tool="${t.key}">${t.name} (0)</button>`).join('')}
    </div>
    <div class="editor-actions">
      <button type="button" id="applyEditor" disabled>Use this state</button>
      <button type="button" id="cancelEditor">Cancel</button>
    </div>
    <div id="editorInfo" class="editor-info"></div>
  `;
  boardEl.parentElement.insertBefore(panel, boardEl);
  
  document.querySelectorAll('.editor-tool').forEach(btn => {
    btn.addEventListener('click', () => {
      editorTool = btn.dataset.tool;
      renderEditor();
    });
  });
  $('applyEditor').addEventListener('click', applyEditorState);
  $('cancelEditor').addEventListener('click', stopEditor);

  boardEl.onclick = e => {
    if (e.target !== boardEl) return;
    const rect = boardEl.getBoundingClientRect();
    const x = Math.floor((e.clientX - rect.left) / (rect.width / W));
    const y = Math.floor((e.clientY - rect.top) / (rect.height / H));
    const ti = TYPES.findIndex(t => t.key === editorTool);
    if (ti < 0 || !editorCanPlace(ti, x, y)) return;
    editorParts[ti].push([x, y]);
    editorParts[ti].sort((a, b) => (a[1] - b[1]) || (a[0] - b[0]));
    renderEditor();
  };

  renderEditor();
}

function depthLabel(depth) { return depth === UNREACHED ? '∞' : String(depth); }

function renderAdjacentSection(title, entries, className) {
  if (!entries.length) return '';
  return `<div class="adjacent-section ${className}">
    <div class="adjacent-section-title">${title} <span>(${entries.length})</span></div>
    <div class="adjacent-list">
      ${entries.map(({ i, depth }) => `
        <button class="adjacent-state" data-state="${i}">
          <span>State ${i}</span><span>Depth ${depthLabel(depth)}</span>
        </button>`).join('')}
    </div>
  </div>`;
}

function renderStateInfo() {
  const depth = current.graph.depth[selected];
  const neighborsOfState = current.graph.adjacency[selected]
    .map(i => ({ i, depth: current.graph.depth[i] }));

  const lower = neighborsOfState
    .filter(n => n.depth < depth)
    .sort((a, b) => b.depth - a.depth || a.i - b.i);
  const same = neighborsOfState
    .filter(n => n.depth === depth)
    .sort((a, b) => a.i - b.i);
  const higher = neighborsOfState
    .filter(n => n.depth > depth)
    .sort((a, b) => a.depth - b.depth || a.i - b.i);

  stateInfo.innerHTML = `
    <div><b>State:</b> ${selected}</div>
    <div><b>Depth:</b> ${depthLabel(depth)}</div>
    <div><b>Goal:</b> ${isSolved(current.graph.states[selected]) ? '✓ reached' : 'not reached'}</div>
    <div class="adjacent-title"><b>Adjacent states</b> <span>(${neighborsOfState.length})</span></div>
    ${renderAdjacentSection('Lower depth', lower, 'lower')}
    ${renderAdjacentSection('Same depth', same, 'same')}
    ${renderAdjacentSection('Higher depth', higher, 'higher')}`;

  stateInfo.querySelectorAll('.adjacent-state').forEach(btn => {
    btn.addEventListener('click', () => {
      selected = Number(btn.dataset.state);
      renderBoard(current.graph.states[selected]);
      renderStateInfo();
      drawGraph();
    });
  });
}

let current = null;
let selected = 0;

function layoutGraph(graph, group) {
  const nodes = group.states;
  const pos = new Map();
  const dist = new Map([[nodes[0], 0]]), q = [nodes[0]];
  const groupSet = new Set(nodes);
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
  const canvas = graphCanvas, rect = canvas.getBoundingClientRect();
  canvas.width = 1000; canvas.height = 650;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, rect.width, rect.height);
  const group = current.groups[Number(groupSelect.value) || 0];
  if (group.states.length > 2000) return;
  const pos = layoutGraph(current.graph, group);

  ctx.lineWidth = 1;
  ctx.strokeStyle = '#c8d0d9';
  current.graph.edges.forEach(([a,b]) => {
    if (!pos.has(a) || !pos.has(b)) return;
    ctx.beginPath(); ctx.moveTo(pos.get(a).x, pos.get(a).y); ctx.lineTo(pos.get(b).x, pos.get(b).y); ctx.stroke();
  });

  group.states.forEach(n => {
    const p = pos.get(n); const r = n === selected ? 7 : 4;
    ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
    ctx.fillStyle = n === selected ? '#0969da' : '#57606a'; ctx.fill();
    if ($('showLabels').checked && group.states.length < 500) {
      const d = current.graph.depth[n];
      ctx.fillStyle = '#57606a'; ctx.font = '10px system-ui';
      ctx.fillText(d === UNREACHED ? '∞' : String(d), p.x + 6, p.y + 3);
    }
  });
  canvas._positions = pos;
}

function pickNode(e) {
  if (!current || !graphCanvas._positions) return;
  const rect = graphCanvas.getBoundingClientRect();
  const x = e.clientX - rect.left, y = e.clientY - rect.top;
  const group = current.groups[Number(groupSelect.value) || 0];
  let best = null, bd = 12;
  group.states.forEach(n => {
    const p = graphCanvas._positions.get(n); if (!p) return;
    const d = Math.hypot(p.x-x,p.y-y);
    if (d < bd) { bd=d; best=n; }
  });
  if (best !== null) { selected = best; renderBoard(current.graph.states[selected]); renderStateInfo(); drawGraph(); }
}

const editButton = document.createElement('button');
editButton.id = 'editBoard';
editButton.textContent = 'Edit board';
editButton.addEventListener('click', startEditor);
$('enumerate').parentElement.insertBefore(editButton, $('enumerate'));

enumerateSetup();
$('enumerate').addEventListener('click', enumerateSetup);
groupSelect.addEventListener('change', () => {
  selected = current.groups[Number(groupSelect.value)].states[0];
  renderBoard(current.graph.states[selected]);
  renderStateInfo();
  drawGraph();
});
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
      if (!cache.has(cacheKey)) {
        const graph = buildGraph(counts);
        graph.depth = computeDepths(graph);
        cache.set(cacheKey, graph);
      }
      const graph = cache.get(cacheKey);
      const groupList = groups(graph);
      current = { graph, groups: groupList, counts };
      groupSelect.innerHTML = groupList.map((g, i) => {
        const label = g.type === 'trivial' ? 'trivial' : g.type === 'unsolvable' ? 'unsolvable' : 'solvable';
        return `<option value="${i}">Group ${i + 1} · ${g.states.length} states · ${label}</option>`;
      }).join('');
      selected = groupList[0].states[0];
      renderStats(graph, groupList, counts);
      renderBoard(graph.states[selected]);
      renderStateInfo();
      status.textContent = `${graph.states.length.toLocaleString()} states enumerated.`;
      drawGraph();
    } catch (err) {
      status.textContent = `Error: ${err.message}`;
      console.error(err);
    }
  }, 20);
}
