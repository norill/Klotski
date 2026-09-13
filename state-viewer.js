(function () {
  const style = document.createElement('style');
  style.textContent = `
    .adjacent-section { margin-top: 10px; }
    .adjacent-section-title { margin: 8px 0 4px; font-size: 0.82rem; font-weight: 700; }
    .adjacent-section-title.lower { color: #188038; }
    .adjacent-section-title.same { color: #666; }
    .adjacent-section-title.higher { color: #c5221f; }
    .adjacent-list { display: flex; flex-direction: column; gap: 3px; }
    .adjacent-state { display: flex; justify-content: space-between; align-items: center; width: 100%; padding: 4px 7px; border: 0; border-radius: 4px; background: transparent; font: inherit; text-align: left; cursor: pointer; }
    .adjacent-state:hover { background: #f0f2f5; }
    .adjacent-state span:last-child { font-variant-numeric: tabular-nums; opacity: .85; }
  `;
  document.head.appendChild(style);

  function renderStateInfoRelative() {
    const currentDepth = current.graph.depth[selected];
    const neighbors = current.graph.adjacency[selected].map(i => ({ i, depth: current.graph.depth[i] }));
    const sections = [
      { key: 'lower', title: 'Lower depth', items: neighbors.filter(n => currentDepth >= 0 && n.depth >= 0 && n.depth < currentDepth) },
      { key: 'same', title: 'Same depth', items: neighbors.filter(n => n.depth === currentDepth) },
      { key: 'higher', title: 'Higher depth', items: neighbors.filter(n => currentDepth >= 0 && n.depth > currentDepth) }
    ];
    sections.forEach(section => section.items.sort((a, b) => a.depth - b.depth || a.i - b.i));

    const total = neighbors.length;
    const goal = isSolved(current.graph.states[selected]);
    stateInfo.innerHTML = `
      <div><b>State:</b> ${selected}</div>
      <div><b>Depth:</b> ${currentDepth < 0 ? '∞' : currentDepth}</div>
      <div><b>Goal:</b> ${goal ? '✓ reached' : 'not reached'}</div>
      <div class="adjacent-title"><b>Adjacent states</b> <span>(${total})</span></div>
      ${sections.map(section => section.items.length ? `
        <div class="adjacent-section">
          <div class="adjacent-section-title ${section.key}">${section.title} (${section.items.length})</div>
          <div class="adjacent-list">
            ${section.items.map(({ i, depth }) => `
              <button class="adjacent-state" data-state="${i}">
                <span>${i}</span><span>${depth}</span>
              </button>`).join('')}
          </div>
        </div>` : '').join('')}
      ${total === 0 ? '<span>None</span>' : ''}`;

    stateInfo.querySelectorAll('.adjacent-state').forEach(btn => {
      btn.addEventListener('click', () => {
        selected = Number(btn.dataset.state);
        renderBoard(current.graph.states[selected]);
        renderStateInfo();
        drawGraph();
      });
    });
  }

  window.renderStateInfo = renderStateInfoRelative;
})();
