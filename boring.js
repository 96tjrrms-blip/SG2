const BORING_STATE_KEY  = 'boring_state_v1';
const BORING_CUSTOM_KEY = 'boring_custom';

// === 3단계 색상 관리 ===
function _getBoringStateMap() {
  try { return JSON.parse(localStorage.getItem(BORING_STATE_KEY) || '{}'); }
  catch { return {}; }
}
function _saveBoringStateMap(m) {
  localStorage.setItem(BORING_STATE_KEY, JSON.stringify(m));
}

window.setBoringState = function(id, state) {
  const m = _getBoringStateMap();
  m[id] = state;
  _saveBoringStateMap(m);
  renderBoringPoints();
};

function _boringColors(state) {
  if (state === 1) return { fill: '#dcfce7', stroke: '#16a34a', text: '#14532d' };
  if (state === 2) return { fill: '#1e293b', stroke: '#0f172a', text: '#ffffff' };
  return { fill: '#ffffff', stroke: '#1e293b', text: '#0f172a' };
}

// === 커스텀 마커 관리 ===
function _getCustomPoints() {
  try { return JSON.parse(localStorage.getItem(BORING_CUSTOM_KEY) || '[]'); }
  catch { return []; }
}

function _addCustomPoint(id, x, y) {
  const pts = _getCustomPoints();
  if (pts.some(p => p.id === id)) { alert('이미 존재하는 ID입니다: ' + id); return false; }
  pts.push({ id, x, y, custom: true });
  localStorage.setItem(BORING_CUSTOM_KEY, JSON.stringify(pts));
  return true;
}

function _removeCustomPoint(id) {
  const pts = _getCustomPoints().filter(p => p.id !== id);
  localStorage.setItem(BORING_CUSTOM_KEY, JSON.stringify(pts));
}

// === 변환 ===
function _getBoringTransform() {
  try {
    const t = JSON.parse(localStorage.getItem('boring_transform') || '{}');
    return {
      offsetX:  t.offsetX  !== undefined ? t.offsetX  : 0,
      offsetY:  t.offsetY  !== undefined ? t.offsetY  : 0,
      scaleX:   t.scaleX   !== undefined ? t.scaleX   : 1,
      scaleY:   t.scaleY   !== undefined ? t.scaleY   : 1,
      rotation: t.rotation !== undefined ? t.rotation : 0,
    };
  } catch { return { offsetX:0, offsetY:0, scaleX:1, scaleY:1, rotation:0 }; }
}

// === 메인 렌더 ===
function renderBoringPoints() {
  const svg = document.getElementById('map-svg');
  if (!svg) return;
  svg.querySelectorAll('.boring-marker').forEach(el => el.remove());

  const visible = localStorage.getItem('boring_visible') !== 'false';
  if (!visible || typeof BORING_POINTS === 'undefined' || !BORING_POINTS.length) return;

  const customPts = _getCustomPoints();
  const allPts    = [...BORING_POINTS, ...customPts];
  const stateMap  = _getBoringStateMap();
  const W = svg.clientWidth  || svg.parentElement.clientWidth;
  const H = svg.clientHeight || svg.parentElement.clientHeight;
  const tr  = _getBoringTransform();
  const rad = tr.rotation * Math.PI / 180;

  allPts.forEach(pt => {
    const dx = (pt.x - 50) * tr.scaleX;
    const dy = (pt.y - 50) * tr.scaleY;
    const fx = 50 + dx * Math.cos(rad) - dy * Math.sin(rad) + tr.offsetX;
    const fy = 50 + dx * Math.sin(rad) + dy * Math.cos(rad) + tr.offsetY;
    const cx = (fx / 100) * W;
    const cy = (fy / 100) * H;
    const state    = stateMap[pt.id] || 0;
    const { fill: fillColor, stroke: strokeColor, text: textColor } = _boringColors(state);
    const isCustom = !!pt.custom;

    const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    g.classList.add('boring-marker');
    g.style.cursor = 'pointer';
    g.dataset.id   = pt.id;
    g.setAttribute('transform', `translate(${cx},${cy})`);

    const outer = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    outer.setAttribute('r', 8);
    outer.setAttribute('fill', fillColor);
    outer.setAttribute('stroke', strokeColor);
    outer.setAttribute('stroke-width', 1.5);

    const inner = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    inner.setAttribute('r', 5);
    inner.setAttribute('fill', 'none');
    inner.setAttribute('stroke', strokeColor);
    inner.setAttribute('stroke-width', 1);

    const symL = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    symL.setAttribute('x1', -2.5); symL.setAttribute('y1', -3);
    symL.setAttribute('x2', -2.5); symL.setAttribute('y2',  3);
    symL.setAttribute('stroke', strokeColor); symL.setAttribute('stroke-width', 1);

    const symR = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    symR.setAttribute('x1', 2.5); symR.setAttribute('y1', -3);
    symR.setAttribute('x2', 2.5); symR.setAttribute('y2',  3);
    symR.setAttribute('stroke', strokeColor); symR.setAttribute('stroke-width', 1);

    const symH = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    symH.setAttribute('x1', -2.5); symH.setAttribute('y1', 0);
    symH.setAttribute('x2',  2.5); symH.setAttribute('y2', 0);
    symH.setAttribute('stroke', strokeColor); symH.setAttribute('stroke-width', 1);

    const labelW  = pt.id.length * 5.2 + 6;
    const labelBg = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    labelBg.setAttribute('x', -(labelW / 2));
    labelBg.setAttribute('y', -22);
    labelBg.setAttribute('width',  labelW);
    labelBg.setAttribute('height', 11);
    labelBg.setAttribute('rx', 2);
    labelBg.setAttribute('fill', 'rgba(255,255,255,0.9)');

    const label = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    label.setAttribute('y', -13);
    label.setAttribute('text-anchor', 'middle');
    label.setAttribute('font-size', '9');
    label.setAttribute('font-weight', '700');
    label.setAttribute('fill', textColor);
    label.setAttribute('font-family', 'sans-serif');
    label.setAttribute('text-rendering', 'geometricPrecision');
    label.setAttribute('paint-order', 'stroke');
    label.setAttribute('stroke', 'white');
    label.setAttribute('stroke-width', '2');
    label.setAttribute('stroke-linejoin', 'round');
    label.textContent = pt.id;

    g.append(outer, inner, symL, symR, symH, labelBg, label);

    if (isCustom) {
      const dot = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      dot.setAttribute('cx', 6); dot.setAttribute('cy', -6);
      dot.setAttribute('r', 3);
      dot.setAttribute('fill', '#f97316');
      dot.setAttribute('stroke', 'white');
      dot.setAttribute('stroke-width', 1);
      g.appendChild(dot);
    }

    g.addEventListener('click', (e) => {
      e.stopPropagation();
      if (typeof openBoringPanel === 'function') openBoringPanel(pt.id, isCustom);
    });
    svg.appendChild(g);
  });
}

// === 표시 토글 ===
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

// === 추가 모드 ===
window._boringEditMode = false;

function toggleBoringEditMode() {
  window._boringEditMode = !window._boringEditMode;
  const btn     = document.getElementById('boring-edit-btn');
  const overlay = document.getElementById('boring-add-overlay');
  if (btn) {
    btn.textContent   = window._boringEditMode ? '✏ 추가 ON' : '✏ 마커 추가';
    btn.style.background  = window._boringEditMode ? '#fef3c7' : '';
    btn.style.color       = window._boringEditMode ? '#92400e' : '';
    btn.style.borderColor = window._boringEditMode ? '#f59e0b' : '';
  }
  if (overlay) overlay.style.display = window._boringEditMode ? 'block' : 'none';
}

// === LC-14 기준선 위의 마커 일괄 상태 변경 ===
window.applyBoringAboveLine = function(refId, state) {
  const allPts = typeof BORING_POINTS !== 'undefined'
    ? [...BORING_POINTS, ..._getCustomPoints()]
    : _getCustomPoints();
  const ref = allPts.find(p => p.id === refId);
  if (!ref) { alert('기준 마커를 찾을 수 없습니다: ' + refId); return; }

  const tr  = _getBoringTransform();
  const rad = tr.rotation * Math.PI / 180;
  function transformedFy(pt) {
    const dx = (pt.x - 50) * tr.scaleX;
    const dy = (pt.y - 50) * tr.scaleY;
    return 50 + dx * Math.sin(rad) + dy * Math.cos(rad) + tr.offsetY;
  }

  const refY = transformedFy(ref);
  const m = _getBoringStateMap();
  let count = 0;
  allPts.forEach(pt => {
    if (transformedFy(pt) < refY) { m[pt.id] = state; count++; }
  });
  _saveBoringStateMap(m);
  renderBoringPoints();
  return count;
};

window._onBoringAddClick = function(e) {
  const id = prompt('천공 마커 ID 입력 (예: H5-1):');
  if (!id || !id.trim()) return;
  const container = document.getElementById('map-container');
  if (!container) return;
  const rect  = container.getBoundingClientRect();
  const zoom  = (typeof getMapZoom === 'function') ? getMapZoom() : { scale:1, tx:0, ty:0 };
  const rawX  = (e.clientX - rect.left - zoom.tx) / zoom.scale;
  const rawY  = (e.clientY - rect.top  - zoom.ty) / zoom.scale;
  const xPct  = +(rawX / container.clientWidth  * 100).toFixed(2);
  const yPct  = +(rawY / container.clientHeight * 100).toFixed(2);
  if (_addCustomPoint(id.trim(), xPct, yPct)) renderBoringPoints();
};
