// ===== 복공 단계 현황 =====
// pipe_settings key: '_deck_{siteId}', colors column =
//   { outline:[[x,y]...], dir:'down'|'up'|'right'|'left', splits:[0.25,0.5,0.75], stages:[{id,name,status,date,memo}] }
// 정거장 외곽(outline)을 한 번 그리고, dir 방향으로 splits 비율에서 잘라 단계별 구역을 만든다.
// 표시 ON/OFF는 보는 사람별(localStorage), 단계 데이터는 Supabase 공유

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

function _deckVisible() {
  try { return localStorage.getItem(`sg2_deck_visible_${_deckSite()}`) !== 'false'; } catch { return true; }
}

window.toggleDeckVisible = function() {
  const next = !_deckVisible();
  try { localStorage.setItem(`sg2_deck_visible_${_deckSite()}`, String(next)); } catch {}
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
function _deckDefs(svg) {
  // 복공판 1장 = 2000×750 비율, 줄 맞춰 깔림. 각 판에 윗면/앞쪽 두께면/하이라이트로 입체감
  const W = Math.max(24, _mapNatW / 32), H = W * 0.375, g = W * 0.012;
  const e = H * 0.16;   // 판 앞쪽 두께면
  const t = W * 0.03;   // 체크 무늬 간격
  const blur = Math.max(3, _mapNatW / 400);
  const defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
  defs.innerHTML = `
    <linearGradient id="deck-grad" x1="0" y1="0" x2="0.3" y2="1">
      <stop offset="0" stop-color="#e2604a"/>
      <stop offset="0.5" stop-color="#cc4433"/>
      <stop offset="1" stop-color="#b8392a"/>
    </linearGradient>
    <linearGradient id="deck-edge" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#9c2f22"/>
      <stop offset="1" stop-color="#7a2219"/>
    </linearGradient>
    <pattern id="deck-tex" width="${t}" height="${t}" patternUnits="userSpaceOnUse">
      <line x1="${t * 0.15}" y1="${t * 0.45}" x2="${t * 0.45}" y2="${t * 0.15}" stroke="#a3301f" stroke-width="${t * 0.14}" stroke-linecap="round"/>
      <line x1="${t * 0.55}" y1="${t * 0.55}" x2="${t * 0.85}" y2="${t * 0.85}" stroke="#a3301f" stroke-width="${t * 0.14}" stroke-linecap="round"/>
    </pattern>
    <pattern id="deck-pat-done" width="${W}" height="${H}" patternUnits="userSpaceOnUse">
      <rect width="${W}" height="${H}" fill="#6b1d14"/>
      <rect x="${g}" y="${g}" width="${W - 2 * g}" height="${H - 2 * g - e}" rx="${g}" fill="url(#deck-grad)"/>
      <rect x="${g * 2}" y="${g * 2}" width="${W - 4 * g}" height="${H - 4 * g - e}" fill="url(#deck-tex)" opacity="0.6"/>
      <rect x="${g}" y="${H - g - e}" width="${W - 2 * g}" height="${e}" fill="url(#deck-edge)"/>
      <line x1="${g * 2}" y1="${g * 1.6}" x2="${W - g * 2}" y2="${g * 1.6}" stroke="#ffb59f" stroke-width="${g * 1.2}" opacity="0.8"/>
      <line x1="${g * 1.6}" y1="${g * 2}" x2="${g * 1.6}" y2="${H - g - e}" stroke="#f59a83" stroke-width="${g}" opacity="0.6"/>
      <circle cx="${W * 0.06}" cy="${(H - e) / 2}" r="${W * 0.016}" fill="#5a160e"/>
      <circle cx="${W * 0.94}" cy="${(H - e) / 2}" r="${W * 0.016}" fill="#5a160e"/>
    </pattern>
    <pattern id="deck-pat-wip" width="${W / 3}" height="${W / 3}" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
      <rect width="${W / 3}" height="${W / 3}" fill="#fed7aa"/>
      <rect width="${W / 6}" height="${W / 3}" fill="#f97316"/>
    </pattern>
    <filter id="deck-shadow" x="-20%" y="-20%" width="140%" height="160%">
      <feGaussianBlur stdDeviation="${blur}"/>
    </filter>`;
  svg.appendChild(defs);
}

function _deckEl(tag, attrs) {
  const el = document.createElementNS('http://www.w3.org/2000/svg', tag);
  for (const k in attrs) el.setAttribute(k, attrs[k]);
  return el;
}
function _deckPts(pts) { return pts.map(p => p.join(',')).join(' '); }

// renderAllPipes()에서 배관보다 먼저 호출 (배관이 위에 오도록)
function renderDeckStages() {
  const svg = document.getElementById('map-svg');
  const siteId = _deckSite();
  _renderDeckSummary(null);
  _updateDeckBtn();
  if (!svg) return;
  if (!_deckLoaded[siteId]) _loadDeckForSite(siteId);
  if (!_deckEdit && !_deckVisible()) return;

  const data = _deckEdit ? _deckDraft : _getDeckData(siteId);
  const strips = _deckStrips(data);
  if (!strips.length && !_deckEdit) return;

  _deckDefs(svg);
  const sw = Math.max(3, _mapNatW / 350);
  const fs = Math.max(16, _mapNatW / 110);
  const depth = Math.max(6, _mapNatW / 200);

  // 아래쪽(앞쪽) 구역이 뒤쪽 구역의 옆면을 덮도록 y 순으로 그림
  const ordered = [...strips].sort((a, b) =>
    Math.max(...a.pts.map(p => p[1])) - Math.max(...b.pts.map(p => p[1])));

  ordered.forEach(({ stage: st, pts }) => {
    const meta = DECK_STATUS[st.status] || DECK_STATUS.plan;
    const is3d = st.status === 'done';

    // 바닥 그림자 (고정)
    if (is3d && !_deckEdit) {
      svg.appendChild(_deckEl('polygon', {
        points: _deckPts(pts.map(p => [p[0] + depth * 0.6, p[1] + depth * 1.8])),
        fill: '#000', opacity: '0.35', filter: 'url(#deck-shadow)', class: 'deck-shadow',
      }));
    }

    const g = _deckEl('g', { class: 'deck-stage' });
    if (_deckEdit) g.classList.add(st.id === _deckSelId ? 'deck-selected' : 'deck-dim');
    if (!_deckEdit && st.id === _deckPinnedId) g.classList.add('deck-pinned');
    g.dataset.id = st.id;
    g.style.setProperty('--deck-lift', `${-depth}px`);

    // 옆면 (두께): 각 변을 아래로 depth만큼 내린 사각형, 윗면이 뒤쪽 면을 덮음
    if (is3d) {
      pts.forEach((a, i) => {
        const b = pts[(i + 1) % pts.length];
        g.appendChild(_deckEl('polygon', {
          points: _deckPts([a, b, [b[0], b[1] + depth], [a[0], a[1] + depth]]),
          fill: '#6b1d14', stroke: '#4d140d', 'stroke-width': sw * 0.4, 'stroke-linejoin': 'round',
        }));
      });
    }

    // 윗면
    g.appendChild(_deckEl('polygon', {
      points: _deckPts(pts),
      fill: st.status === 'done' ? 'url(#deck-pat-done)'
          : st.status === 'wip'  ? 'url(#deck-pat-wip)'
          : 'rgba(148,163,184,0.3)',
      stroke: meta.stroke,
      'stroke-width': st.status === 'wip' ? sw * 1.6 : sw,
      'stroke-linejoin': 'round',
      ...(st.status === 'plan' ? { 'stroke-dasharray': `${_mapNatW / 90} ${_mapNatW / 140}` } : {}),
    }));

    if (!_deckEdit) {
      g.addEventListener('mouseenter', () => _showDeckTooltip(st));
      g.addEventListener('mouseleave', _hidePipeTooltip);
      g.addEventListener('click', e => {
        e.stopPropagation();
        _deckPinnedId = _deckPinnedId === st.id ? null : st.id;
        renderAllPipes();
        if (_deckPinnedId) _showDeckTooltip(st, e); else _hidePipeTooltip();
      });
    }
    svg.appendChild(g);

    // 라벨 (호버 대상 아님)
    const [cx, cy] = _deckCentroid(pts);
    const t = _deckEl('text', {
      class: 'deck-label', x: cx, y: cy + fs * 0.35, 'text-anchor': 'middle',
      fill: meta.stroke, 'font-size': fs, 'font-weight': '800',
      'paint-order': 'stroke', stroke: '#fff', 'stroke-width': fs * 0.28,
    });
    t.textContent = `${st.name} ${meta.label}`;
    svg.appendChild(t);
  });

  if (_deckEdit) _renderDeckEditOverlay(svg, data, sw);
  else _renderDeckSummary(data);
}

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
  try { localStorage.setItem(`sg2_deck_visible_${siteId}`, 'true'); } catch {}
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

// 고정 해제: 지도 빈 곳 클릭
document.addEventListener('click', e => {
  if (_deckPinnedId && !e.target.closest('.deck-stage')) {
    _deckPinnedId = null;
    _hidePipeTooltip();
    if (typeof renderAllPipes === 'function') renderAllPipes();
  }
});
