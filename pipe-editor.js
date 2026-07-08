// ===== 배관 편집기 =====
// custom_pipes_{siteId}: { segments: [...], valves: [...] }

const PIPE_ED_KEY = 'custom_pipes_v1';

let _peMode   = null;   // null | 'draw' | 'valve'
let _pePts    = [];     // 현재 그리고 있는 배관 꼭짓점
let _peCustom = {};     // { siteId: { segments:[], valves:[] } }

// ── 로드/저장 ──────────────────────────────────────────────────
(function _loadLocal() {
  try { _peCustom = JSON.parse(localStorage.getItem(PIPE_ED_KEY) || '{}'); } catch {}
})();

function _peSaveLocal() {
  localStorage.setItem(PIPE_ED_KEY, JSON.stringify(_peCustom));
}

function _peData(siteId) {
  if (!_peCustom[siteId]) _peCustom[siteId] = { segments: [], valves: [] };
  return _peCustom[siteId];
}

async function _peSaveSupabase(siteId) {
  try {
    await upsertPipeSettings(`_custom_pipes_${siteId}`, { colors: _peData(siteId) });
  } catch(e) { console.warn('custom pipe save 실패:', e); }
}

window._loadCustomPipesForSite = async function(siteId) {
  try {
    const rows = await fetchAllPipeSettings();
    const key  = `_custom_pipes_${siteId}`;
    if (rows[key]?.colors) {
      _peCustom[siteId] = rows[key].colors;
      _peSaveLocal();
    }
  } catch {}
  if (typeof renderAllPipes === 'function') renderAllPipes();
};

// ── 렌더링 (map.js의 renderAllPipes에서 호출) ─────────────────
window._renderCustomPipes = function() {
  const siteId = window.currentDashSite || '115st';
  const svg    = document.getElementById('map-svg');
  if (!svg) return;
  const data = _peData(siteId);

  // 배관 세그먼트 (커스텀 파이프는 항상 _drawSimplePipeLine — 레이블 포함)
  data.segments.forEach(seg => _drawSimplePipeLine(svg, seg));

  // 밸브 (크게, 클릭 가능)
  const r = Math.max(22, (window._mapNatW || 800) / 32);
  data.valves.forEach(v => _drawCustomValveGroup(svg, v, r, siteId));

  // 편집 중 그리기 미리보기
  if (_peMode === 'draw' && _pePts.length) {
    _drawPipePreview(svg);
  }
};

function _drawSimplePipeLine(svg, seg) {
  if (!seg.points || seg.points.length < 2) return;
  const W  = window._mapNatW || 800;
  // 굵기: _buildPipeGroup과 동일 기준 (mapNatW/200), 최소 8
  const lw = Math.max(8, W / 100);

  const pl = document.createElementNS('http://www.w3.org/2000/svg', 'polyline');
  pl.setAttribute('points', seg.points.map(p => p.join(',')).join(' '));
  pl.setAttribute('stroke', seg.color || '#facc15');
  pl.setAttribute('stroke-width', lw);
  pl.setAttribute('fill', 'none');
  pl.setAttribute('stroke-linecap', 'round');
  pl.setAttribute('stroke-linejoin', 'round');
  svg.appendChild(pl);

  // 레이블: 밸브 글씨 크기와 동일 기준 (r*1.3), 이름만 표시
  const r = Math.max(22, W / 32);
  const fontSize = r * 1.3;
  const pad = fontSize * 0.5;
  const mid = seg.points[Math.floor(seg.points.length / 2)];
  const label = seg.name;
  const tw = label.length * fontSize * 0.62 + pad * 2;
  const th = fontSize + pad * 2;
  const rx = mid[0] - tw / 2;
  const ry = mid[1] - th / 2 - fontSize * 1.2;

  const bg = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
  bg.setAttribute('x', rx); bg.setAttribute('y', ry);
  bg.setAttribute('width', tw); bg.setAttribute('height', th);
  bg.setAttribute('rx', fontSize * 0.3);
  bg.setAttribute('fill', seg.color || '#facc15');
  bg.setAttribute('fill-opacity', '0.88');
  bg.setAttribute('stroke', '#92400e');
  bg.setAttribute('stroke-width', Math.max(1, fontSize * 0.08));
  svg.appendChild(bg);

  const txt = document.createElementNS('http://www.w3.org/2000/svg', 'text');
  txt.setAttribute('x', mid[0]); txt.setAttribute('y', ry + th * 0.5 + fontSize * 0.35);
  txt.setAttribute('text-anchor', 'middle');
  txt.setAttribute('fill', '#1a1a2e');
  txt.setAttribute('font-size', fontSize);
  txt.setAttribute('font-weight', '700');
  txt.textContent = label;
  svg.appendChild(txt);
}

function _drawPipePreview(svg) {
  const W = window._mapNatW || 800;
  const lw = Math.max(3, W / 300);

  // 연결선
  if (_pePts.length >= 2) {
    const pl = document.createElementNS('http://www.w3.org/2000/svg', 'polyline');
    pl.setAttribute('points', _pePts.map(p => p.join(',')).join(' '));
    pl.setAttribute('stroke', '#38bdf8');
    pl.setAttribute('stroke-width', lw);
    pl.setAttribute('fill', 'none');
    pl.setAttribute('stroke-dasharray', `${lw * 4},${lw * 2}`);
    pl.setAttribute('stroke-linecap', 'round');
    svg.appendChild(pl);
  }

  // 꼭짓점 점
  _pePts.forEach((p, i) => {
    const c = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    c.setAttribute('cx', p[0]); c.setAttribute('cy', p[1]);
    c.setAttribute('r', lw * 3);
    c.setAttribute('fill', i === 0 ? '#0ea5e9' : '#7dd3fc');
    c.setAttribute('stroke', '#fff'); c.setAttribute('stroke-width', lw * 0.8);
    svg.appendChild(c);
    // 번호
    const t = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    t.setAttribute('x', p[0]); t.setAttribute('y', p[1] - lw * 4);
    t.setAttribute('text-anchor', 'middle');
    t.setAttribute('fill', '#0369a1');
    t.setAttribute('font-size', Math.max(12, W / 100));
    t.setAttribute('font-weight', '700');
    t.textContent = i + 1;
    svg.appendChild(t);
  });
}

// ── 클릭 가능 밸브 심볼 ──────────────────────────────────────
function _drawCustomValveGroup(svg, v, r, siteId) {
  const { x, y, name } = v;
  const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
  g.style.cursor = 'pointer';
  g.classList.add('custom-valve-group');

  const mk = (tag, attrs) => {
    const el = document.createElementNS('http://www.w3.org/2000/svg', tag);
    Object.entries(attrs).forEach(([k, val]) => el.setAttribute(k, val));
    g.appendChild(el);
    return el;
  };

  mk('polygon', { points: `${x-r},${y-r} ${x},${y} ${x-r},${y+r}`,
    fill: '#ef4444', stroke: '#fff', 'stroke-width': r * 0.18, 'stroke-linejoin': 'round' });
  mk('polygon', { points: `${x+r},${y-r} ${x},${y} ${x+r},${y+r}`,
    fill: '#ef4444', stroke: '#fff', 'stroke-width': r * 0.18, 'stroke-linejoin': 'round' });
  mk('line', { x1: x - r, y1: y, x2: x + r, y2: y,
    stroke: '#fff', 'stroke-width': r * 0.22 });
  mk('line', { x1: x, y1: y - r, x2: x, y2: y - r * 1.9,
    stroke: '#ef4444', 'stroke-width': r * 0.28 });
  mk('circle', { cx: x, cy: y - r * 2.3, r: r * 0.5,
    fill: 'none', stroke: '#ef4444', 'stroke-width': r * 0.28 });
  // 투명 히트 영역
  mk('circle', { cx: x, cy: y, r: r * 3, fill: 'transparent' });
  // 이름 레이블
  const lbl = mk('text', { x, y: y + r * 2.8,
    'text-anchor': 'middle', fill: '#ef4444',
    'font-size': r * 1.3, 'font-weight': '700',
    'paint-order': 'stroke', stroke: '#000', 'stroke-width': r * 0.35 });
  lbl.textContent = name;

  g.addEventListener('click', (e) => {
    e.stopPropagation();
    if (typeof openPhotoModal === 'function') {
      openPhotoModal(`_valve_${siteId}`, v.id, `🔧 ${name} 사진`);
    }
  });

  svg.appendChild(g);
}

// ── 클릭 오버레이 핸들러 ──────────────────────────────────────
window._onPipeOverlayClick = function(e) {
  const img = document.getElementById('map-img');
  if (!img) return;
  const rect = img.getBoundingClientRect();
  const x = Math.round((e.clientX - rect.left) * ((window._mapNatW || img.naturalWidth) / img.clientWidth));
  const y = Math.round((e.clientY - rect.top)  * ((window._mapNatH || img.naturalHeight) / img.clientHeight));

  if (_peMode === 'draw') {
    _pePts.push([x, y]);
    if (typeof renderAllPipes === 'function') renderAllPipes();
  } else if (_peMode === 'valve') {
    const name = prompt('밸브 이름을 입력하세요:', '차단밸브');
    if (!name) return;
    const siteId = window.currentDashSite || '115st';
    _peData(siteId).valves.push({ id: 'cv_' + Date.now(), name, x, y, site: siteId });
    _peSaveLocal();
    _peSaveSupabase(siteId);
    if (typeof renderAllPipes === 'function') renderAllPipes();
  }
};

// ── 편집 모드 시작/종료 ────────────────────────────────────────
function _peSetOverlay(show) {
  const ol = document.getElementById('pipe-draw-overlay');
  if (ol) ol.style.display = show ? 'block' : 'none';
}

function _peShowBar(barId) {
  ['pipe-draw-bar', 'pipe-valve-bar'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.style.display = id === barId ? 'flex' : 'none';
  });
  document.getElementById('zone-toggle-bar').style.display = barId ? 'none' : 'flex';
}

function _peResetBar() {
  ['pipe-draw-bar', 'pipe-valve-bar'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.style.display = 'none';
  });
  document.getElementById('zone-toggle-bar').style.display = 'flex';
}

window.startPipeDraw = function() {
  if (typeof mapZoomReset === 'function') mapZoomReset();
  _peMode = 'draw';
  _pePts  = [];
  _peSetOverlay(true);
  _peShowBar('pipe-draw-bar');
  if (typeof renderAllPipes === 'function') renderAllPipes();
};

window.undoPipePt = function() {
  _pePts.pop();
  if (typeof renderAllPipes === 'function') renderAllPipes();
};

window.cancelPipeDraw = function() {
  _peMode = null; _pePts = [];
  _peSetOverlay(false); _peResetBar();
  if (typeof renderAllPipes === 'function') renderAllPipes();
};

window.finishPipeDraw = function() {
  if (_pePts.length < 2) { alert('최소 2개 이상의 점을 찍어주세요.'); return; }
  // 세그먼트 속성 입력
  const modal = document.getElementById('pipe-seg-modal');
  if (modal) {
    modal.style.display = 'flex';
    document.getElementById('psm-pts-count').textContent = `${_pePts.length}개 점`;
  }
};

window.savePipeSegment = function() {
  const name  = document.getElementById('psm-name').value.trim() || '배관';
  const diam  = document.getElementById('psm-diam').value || '100A';
  const color = document.getElementById('psm-color').value || '#facc15';
  const siteId = window.currentDashSite || '115st';

  const seg = {
    id: 'cp_' + Date.now(),
    name, site: siteId,
    관경: diam,
    color,
    points: [..._pePts],
    매달기구간: [],
    노출길이: 0
  };
  _peData(siteId).segments.push(seg);
  _peSaveLocal();
  _peSaveSupabase(siteId);

  document.getElementById('pipe-seg-modal').style.display = 'none';
  _peMode = null; _pePts = [];
  _peSetOverlay(false); _peResetBar();
  if (typeof renderAllPipes === 'function') renderAllPipes();
};

window.cancelPipeSegModal = function() {
  document.getElementById('pipe-seg-modal').style.display = 'none';
};

window.startValveAdd = function() {
  if (typeof mapZoomReset === 'function') mapZoomReset();
  _peMode = 'valve';
  _peSetOverlay(true);
  _peShowBar('pipe-valve-bar');
};

window.cancelValveAdd = function() {
  _peMode = null;
  _peSetOverlay(false); _peResetBar();
};

// ── 목록/삭제 ─────────────────────────────────────────────────
window.showPipeList = function() {
  const siteId = window.currentDashSite || '115st';
  const data   = _peData(siteId);
  const modal  = document.getElementById('pipe-list-modal');
  if (!modal) return;

  const segs = data.segments.map(s =>
    `<div style="display:flex;justify-content:space-between;align-items:center;padding:6px 0;border-bottom:1px solid #f1f5f9">
      <span style="font-size:13px"><span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:${s.color};margin-right:6px"></span>${s.name} (${s.관경 || ''})</span>
      <button onclick="_deletePipeSeg('${s.id}')" style="padding:3px 10px;border-radius:5px;border:1px solid #fca5a5;background:#fff;color:#ef4444;font-size:11px;cursor:pointer">삭제</button>
    </div>`
  ).join('') || '<div style="color:#9ca3af;font-size:13px;padding:8px 0">배관 없음</div>';

  const vals = data.valves.map(v =>
    `<div style="display:flex;justify-content:space-between;align-items:center;padding:6px 0;border-bottom:1px solid #f1f5f9">
      <span style="font-size:13px">🔧 ${v.name}</span>
      <button onclick="_deleteValve('${v.id}')" style="padding:3px 10px;border-radius:5px;border:1px solid #fca5a5;background:#fff;color:#ef4444;font-size:11px;cursor:pointer">삭제</button>
    </div>`
  ).join('') || '<div style="color:#9ca3af;font-size:13px;padding:8px 0">밸브 없음</div>';

  document.getElementById('plm-segs').innerHTML = segs;
  document.getElementById('plm-vals').innerHTML = vals;
  modal.style.display = 'flex';
};

window._deletePipeSeg = function(id) {
  if (!confirm('이 배관 구간을 삭제할까요?')) return;
  const siteId = window.currentDashSite || '115st';
  _peData(siteId).segments = _peData(siteId).segments.filter(s => s.id !== id);
  _peSaveLocal(); _peSaveSupabase(siteId);
  showPipeList();
  if (typeof renderAllPipes === 'function') renderAllPipes();
};

window._deleteValve = function(id) {
  if (!confirm('이 밸브를 삭제할까요?')) return;
  const siteId = window.currentDashSite || '115st';
  _peData(siteId).valves = _peData(siteId).valves.filter(v => v.id !== id);
  _peSaveLocal(); _peSaveSupabase(siteId);
  showPipeList();
  if (typeof renderAllPipes === 'function') renderAllPipes();
};

window.closePipeListModal = function() {
  document.getElementById('pipe-list-modal').style.display = 'none';
};
