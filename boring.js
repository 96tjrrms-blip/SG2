const BORING_STATE_KEY  = 'boring_state_v1';
const BORING_CUSTOM_KEY = 'boring_custom';
const BORING_HIDDEN_KEY = 'boring_hidden_v1';

// LC-14(y=52.08) 기준선 위 → 기본값 영향무(2)
const BORING_DEFAULT_STATES = {
  "F-45":2,"F-46":2,"F-47":2,"F-48":2,"F-49":2,"F-50":2,"F-51":2,"H1-18":2,"H1-19":2,"H1-20":2,"H1-21":2,"H1-22":2,
  "H1-23":2,"H1-24":2,"H1-25":2,"H1-26":2,"H1-27":2,"H1-28":2,"F-13":2,"F-14":2,"F-15":2,"F-16":2,"F-17":2,"F-18":2,
  "F-19":2,"F-44":2,"F-52":2,"F-54":2,"F-55":2,"F-56":2,"F-57":2,"F-58":2,"F-59":2,"F-43":2,"H1-17":2,"F-20":2,
  "F-25":2,"F-26":2,"F-27":2,"F-28":2,"F-29":2,"F-30":2,"F-31":2,"F-32":2,"F-33":2,"F-34":2,"F-35":2,"F-36":2,
  "F-37":2,"F-38":2,"F-39":2,"F-40":2,"F-41":2,"F-42":2,"F-53":2,"F-8":2,"H1-29":2,"F-12":2,"LC-13":2,"F-60":2,
  "H4-2":2,"H4-3":2,"H4-4":2,"H4-5":2,"H4-6":2,"H4-7":2,"H4-8":2,"H4-9":2,"H4-13":2,"H4-14":2,"H4-15":2,"H4-16":2,
  "H4-17":2,"H4-18":2,"H4-19":2,"H4-20":2,"H4-21":2,"H4-22":2,"H4-23":2,"H4-24":2,"H4-25":2,"H4-26":2,"H1-1":2,"H1-2":2,
  "H1-3":2,"H1-4":2,"H1-5":2,"H1-6":2,"H1-7":2,"H1-8":2,"H1-9":2,"H1-10":2,"H1-11":2,"H1-12":2,"H1-13":2,"F-7":2,
  "H1-31":2,"H1-33":2,"F-11":2,"L-66":2,"L-67":2,"L-68":2,"L-69":2,"L-7":2,"F-2":2,"F-6":2,"F-10":2,"L-34":2,
  "L-35":2,"L-36":2,"L-37":2,"L-31":2,"F-1":2,"F-5":2,"L-38":2,"E-3":2,"L-1":2,"L-2":2,"L-3":2,"L-4":2,
  "L-5":2,"L-6":2,"L-30":2,"L-39":2,"L-40":2,"L-41":2,"L-42":2,"L-43":2,"L-44":2,"L-45":2,"L-46":2,"L-47":2,
  "L-48":2,"L-49":2,"L-50":2,"L-51":2,"L-52":2,"L-53":2,"L-54":2,"L-55":2,"L-56":2,"L-57":2,"L-58":2,"L-59":2,
  "L-60":2,"L-61":2,"L-63":2,"E-4":2,"S-1":2,"L-10":2,"L-11":2,"L-12":2,"L-13":2,"L-14":2,"L-15":2,"L-16":2,
  "L-17":2,"L-18":2,"L-19":2,"L-20":2,"L-21":2,"L-22":2,"L-23":2,"L-24":2,"L-25":2,"L-26":2,"L-27":2,"L-28":2,
  "L-29":2,"LC-15":2,"L-62":2,"E-5":2,"S-2":2,"S-3":2,"LC-1":2,"H1-37":2,"H1-41":2,"H1-42":2,"H1-43":2,"S-4":2,
  "LC-3":2,"S-5":2,"RC1-3":2,"RC1-4":2,"RC1-5":2,"LC-2":2,"S-6":2,"S-7":2,"C-1":2,"S-8":2,"C-7":2,"C-8":2,
  "C-9":2,"C-10":2,"C-11":2,"C-2":2,"S-9":2,"C-3":2,"H4-10":2,"H4-11":2,"H4-12":2,"H1-34":2,"H1-35":2,"L-32":2,
  "L-33":2,"H1-36":2,"F-9":2,"L-8":2,"L-9":2,"F-3":2,"F-4":2,"LC-9":2,"LC-10":2,"LC-6":2,"LC-5":2,"H1-38":2,
  "LC-4":2,
};

// === 색상 상태 ===
function _getBoringStateMap() {
  try { return JSON.parse(localStorage.getItem(BORING_STATE_KEY) || '{}'); }
  catch { return {}; }
}
function _saveBoringStateMap(m) {
  localStorage.setItem(BORING_STATE_KEY, JSON.stringify(m));
  if (typeof upsertPipeSettings === 'function')
    upsertPipeSettings('_boring_states', { colors: m }).catch(() => {});
}
function _getBoringState(id) {
  const m = _getBoringStateMap();
  return m[id] !== undefined ? m[id] : (BORING_DEFAULT_STATES[id] || 0);
}

window.setBoringState = function(id, state) {
  const m = _getBoringStateMap();
  m[id] = state;
  _saveBoringStateMap(m);
  renderBoringPoints();
};

function _boringColors(state) {
  if (state === 1) return { fill: '#dcfce7', stroke: '#16a34a' };
  if (state === 2) return { fill: '#1e293b', stroke: '#0f172a' };
  return { fill: '#ffffff', stroke: '#1e293b' };
}

// === 숨긴 마커 관리 ===
function _getHiddenSet() {
  try { return new Set(JSON.parse(localStorage.getItem(BORING_HIDDEN_KEY) || '[]')); }
  catch { return new Set(); }
}
function _hideMarker(id) {
  const h = _getHiddenSet(); h.add(id);
  const arr = [...h];
  localStorage.setItem(BORING_HIDDEN_KEY, JSON.stringify(arr));
  if (typeof upsertPipeSettings === 'function')
    upsertPipeSettings('_boring_hidden', { colors: arr }).catch(() => {});
}
window.restoreAllHiddenMarkers = function() {
  localStorage.removeItem(BORING_HIDDEN_KEY);
  if (typeof upsertPipeSettings === 'function')
    upsertPipeSettings('_boring_hidden', { colors: [] }).catch(() => {});
  renderBoringPoints();
};

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
  if (typeof upsertPipeSettings === 'function')
    upsertPipeSettings('_boring_custom', { colors: pts }).catch(() => {});
  return true;
}
function _removeCustomPoint(id) {
  const pts = _getCustomPoints().filter(p => p.id !== id);
  localStorage.setItem(BORING_CUSTOM_KEY, JSON.stringify(pts));
  if (typeof upsertPipeSettings === 'function')
    upsertPipeSettings('_boring_custom', { colors: pts }).catch(() => {});
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

// === 마커 편집 모드 ===
window._boringMarkerMode = null; // null | 'add' | 'del'

window.toggleBoringMarkerEdit = function() {
  if (window._boringMarkerMode !== null) {
    _exitBoringMarkerEdit();
  } else {
    const sub = document.getElementById('boring-marker-sub');
    const btn = document.getElementById('boring-edit-btn');
    if (sub) sub.style.display = 'flex';
    if (btn) {
      btn.style.background  = '#fef3c7';
      btn.style.color       = '#92400e';
      btn.style.borderColor = '#f59e0b';
    }
  }
};

window.setBoringMarkerMode = function(mode) {
  window._boringMarkerMode = mode;
  const overlay = document.getElementById('boring-add-overlay');
  const addBtn  = document.getElementById('boring-add-sub');
  const delBtn  = document.getElementById('boring-del-sub');

  if (mode === 'add') {
    if (overlay) overlay.style.display = 'block';
    if (addBtn) { addBtn.style.background = '#fef3c7'; addBtn.style.color = '#92400e'; addBtn.style.borderColor = '#f59e0b'; }
    if (delBtn) { delBtn.style.background = ''; delBtn.style.color = ''; delBtn.style.borderColor = ''; }
  } else {
    if (overlay) overlay.style.display = 'none';
    if (delBtn) { delBtn.style.background = '#fee2e2'; delBtn.style.color = '#dc2626'; delBtn.style.borderColor = '#fca5a5'; }
    if (addBtn) { addBtn.style.background = ''; addBtn.style.color = ''; addBtn.style.borderColor = ''; }
  }
  renderBoringPoints();
};

function _exitBoringMarkerEdit() {
  window._boringMarkerMode = null;
  const overlay = document.getElementById('boring-add-overlay');
  const sub     = document.getElementById('boring-marker-sub');
  const btn     = document.getElementById('boring-edit-btn');
  const addBtn  = document.getElementById('boring-add-sub');
  const delBtn  = document.getElementById('boring-del-sub');
  if (overlay) overlay.style.display = 'none';
  if (sub)     sub.style.display = 'none';
  if (btn)     { btn.style.background = ''; btn.style.color = ''; btn.style.borderColor = ''; }
  if (addBtn)  { addBtn.style.background = ''; addBtn.style.color = ''; addBtn.style.borderColor = ''; }
  if (delBtn)  { delBtn.style.background = ''; delBtn.style.color = ''; delBtn.style.borderColor = ''; }
  renderBoringPoints();
}

// === 메인 렌더 ===
function renderBoringPoints() {
  const svg = document.getElementById('overlay-svg');
  if (!svg) return;
  svg.querySelectorAll('.boring-marker').forEach(el => el.remove());

  const visible = localStorage.getItem('boring_visible') !== 'false';
  if (!visible || typeof BORING_POINTS === 'undefined' || !BORING_POINTS.length) return;

  const container = document.getElementById('map-container');
  if (!container) return;
  const W = container.clientWidth;
  const H = container.clientHeight;
  if (!W || !H) return;

  const zoom   = typeof getMapZoom === 'function' ? getMapZoom() : { scale:1, tx:0, ty:0 };
  const hidden = _getHiddenSet();
  const isDelMode = window._boringMarkerMode === 'del';

  const customPts = _getCustomPoints();
  const allPts    = [...BORING_POINTS, ...customPts];
  const tr  = _getBoringTransform();
  const rad = tr.rotation * Math.PI / 180;

  allPts.forEach(pt => {
    if (hidden.has(pt.id)) return;

    const dx = (pt.x - 50) * tr.scaleX;
    const dy = (pt.y - 50) * tr.scaleY;
    const fx = 50 + dx * Math.cos(rad) - dy * Math.sin(rad) + tr.offsetX;
    const fy = 50 + dx * Math.sin(rad) + dy * Math.cos(rad) + tr.offsetY;

    const cx = (fx / 100) * W * zoom.scale + zoom.tx;
    const cy = (fy / 100) * H * zoom.scale + zoom.ty;

    const state    = _getBoringState(pt.id);
    const { fill: fillColor, stroke: strokeColor } = _boringColors(state);
    const isCustom = !!pt.custom;

    const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    g.classList.add('boring-marker');
    g.style.cursor = isDelMode ? 'crosshair' : 'pointer';
    g.style.pointerEvents = 'all';
    g.dataset.id = pt.id;
    g.setAttribute('transform', `translate(${cx},${cy})`);

    const outer = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    outer.setAttribute('r', 8);
    outer.setAttribute('fill', isDelMode ? 'rgba(239,68,68,0.15)' : fillColor);
    outer.setAttribute('stroke', isDelMode ? '#ef4444' : strokeColor);
    outer.setAttribute('stroke-width', isDelMode ? 2 : 1.5);

    const inner = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    inner.setAttribute('r', 5);
    inner.setAttribute('fill', 'none');
    inner.setAttribute('stroke', isDelMode ? '#ef4444' : strokeColor);
    inner.setAttribute('stroke-width', 1);

    const symL = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    symL.setAttribute('x1', -2.5); symL.setAttribute('y1', -3);
    symL.setAttribute('x2', -2.5); symL.setAttribute('y2',  3);
    symL.setAttribute('stroke', isDelMode ? '#ef4444' : strokeColor); symL.setAttribute('stroke-width', 1);

    const symR = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    symR.setAttribute('x1', 2.5); symR.setAttribute('y1', -3);
    symR.setAttribute('x2', 2.5); symR.setAttribute('y2',  3);
    symR.setAttribute('stroke', isDelMode ? '#ef4444' : strokeColor); symR.setAttribute('stroke-width', 1);

    const symH = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    symH.setAttribute('x1', -2.5); symH.setAttribute('y1', 0);
    symH.setAttribute('x2',  2.5); symH.setAttribute('y2', 0);
    symH.setAttribute('stroke', isDelMode ? '#ef4444' : strokeColor); symH.setAttribute('stroke-width', 1);

    const labelW  = pt.id.length * 5.5 + 8;
    const labelBg = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    labelBg.setAttribute('x', -(labelW / 2));
    labelBg.setAttribute('y', -23);
    labelBg.setAttribute('width',  labelW);
    labelBg.setAttribute('height', 12);
    labelBg.setAttribute('rx', 2);
    labelBg.setAttribute('fill', isDelMode ? 'rgba(254,226,226,0.95)' : 'rgba(255,255,255,0.95)');
    labelBg.setAttribute('stroke', isDelMode ? '#fca5a5' : '#cbd5e1');
    labelBg.setAttribute('stroke-width', 0.5);

    const label = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    label.setAttribute('y', -13);
    label.setAttribute('text-anchor', 'middle');
    label.setAttribute('font-size', '10');
    label.setAttribute('font-weight', '700');
    label.setAttribute('fill', isDelMode ? '#dc2626' : '#0f172a');
    label.setAttribute('font-family', 'sans-serif');
    label.setAttribute('text-rendering', 'geometricPrecision');
    label.textContent = pt.id;

    g.append(outer, inner, symL, symR, symH, labelBg, label);

    // 커스텀 마커 표시 (주황 점)
    if (isCustom && !isDelMode) {
      const dot = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      dot.setAttribute('cx', 6); dot.setAttribute('cy', -6);
      dot.setAttribute('r', 3);
      dot.setAttribute('fill', '#f97316');
      dot.setAttribute('stroke', 'white');
      dot.setAttribute('stroke-width', 1);
      g.appendChild(dot);
    }

    // 삭제 모드 X 배지
    if (isDelMode) {
      const xBg = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      xBg.setAttribute('cx', 7); xBg.setAttribute('cy', -7);
      xBg.setAttribute('r', 5);
      xBg.setAttribute('fill', '#ef4444');
      xBg.setAttribute('stroke', '#fff');
      xBg.setAttribute('stroke-width', 1);
      const xTxt = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      xTxt.setAttribute('x', 7); xTxt.setAttribute('y', -4);
      xTxt.setAttribute('text-anchor', 'middle');
      xTxt.setAttribute('font-size', '8');
      xTxt.setAttribute('font-weight', '900');
      xTxt.setAttribute('fill', '#fff');
      xTxt.textContent = '✕';
      g.append(xBg, xTxt);
    }

    // 클릭 핸들러
    if (isDelMode) {
      g.addEventListener('click', e => {
        e.stopPropagation();
        const action = isCustom ? '삭제' : '숨기기';
        if (!confirm(`"${pt.id}" 마커를 ${action}할까요?${isCustom ? '' : '\n(기본 마커는 숨기기만 가능합니다)'}`)) return;
        if (isCustom) {
          _removeCustomPoint(pt.id);
        } else {
          _hideMarker(pt.id);
        }
        renderBoringPoints();
      });
    } else {
      g.addEventListener('click', e => {
        e.stopPropagation();
        if (typeof openBoringPanel === 'function') openBoringPanel(pt.id, isCustom);
      });
    }

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

// === 마커 추가 클릭 핸들러 ===
window._onBoringAddClick = function(e) {
  if (window._boringMarkerMode !== 'add') return;
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

// === LC-14 기준선 일괄 상태 변경 ===
window.applyBoringAboveLine = function(refId, state) {
  const allPts = typeof BORING_POINTS !== 'undefined'
    ? [...BORING_POINTS, ..._getCustomPoints()]
    : _getCustomPoints();
  const ref = allPts.find(p => p.id === refId);
  if (!ref) { alert('기준 마커를 찾을 수 없습니다: ' + refId); return; }

  const tr  = _getBoringTransform();
  const rad = tr.rotation * Math.PI / 180;
  function tFy(pt) {
    const dx = (pt.x - 50) * tr.scaleX;
    const dy = (pt.y - 50) * tr.scaleY;
    return 50 + dx * Math.sin(rad) + dy * Math.cos(rad) + tr.offsetY;
  }

  const refY = tFy(ref);
  const m = _getBoringStateMap();
  let count = 0;
  allPts.forEach(pt => { if (tFy(pt) < refY) { m[pt.id] = state; count++; } });
  _saveBoringStateMap(m);
  renderBoringPoints();
  return count;
};

// === 줌/리사이즈 재렌더 ===
document.addEventListener('map-zoom-changed', renderBoringPoints);
window.addEventListener('resize', function() {
  clearTimeout(window._boringResizeT);
  window._boringResizeT = setTimeout(renderBoringPoints, 150);
});

document.addEventListener('DOMContentLoaded', () => {
  _updateBoringBtn();
  renderBoringPoints();
});
