// ===== 복공 단계 현황 =====
// pipe_settings key: '_deck_{siteId}', colors column =
//   { outline:[[x,y]...], dir:'down'|'up'|'right'|'left', splits:[0.25,0.5,0.75], stages:[{id,name,status,date,memo}] }
// 정거장 외곽(outline)을 한 번 그리고, dir 방향으로 splits 비율에서 잘라 단계별 구역을 만든다.
// 표시 ON/OFF는 접속마다 기본 ON, 단계 데이터는 Supabase 공유

const DECK_STATUS = {
  done: { label: '복공완료', icon: '✅', stroke: '#7a1f14' },
  wip:  { label: '작업중',   icon: '🚧', stroke: '#c2410c' },
  plan: { label: '예정',     icon: '⬜', stroke: '#64748b' },
};
const DECK_DIRS = { down: '위 → 아래', up: '아래 → 위', right: '왼쪽 → 오른쪽', left: '오른쪽 → 왼쪽' };

const _deckData   = {};   // siteId → data
const _deckLoaded = {};   // siteId → true (로드 완료) / 'loading'
let _deckEdit     = false;
let _deckMode     = 'split'; // 'outline' | 'split'
let _deckDraft    = null;    // 편집 중 사본
let _deckSelId    = null;
let _deckPinnedId = null;
let _deckDrag     = null;    // 드래그 중인 경계 index
let _deckDragged  = false;

function _deckSite() { return window.currentDashSite || '115st'; }

function _deckEvenSplits(n) { return Array.from({ length: n - 1 }, (_, i) => (i + 1) / n); }

function _deckDefault() {
  return {
    outline: [], dir: 'down', splits: _deckEvenSplits(4),
    stages: [
      { id: 'd1', name: '1단계', status: 'done', date: '', memo: '' },
      { id: 'd2', name: '2단계', status: 'done', date: '', memo: '' },
      { id: 'd3', name: '3단계', status: 'wip',  date: '', memo: '' },
      { id: 'd4', name: '4단계', status: 'plan', date: '', memo: '' },
    ],
  };
}

function _deckNormalize(d) {
  if (!d || !Array.isArray(d.stages) || !d.stages.length) return _deckDefault();
  if (!Array.isArray(d.outline)) d.outline = [];
  if (!DECK_DIRS[d.dir]) d.dir = 'down';
  if (!Array.isArray(d.splits) || d.splits.length !== d.stages.length - 1) d.splits = _deckEvenSplits(d.stages.length);
  return d;
}

function _getDeckData(siteId) {
  if (_deckData[siteId]) return _deckData[siteId];
  try {
    const raw = JSON.parse(localStorage.getItem(`sg2_deck_${siteId}`) || 'null');
    if (raw) return _deckNormalize(raw);
  } catch {}
  return _deckDefault();
}

async function _loadDeckForSite(siteId) {
  if (_deckLoaded[siteId]) return;
  _deckLoaded[siteId] = 'loading';
  try {
    const rows = await fetchAllPipeSettings();
    const raw = rows[`_deck_${siteId}`]?.colors;
    if (raw) {
      _deckData[siteId] = _deckNormalize(raw);
      try { localStorage.setItem(`sg2_deck_${siteId}`, JSON.stringify(_deckData[siteId])); } catch {}
    }
  } catch (e) { console.error('복공 단계 로드 오류:', e); }
  _deckLoaded[siteId] = true;
  if (siteId === _deckSite() && typeof renderAllPipes === 'function') renderAllPipes();
}

async function _saveDeckData(siteId, data) {
  _deckData[siteId] = data;
  try { localStorage.setItem(`sg2_deck_${siteId}`, JSON.stringify(data)); } catch {}
  await upsertPipeSettings(`_deck_${siteId}`, { colors: data });
}

// 페이지를 열 때마다 항상 표시 상태로 시작 (숨기기는 이번 접속 동안만 유지)
let _deckShown = true;
function _deckVisible() { return _deckShown; }

window.toggleDeckVisible = function() {
  _deckShown = !_deckShown;
  renderAllPipes();
};

function _updateDeckBtn() {
  const btn = document.getElementById('deck-toggle-btn');
  if (btn) btn.textContent = _deckVisible() ? '🟫 복공현황 숨기기' : '🟫 복공현황 표시';
}

// ── 기하 ──────────────────────────────────────────────────────
function _deckEsc(s) {
  return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function _deckCentroid(pts) {
  return [pts.reduce((s, p) => s + p[0], 0) / pts.length, pts.reduce((s, p) => s + p[1], 0) / pts.length];
}

// 축(axis 0=x, 1=y) 기준 반평면 클리핑 (Sutherland–Hodgman)
function _deckClip(pts, axis, val, keepGreater) {
  const inside = p => keepGreater ? p[axis] >= val : p[axis] <= val;
  const out = [];
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i], b = pts[(i + 1) % pts.length];
    const ia = inside(a), ib = inside(b);
    if (ia) out.push(a);
    if (ia !== ib) {
      const t = (val - a[axis]) / (b[axis] - a[axis]);
      out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
    }
  }
  return out;
}

function _deckAxis(data) {
  const axis = data.dir === 'down' || data.dir === 'up' ? 1 : 0;
  const vals = data.outline.map(p => p[axis]);
  const min = Math.min(...vals), max = Math.max(...vals);
  return { axis, min, max, span: max - min || 1, rev: data.dir === 'up' || data.dir === 'left' };
}

// 비율 t(0~1) → 좌표값, 좌표값 → 비율
function _deckTtoV(ax, t) { return ax.rev ? ax.max - t * ax.span : ax.min + t * ax.span; }
function _deckVtoT(ax, v) { return ax.rev ? (ax.max - v) / ax.span : (v - ax.min) / ax.span; }

function _deckStrips(data) {
  if (data.outline.length < 3) return [];
  const ax = _deckAxis(data);
  const bounds = [0, ...data.splits, 1];
  return data.stages.map((stage, i) => {
    const a = _deckTtoV(ax, bounds[i]), b = _deckTtoV(ax, bounds[i + 1]);
    const lo = Math.min(a, b), hi = Math.max(a, b);
    const pts = _deckClip(_deckClip(data.outline, ax.axis, lo, true), ax.axis, hi, false);
    return { stage, pts };
  }).filter(s => s.pts.length >= 3);
}

function _deckPointIn(pts, x, y) {
  let c = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, yi] = pts[i], [xj, yj] = pts[j];
    if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) c = !c;
  }
  return c;
}

// ── 렌더 ──────────────────────────────────────────────────────
let _deckHoverId = null;
let _deckTipShown = false;

function _deckGeom() {
  const W = Math.max(24, _mapNatW / 32); // 복공판 1장 = 2000×750 비율
  return { W, H: W * 0.375, depth: Math.max(10, _mapNatW / 110), sw: Math.max(3, _mapNatW / 350) };
}

function _deckEl(tag, attrs) {
  const el = document.createElementNS('http://www.w3.org/2000/svg', tag);
  for (const k in attrs) el.setAttribute(k, attrs[k]);
  return el;
}
function _deckPts(pts) { return pts.map(p => p.join(',')).join(' '); }

// p: id 접두사 (기본층/맨앞층이 같은 문서에 있어 id 충돌 방지)
function _deckDefs(svg, p) {
  const { W, H } = _deckGeom();
  const g = W * 0.012, e = H * 0.16, t = W * 0.03;
  const blur = Math.max(4, _mapNatW / 260);
  const tones = [['#e8664f', '#c94332'], ['#de5a44', '#bd3b2b'], ['#ef7058', '#cf4a37']];
  const defs = _deckEl('defs', {});
  defs.innerHTML = `
    ${tones.map(([a, b], i) => `
    <linearGradient id="${p}tone${i}" x1="0" y1="0" x2="0.25" y2="1">
      <stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="${b}"/>
    </linearGradient>`).join('')}
    <linearGradient id="${p}side" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#8f2b1e"/><stop offset="1" stop-color="#3a0d08"/>
    </linearGradient>
    <pattern id="${p}tex" width="${t}" height="${t}" patternUnits="userSpaceOnUse">
      <line x1="${t * 0.15}" y1="${t * 0.45}" x2="${t * 0.45}" y2="${t * 0.15}" stroke="#a83322" stroke-width="${t * 0.14}" stroke-linecap="round"/>
      <line x1="${t * 0.55}" y1="${t * 0.55}" x2="${t * 0.85}" y2="${t * 0.85}" stroke="#a83322" stroke-width="${t * 0.14}" stroke-linecap="round"/>
    </pattern>
    <pattern id="${p}detail" width="${W}" height="${H}" patternUnits="userSpaceOnUse">
      <rect x="${g * 2}" y="${g * 2}" width="${W - 4 * g}" height="${H - 4 * g - e}" fill="url(#${p}tex)" opacity="0.55"/>
      <rect x="${g}" y="${H - g - e}" width="${W - 2 * g}" height="${e}" fill="#8a2619"/>
      <line x1="${g * 2}" y1="${g * 1.6}" x2="${W - g * 2}" y2="${g * 1.6}" stroke="#ffc2ae" stroke-width="${g * 1.2}" opacity="0.85"/>
      <line x1="${g * 1.6}" y1="${g * 2}" x2="${g * 1.6}" y2="${H - g - e}" stroke="#ffab94" stroke-width="${g}" opacity="0.6"/>
      <circle cx="${W * 0.06}" cy="${(H - e) / 2}" r="${W * 0.016}" fill="#5a160e"/>
      <circle cx="${W * 0.94}" cy="${(H - e) / 2}" r="${W * 0.016}" fill="#5a160e"/>
    </pattern>
    <pattern id="${p}wip" width="${W / 3}" height="${W / 3}" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
      <rect width="${W / 3}" height="${W / 3}" fill="#fdba74"/>
      <rect width="${W / 6}" height="${W / 3}" fill="#f97316"/>
    </pattern>
    <pattern id="${p}plan" width="${W / 4}" height="${W / 4}" patternUnits="userSpaceOnUse" patternTransform="rotate(-45)">
      <rect width="${W / 4}" height="${W / 4}" fill="#64748b"/>
      <rect width="${W / 16}" height="${W / 4}" fill="#e2e8f0"/>
    </pattern>
    <filter id="${p}shadow" x="-20%" y="-20%" width="140%" height="160%">
      <feGaussianBlur stdDeviation="${blur}"/>
    </filter>`;
  svg.appendChild(defs);
}

// 단계 구역 하나 그리기 → { shadow, g }
function _deckDrawStrip(svg, p, { stage: st, pts }) {
  const { W, H, depth, sw } = _deckGeom();
  const g = _deckEl('g', { class: 'deck-stage' });
  g.dataset.id = st.id;
  g.dataset.status = st.status;
  let shadow = null;

  if (st.status === 'done') {
    shadow = _deckEl('polygon', {
      points: _deckPts(pts.map(q => [q[0] + depth * 0.7, q[1] + depth * 1.6])),
      fill: '#000', opacity: '0.45', filter: `url(#${p}shadow)`, class: 'deck-shadow',
    });
    svg.appendChild(shadow);

    // 옆면 (두께) — 윗면이 뒤쪽 면을 덮음
    pts.forEach((a, i) => {
      const b = pts[(i + 1) % pts.length];
      g.appendChild(_deckEl('polygon', {
        points: _deckPts([a, b, [b[0], b[1] + depth], [a[0], a[1] + depth]]),
        fill: `url(#${p}side)`,
      }));
    });

    // 윗면: 복공판을 한 장씩 깔고 구역 모양으로 자름 (판마다 색조 약간 다르게)
    const clipId = `${p}clip-${st.id}`;
    const clip = _deckEl('clipPath', { id: clipId });
    clip.appendChild(_deckEl('polygon', { points: _deckPts(pts) }));
    g.appendChild(clip);
    const top = _deckEl('g', { 'clip-path': `url(#${clipId})` });
    const xs = pts.map(q => q[0]), ys = pts.map(q => q[1]);
    const x0 = Math.floor(Math.min(...xs) / W) * W, x1 = Math.max(...xs);
    const y0 = Math.floor(Math.min(...ys) / H) * H, y1 = Math.max(...ys);
    const gap = W * 0.012;
    top.appendChild(_deckEl('rect', { x: x0, y: y0, width: x1 - x0 + W, height: y1 - y0 + H, fill: '#4a120b' }));
    for (let y = y0; y < y1; y += H) {
      for (let x = x0; x < x1; x += W) {
        const k = Math.abs(((x / W) * 73856093) ^ ((y / H) * 19349663)) % 3;
        top.appendChild(_deckEl('rect', {
          x: x + gap, y: y + gap, width: W - 2 * gap, height: H - 2 * gap, rx: gap, fill: `url(#${p}tone${k})`,
        }));
      }
    }
    top.appendChild(_deckEl('rect', { x: x0, y: y0, width: x1 - x0 + W, height: y1 - y0 + H, fill: `url(#${p}detail)` }));
    g.appendChild(top);

    // 가장자리 하이라이트 (어두운 테두리 대신 은은한 밝은 선)
    g.appendChild(_deckEl('polygon', {
      points: _deckPts(pts), fill: 'none', stroke: 'rgba(255,200,180,0.7)',
      'stroke-width': sw * 0.6, 'stroke-linejoin': 'round',
    }));
  } else if (st.status === 'wip') {
    // 작업중: 공사구역 표시처럼 항상 선명하게
    g.classList.add('deck-active');
    g.appendChild(_deckEl('polygon', {
      points: _deckPts(pts), fill: 'rgba(251,146,60,0.22)',
      stroke: '#f97316', 'stroke-width': sw * 1.5, 'stroke-linejoin': 'round',
      'stroke-dasharray': `${_mapNatW / 80} ${_mapNatW / 120}`,
    }));
  } else {
    g.appendChild(_deckEl('polygon', {
      points: _deckPts(pts), fill: `url(#${p}plan)`,
      stroke: '#f8fafc', 'stroke-width': sw * 0.8, 'stroke-linejoin': 'round',
      'stroke-dasharray': `${_mapNatW / 90} ${_mapNatW / 140}`,
    }));
  }
  svg.appendChild(g);
  return { shadow, g };
}

function _deckCurrentStrips() {
  return _deckStrips(_deckEdit ? _deckDraft : _getDeckData(_deckSite()));
}

// renderAllPipes()에서 배관보다 먼저 호출
function renderDeckStages() {
  const svg = document.getElementById('map-svg');
  const siteId = _deckSite();
  _renderDeckSummary(null);
  _updateDeckBtn();
  if (!svg) return;
  if (!_deckLoaded[siteId]) _loadDeckForSite(siteId);
  if (!_deckEdit && !_deckVisible()) { _setDeckHover(null); return; }

  const data = _deckEdit ? _deckDraft : _getDeckData(siteId);
  const strips = _deckStrips(data);
  if (!strips.length && !_deckEdit) { _setDeckHover(null); return; }

  _deckDefs(svg, 'deckb-');
  const { sw } = _deckGeom();
  const fs = Math.max(16, _mapNatW / 110);

  // 아래쪽(앞쪽) 구역이 뒤쪽 구역의 옆면을 덮도록 y 순으로 그림
  const ordered = [...strips].sort((a, b) =>
    Math.max(...a.pts.map(q => q[1])) - Math.max(...b.pts.map(q => q[1])));

  ordered.forEach(strip => {
    const { g } = _deckDrawStrip(svg, 'deckb-', strip);
    if (!_deckEdit) return;
    g.classList.add(strip.stage.id === _deckSelId ? 'deck-selected' : 'deck-dim');
    // 편집 중에만 단계 이름 표시
    const meta = DECK_STATUS[strip.stage.status] || DECK_STATUS.plan;
    const [cx, cy] = _deckCentroid(strip.pts);
    const t = _deckEl('text', {
      class: 'deck-label', x: cx, y: cy + fs * 0.35, 'text-anchor': 'middle',
      fill: meta.stroke, 'font-size': fs, 'font-weight': '800',
      'paint-order': 'stroke', stroke: '#fff', 'stroke-width': fs * 0.28,
    });
    t.textContent = `${strip.stage.name} ${meta.label}`;
    svg.appendChild(t);
  });

  if (_deckEdit) { _renderDeckEditOverlay(svg, data, sw); _setDeckHover(null); }
  else { _renderDeckSummary(data); _applyDeckHover(); }
}

// 작업중 단계 상시 라벨 ("🚧 3단계 작업중") — 배관/밸브 위에 그림
function renderDeckLabels() {
  // 천공 마커(overlay-svg)보다 위 층에 그려야 가려지지 않음
  const svg = _deckLayerSvg('deck-label-svg');
  if (!svg) return;
  svg.innerHTML = '';
  svg.setAttribute('viewBox', `0 0 ${_mapNatW} ${_mapNatH}`);
  _syncDeckFrontTransform();
  if (_deckEdit || !_deckVisible()) return;
  const fs = Math.max(18, _mapNatW / 100);
  _deckCurrentStrips().filter(s => s.stage.status === 'wip').forEach(({ stage: st, pts }) => {
    const [cx, cy] = _deckCentroid(pts);
    const t = _deckEl('text', {
      class: 'deck-label', x: cx, y: cy + fs * 0.35, 'text-anchor': 'middle',
      fill: '#ea580c', 'font-size': fs, 'font-weight': '800',
      'paint-order': 'stroke', stroke: '#fff', 'stroke-width': fs * 0.3,
    });
    t.textContent = `🚧 ${st.name} 작업중`;
    svg.appendChild(t);
  });
}

// ── 호버: 좌표로 판정 (마커/배관 위에서도 동작) ─────────────────
function _setDeckHover(id) {
  if (id === _deckHoverId) return;
  _deckHoverId = id;
  _applyDeckHover();
}

function _applyDeckHover() {
  const strip = _deckHoverId ? _deckCurrentStrips().find(s => s.stage.id === _deckHoverId) : null;
  if (_deckHoverId && !strip) _deckHoverId = null;
  document.querySelectorAll('#map-svg .deck-stage').forEach(g => {
    const on = g.dataset.id === _deckHoverId;
    g.classList.toggle('deck-hover', on && g.dataset.status !== 'done');
    g.classList.toggle('deck-hidden', on && g.dataset.status === 'done');
  });
  _renderDeckFront(strip && strip.stage.status === 'done' ? strip : null);
  if (strip) { _showDeckTooltip(strip.stage); _deckTipShown = true; }
  else if (_deckTipShown) { _hidePipeTooltip(); _deckTipShown = false; }
}

// 복공완료 구역을 배관·천공 마커보다 위(맨 앞)에 띄우는 층
function _deckLayerSvg(id) {
  let el = document.getElementById(id);
  if (!el) {
    const mc = document.getElementById('map-container');
    if (!mc) return null;
    el = _deckEl('svg', { id, class: 'deck-layer-svg' });
    mc.appendChild(el);
  }
  return el;
}
function _deckFrontSvg() { return _deckLayerSvg('deck-front-svg'); }

// 지도 줌/이동을 따라가도록 변환 동기화
function _syncDeckFrontTransform() {
  const z = document.getElementById('map-zoomable');
  if (!z) return;
  document.querySelectorAll('.deck-layer-svg').forEach(el => {
    el.style.height = z.offsetHeight + 'px';
    el.style.transform = z.style.transform || '';
  });
}

function _renderDeckFront(strip) {
  const fsvg = _deckFrontSvg();
  if (!fsvg) return;
  fsvg.innerHTML = '';
  if (!strip) { fsvg.style.display = 'none'; return; }
  fsvg.setAttribute('viewBox', `0 0 ${_mapNatW} ${_mapNatH}`);
  fsvg.style.display = '';
  _syncDeckFrontTransform();
  _deckDefs(fsvg, 'deckf-');
  const { shadow, g } = _deckDrawStrip(fsvg, 'deckf-', strip);
  g.classList.add('deck-front');
  g.style.setProperty('--deck-lift', `${-_deckGeom().depth * 0.8}px`);
  if (shadow) shadow.classList.add('deck-front-shadow');

  // 구역 안에 들어오는 배관선만 복공 위에 반투명으로 비춤
  const clipId = 'deckf-pipeclip';
  const clip = _deckEl('clipPath', { id: clipId });
  clip.appendChild(_deckEl('polygon', { points: _deckPts(strip.pts) }));
  fsvg.appendChild(clip);
  const pipes = _deckEl('g', { class: 'deck-front-pipes', 'clip-path': `url(#${clipId})` });
  document.querySelectorAll('#map-svg polyline').forEach(pl => {
    if (pl.closest('.deck-stage') || pl.classList.contains('pipe-hit') || pl.classList.contains('pipe-preview')) return;
    const c = pl.cloneNode(false);
    c.removeAttribute('filter');
    pipes.appendChild(c);
  });
  fsvg.appendChild(pipes);
}

function _deckHitAt(e) {
  const img = document.getElementById('map-img');
  if (!img || !img.clientWidth) return null;
  const r = img.getBoundingClientRect(); // 줌 변환 포함
  const x = (e.clientX - r.left) * (_mapNatW / r.width);
  const y = (e.clientY - r.top)  * (_mapNatH / r.height);
  return _deckCurrentStrips().find(s => _deckPointIn(s.pts, x, y)) || null;
}

(function _bindDeckHover() {
  const mc = document.getElementById('map-container');
  if (!mc) return;
  mc.addEventListener('mousemove', e => {
    if (_deckEdit || !_deckVisible()) return;
    const hit = _deckHitAt(e);
    const id = hit ? hit.stage.id : _deckPinnedId;
    if (id !== _deckHoverId) _setDeckHover(id);
    // 복공완료 구역 위에선 배관 툴팁 대신 복공 툴팁 유지
    else if (hit && hit.stage.status === 'done') _showDeckTooltip(hit.stage);
  }, { passive: true });
  mc.addEventListener('mouseleave', () => { if (!_deckEdit) _setDeckHover(_deckPinnedId); });
  // 터치 기기: 탭으로 고정/해제
  mc.addEventListener('click', e => {
    if (_deckEdit || !_deckVisible()) return;
    if (e.target.closest('.pipe-group,.custom-valve-group,.boring-marker,.parking-marker,button,#pipe-popup')) return;
    const hit = _deckHitAt(e);
    _deckPinnedId = hit && hit.stage.id !== _deckPinnedId ? hit.stage.id : null;
    _setDeckHover(_deckPinnedId);
  });
  document.addEventListener('map-zoom-changed', _syncDeckFrontTransform);
})();

function _renderDeckEditOverlay(svg, data, sw) {
  const o = data.outline;
  const r = Math.max(8, _mapNatW / 180);
  // 외곽선
  if (o.length >= 2) {
    svg.appendChild(_deckEl(o.length >= 3 ? 'polygon' : 'polyline', {
      points: _deckPts(o), fill: 'none', stroke: '#0f172a', 'stroke-width': sw,
      'stroke-dasharray': `${_mapNatW / 80} ${_mapNatW / 120}`, 'pointer-events': 'none',
    }));
  }
  if (_deckMode === 'outline') {
    o.forEach((p, i) => svg.appendChild(_deckEl('circle', {
      cx: p[0], cy: p[1], r, fill: i === 0 ? '#0f172a' : '#fff', stroke: '#0f172a', 'stroke-width': sw,
    })));
    return;
  }
  // 경계선 + 드래그 손잡이
  if (o.length < 3) return;
  const ax = _deckAxis(data);
  const other = 1 - ax.axis;
  const ov = o.map(p => p[other]);
  const lo = Math.min(...ov) - r * 2, hi = Math.max(...ov) + r * 2;
  data.splits.forEach((s, k) => {
    const v = _deckTtoV(ax, s);
    const p1 = ax.axis === 1 ? [lo, v] : [v, lo];
    const p2 = ax.axis === 1 ? [hi, v] : [v, hi];
    svg.appendChild(_deckEl('line', {
      x1: p1[0], y1: p1[1], x2: p2[0], y2: p2[1],
      stroke: _deckDrag === k ? '#2563eb' : '#0f172a', 'stroke-width': sw * 1.4,
      'stroke-dasharray': `${sw * 4} ${sw * 2}`,
    }));
    [p1, p2].forEach(p => svg.appendChild(_deckEl('circle', {
      cx: p[0], cy: p[1], r: r * 1.2, fill: '#2563eb', stroke: '#fff', 'stroke-width': sw,
    })));
  });
}

function _renderDeckSummary(data) {
  const mc = document.getElementById('map-container');
  if (!mc) return;
  let el = document.getElementById('deck-summary');
  if (!data || data.outline.length < 3) { if (el) el.style.display = 'none'; return; }
  if (!el) {
    el = document.createElement('div');
    el.id = 'deck-summary';
    el.className = 'deck-summary';
    mc.appendChild(el);
  }
  const done = data.stages.filter(s => s.status === 'done').length;
  const wip  = data.stages.filter(s => s.status === 'wip').map(s => s.name);
  el.innerHTML = `🟫 복공 <strong>${done}/${data.stages.length}</strong> 완료` +
    (wip.length ? ` · <span style="color:#fdba74">${_deckEsc(wip.join(', '))} 작업중</span>` : '');
  el.style.display = '';
}

function _showDeckTooltip(st, e) {
  const tt = document.getElementById('map-pipe-tooltip');
  if (!tt) return;
  const meta = DECK_STATUS[st.status] || DECK_STATUS.plan;
  const sub = [st.date, st.memo].filter(Boolean).map(_deckEsc).join(' · ');
  tt.innerHTML = `<strong style="color:#fff">${_deckEsc(st.name)}</strong> ` +
    `<span style="color:${st.status === 'wip' ? '#fdba74' : st.status === 'done' ? '#86efac' : '#cbd5e1'}">${meta.icon} ${meta.label}</span>` +
    (sub ? `<br><span style="color:#cbd5e1">${sub}</span>` : '');
  tt.style.display = 'block';
  if (e) { tt.style.left = (e.clientX + 14) + 'px'; tt.style.top = (e.clientY - 42) + 'px'; }
}

// ── 편집 ──────────────────────────────────────────────────────
window.startDeckEdit = function() {
  if (typeof mapZoomReset === 'function') mapZoomReset();
  _deckDraft = JSON.parse(JSON.stringify(_getDeckData(_deckSite())));
  _deckSelId = _deckDraft.stages[0]?.id || null;
  _deckMode = _deckDraft.outline.length >= 3 ? 'split' : 'outline';
  _deckEdit = true;
  _deckPinnedId = null;
  _setDeckHover(null);
  document.getElementById('zone-toggle-bar').style.display = 'none';
  document.getElementById('deck-edit-bar').style.display  = 'flex';
  document.getElementById('zone-click-overlay').style.display = 'block';
  _renderDeckEditBar();
  renderAllPipes();
};

window.cancelDeckEdit = function() {
  if (!_deckEdit) return;
  _deckEdit = false;
  _deckDraft = null;
  _deckDrag = null;
  document.getElementById('zone-toggle-bar').style.display = 'flex';
  document.getElementById('deck-edit-bar').style.display  = 'none';
  document.getElementById('zone-click-overlay').style.display = 'none';
  renderAllPipes();
};

window.saveDeckEdit = async function() {
  const siteId = _deckSite();
  if (_deckDraft.outline.length > 0 && _deckDraft.outline.length < 3) {
    alert('정거장 외곽은 꼭짓점 3개 이상 필요합니다.'); return;
  }
  try {
    await _saveDeckData(siteId, _deckNormalize(_deckDraft));
  } catch (e) { alert('복공 단계 저장 실패: ' + e.message); return; }
  _deckShown = true;
  cancelDeckEdit();
};

window.deleteDeckAll = async function() {
  if (!confirm('이 현장의 복공 현황(외곽·단계·상태)을 모두 삭제할까요?\n삭제 후에는 되돌릴 수 없습니다.')) return;
  const siteId = _deckSite();
  try {
    await _saveDeckData(siteId, _deckDefault());
  } catch (e) { alert('복공 현황 삭제 실패: ' + e.message); return; }
  cancelDeckEdit();
};

function _deckSel() { return _deckDraft?.stages.find(s => s.id === _deckSelId); }

function _renderDeckEditBar() {
  if (!_deckDraft) return;
  const sel = document.getElementById('deck-stage-sel');
  sel.innerHTML = _deckDraft.stages.map(s =>
    `<option value="${s.id}"${s.id === _deckSelId ? ' selected' : ''}>${_deckEsc(s.name)}</option>`).join('');
  const st = _deckSel();
  document.getElementById('deck-status-sel').value = st?.status || 'plan';
  document.getElementById('deck-date-input').value = st?.date || '';
  document.getElementById('deck-memo-input').value = st?.memo || '';
  document.getElementById('deck-dir-sel').value = _deckDraft.dir;
  const isOutline = _deckMode === 'outline';
  document.getElementById('deck-mode-outline').classList.toggle('deck-mode-on', isOutline);
  document.getElementById('deck-mode-split').classList.toggle('deck-mode-on', !isOutline);
  document.getElementById('deck-outline-tools').style.display = isOutline ? 'flex' : 'none';
  document.getElementById('deck-hint').textContent = isOutline
    ? `① 지도 클릭으로 정거장 외곽 꼭짓점 추가 (현재 ${_deckDraft.outline.length}개, 3개 이상)`
    : '② 파란 경계선을 드래그해 단계 크기 조절 · 구역 클릭으로 단계 선택 후 상태 입력';
}

window._deckSetMode = function(mode) {
  if (mode === 'split' && _deckDraft.outline.length < 3) { alert('먼저 정거장 외곽을 꼭짓점 3개 이상으로 그려주세요.'); return; }
  _deckMode = mode;
  _renderDeckEditBar();
  renderAllPipes();
};

window._deckSelectStage = function(id) { _deckSelId = id; _renderDeckEditBar(); renderAllPipes(); };

window._deckSetField = function(field, value) {
  const st = _deckSel();
  if (!st) return;
  st[field] = value;
  renderAllPipes();
};

window._deckSetDir = function(dir) { _deckDraft.dir = dir; renderAllPipes(); };

window._deckAddStage = function() {
  const n = _deckDraft.stages.length + 1;
  const name = (prompt('단계 이름', `${n}단계`) || '').trim();
  if (!name) return;
  const st = { id: 'd' + Date.now(), name, status: 'plan', date: '', memo: '' };
  _deckDraft.stages.push(st);
  _deckDraft.splits = _deckEvenSplits(_deckDraft.stages.length);
  _deckSelId = st.id;
  _renderDeckEditBar();
  renderAllPipes();
};

window._deckDeleteStage = function() {
  const st = _deckSel();
  if (!st) return;
  if (_deckDraft.stages.length <= 1) { alert('단계는 1개 이상 필요합니다.'); return; }
  if (!confirm(`'${st.name}' 단계를 삭제할까요? (경계는 균등하게 다시 나뉩니다)`)) return;
  _deckDraft.stages = _deckDraft.stages.filter(s => s.id !== st.id);
  _deckDraft.splits = _deckEvenSplits(_deckDraft.stages.length);
  _deckSelId = _deckDraft.stages[0].id;
  _renderDeckEditBar();
  renderAllPipes();
};

window._deckEvenOut = function() {
  _deckDraft.splits = _deckEvenSplits(_deckDraft.stages.length);
  renderAllPipes();
};

window._deckUndoPoint   = function() { _deckDraft.outline.pop(); _renderDeckEditBar(); renderAllPipes(); };
window._deckClearOutline = function() { _deckDraft.outline = []; _renderDeckEditBar(); renderAllPipes(); };

// 화면 좌표 → 지도 원본 좌표 (편집 시작 때 줌 초기화됨)
function _deckEvtXY(e) {
  const img  = document.getElementById('map-img');
  const rect = img.getBoundingClientRect();
  return [(e.clientX - rect.left) * (_mapNatW / img.clientWidth),
          (e.clientY - rect.top)  * (_mapNatH / img.clientHeight)];
}

// _onZoneOverlayClick에서 호출 → true면 처리 완료
function _onDeckMapClick(x, y) {
  if (!_deckEdit) return false;
  if (_deckDragged) { _deckDragged = false; return true; }
  if (_deckMode === 'outline') {
    _deckDraft.outline.push([x, y]);
  } else {
    const hit = _deckStrips(_deckDraft).find(s => _deckPointIn(s.pts, x, y));
    if (hit) _deckSelId = hit.stage.id;
  }
  _renderDeckEditBar();
  renderAllPipes();
  return true;
}

// 경계선 드래그
(function _bindDeckDrag() {
  const ov = document.getElementById('zone-click-overlay');
  if (!ov) return;
  let raf = 0;
  ov.addEventListener('pointerdown', e => {
    if (!_deckEdit || _deckMode !== 'split' || _deckDraft.outline.length < 3) return;
    const [x, y] = _deckEvtXY(e);
    const ax = _deckAxis(_deckDraft);
    const t = _deckVtoT(ax, ax.axis === 1 ? y : x);
    const thr = Math.max(14, _mapNatW / 90) / ax.span;
    let best = -1, bestD = thr;
    _deckDraft.splits.forEach((s, k) => { const d = Math.abs(s - t); if (d < bestD) { bestD = d; best = k; } });
    if (best < 0) return;
    _deckDrag = best;
    _deckDragged = false;
    ov.setPointerCapture(e.pointerId);
    e.preventDefault();
  });
  ov.addEventListener('pointermove', e => {
    if (_deckDrag === null) return;
    const [x, y] = _deckEvtXY(e);
    const ax = _deckAxis(_deckDraft);
    const sp = _deckDraft.splits;
    const min = (sp[_deckDrag - 1] ?? 0) + 0.03, max = (sp[_deckDrag + 1] ?? 1) - 0.03;
    sp[_deckDrag] = Math.min(max, Math.max(min, _deckVtoT(ax, ax.axis === 1 ? y : x)));
    _deckDragged = true;
    if (!raf) raf = requestAnimationFrame(() => { raf = 0; renderAllPipes(); });
  });
  const end = () => { if (_deckDrag !== null) { _deckDrag = null; renderAllPipes(); } };
  ov.addEventListener('pointerup', end);
  ov.addEventListener('pointercancel', end);
})();
