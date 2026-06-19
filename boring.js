const BORING_DONE_KEY = 'boring_done_v1';

function _boringDoneSet() {
  try { return new Set(JSON.parse(localStorage.getItem(BORING_DONE_KEY) || '[]')); }
  catch { return new Set(); }
}
function _saveDoneSet(s) {
  localStorage.setItem(BORING_DONE_KEY, JSON.stringify([...s]));
}

function renderBoringPoints() {
  const svg = document.getElementById('map-svg');
  if (!svg) return;

  // 기존 천공 레이어 제거
  svg.querySelectorAll('.boring-marker').forEach(el => el.remove());

  const visible = localStorage.getItem('boring_visible') !== 'false';
  if (!visible || !window.BORING_POINTS) return;

  const done = _boringDoneSet();
  const W = svg.clientWidth  || svg.parentElement.clientWidth;
  const H = svg.clientHeight || svg.parentElement.clientHeight;

  BORING_POINTS.forEach(pt => {
    const cx = (pt.x / 100) * W;
    const cy = (pt.y / 100) * H;
    const isDone = done.has(pt.id);

    const strokeColor = isDone ? '#16a34a' : '#1e293b';
    const fillColor   = isDone ? '#dcfce7' : '#ffffff';
    const textColor   = isDone ? '#14532d' : '#0f172a';

    const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    g.classList.add('boring-marker');
    g.style.cursor = 'pointer';
    g.dataset.id = pt.id;
    g.setAttribute('transform', `translate(${cx},${cy})`);

    // 바깥 원
    const outer = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    outer.setAttribute('r', 13);
    outer.setAttribute('fill', fillColor);
    outer.setAttribute('stroke', strokeColor);
    outer.setAttribute('stroke-width', 2);

    // 안쪽 원
    const inner = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    inner.setAttribute('r', 8);
    inner.setAttribute('fill', 'none');
    inner.setAttribute('stroke', strokeColor);
    inner.setAttribute('stroke-width', 1.5);

    // H 심볼 (두 수직선 + 가로 연결)
    const symL = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    symL.setAttribute('x1', -4); symL.setAttribute('y1', -5);
    symL.setAttribute('x2', -4); symL.setAttribute('y2',  5);
    symL.setAttribute('stroke', strokeColor); symL.setAttribute('stroke-width', 1.5);

    const symR = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    symR.setAttribute('x1', 4); symR.setAttribute('y1', -5);
    symR.setAttribute('x2', 4); symR.setAttribute('y2',  5);
    symR.setAttribute('stroke', strokeColor); symR.setAttribute('stroke-width', 1.5);

    const symH = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    symH.setAttribute('x1', -4); symH.setAttribute('y1', 0);
    symH.setAttribute('x2',  4); symH.setAttribute('y2', 0);
    symH.setAttribute('stroke', strokeColor); symH.setAttribute('stroke-width', 1.5);

    // 라벨 (위쪽)
    const label = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    label.setAttribute('y', -17);
    label.setAttribute('text-anchor', 'middle');
    label.setAttribute('font-size', '10');
    label.setAttribute('font-weight', '700');
    label.setAttribute('fill', textColor);
    label.setAttribute('font-family', 'sans-serif');
    label.textContent = pt.id;

    g.append(outer, inner, symL, symR, symH, label);
    g.addEventListener('click', (e) => {
      e.stopPropagation();
      _toggleBoringDone(pt.id);
    });
    svg.appendChild(g);
  });
}

function _toggleBoringDone(id) {
  const s = _boringDoneSet();
  if (s.has(id)) s.delete(id); else s.add(id);
  _saveDoneSet(s);
  renderBoringPoints();
}

function toggleBoringVisible() {
  const cur = localStorage.getItem('boring_visible') !== 'false';
  localStorage.setItem('boring_visible', cur ? 'false' : 'true');
  _updateBoringBtn();
  renderBoringPoints();
}

function _updateBoringBtn() {
  const visible = localStorage.getItem('boring_visible') !== 'false';
  const btn = document.getElementById('boring-toggle-btn');
  if (btn) btn.textContent = visible ? '⊕ 천공위치 숨기기' : '⊕ 천공위치 표시';
}
