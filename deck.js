// ===== 복공 단계 현황 =====
// pipe_settings key: '_deck_{siteId}', colors column = { stages:[{id,name,status,points,date,memo}] }
// 표시 ON/OFF는 보는 사람별(localStorage), 단계 데이터는 Supabase 공유

const DECK_STATUS = {
  done: { label: '복공완료', icon: '✅', color: '#334155', stroke: '#0f172a' },
  wip:  { label: '작업중',   icon: '🚧', color: '#f97316', stroke: '#c2410c' },
  plan: { label: '예정',     icon: '⬜', color: '#94a3b8', stroke: '#64748b' },
};

const _deckData   = {};   // siteId → { stages: [] }
const _deckLoaded = {};   // siteId → true (로드 완료) / 'loading'
let _deckEdit     = false;
let _deckDraft    = null; // 편집 중 사본
let _deckSelId    = null;
let _deckPinnedId = null;

function _deckSite() { return window.currentDashSite || '115st'; }

function _deckDefault() {
  return { stages: [
    { id: 'd1', name: '1단계', status: 'done', points: [], date: '', memo: '' },
    { id: 'd2', name: '2단계', status: 'done', points: [], date: '', memo: '' },
    { id: 'd3', name: '3단계', status: 'wip',  points: [], date: '', memo: '' },
    { id: 'd4', name: '4단계', status: 'plan', points: [], date: '', memo: '' },
  ]};
}

function _getDeckData(siteId) {
  if (_deckData[siteId]) return _deckData[siteId];
  try {
    const raw = JSON.parse(localStorage.getItem(`sg2_deck_${siteId}`) || 'null');
    if (raw && Array.isArray(raw.stages)) return raw;
  } catch {}
  return _deckDefault();
}

async function _loadDeckForSite(siteId) {
  if (_deckLoaded[siteId]) return;
  _deckLoaded[siteId] = 'loading';
  try {
    const rows = await fetchAllPipeSettings();
    const raw = rows[`_deck_${siteId}`]?.colors;
    if (raw && Array.isArray(raw.stages)) {
      _deckData[siteId] = raw;
      try { localStorage.setItem(`sg2_deck_${siteId}`, JSON.stringify(raw)); } catch {}
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
  _updateDeckBtn();
  renderAllPipes();
};

function _updateDeckBtn() {
  const btn = document.getElementById('deck-toggle-btn');
  if (btn) btn.textContent = _deckVisible() ? '🟫 복공현황 숨기기' : '🟫 복공현황 표시';
}

// ── 렌더 ──────────────────────────────────────────────────────
function _deckEsc(s) {
  return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function _deckCentroid(pts) {
  return [pts.reduce((s, p) => s + p[0], 0) / pts.length, pts.reduce((s, p) => s + p[1], 0) / pts.length];
}

function _deckDefs(svg) {
  const u = Math.max(12, _mapNatW / 70); // 복공판 1장 크기
  const defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
  defs.innerHTML = `
    <pattern id="deck-pat-done" width="${u}" height="${u / 2}" patternUnits="userSpaceOnUse">
      <rect width="${u}" height="${u / 2}" fill="#475569"/>
      <rect x="${u * 0.04}" y="${u * 0.04}" width="${u * 0.92}" height="${u / 2 - u * 0.08}" fill="#64748b" stroke="#1e293b" stroke-width="${u * 0.03}"/>
    </pattern>
    <pattern id="deck-pat-wip" width="${u / 2}" height="${u / 2}" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
      <rect width="${u / 2}" height="${u / 2}" fill="#fed7aa"/>
      <rect width="${u / 4}" height="${u / 2}" fill="#f97316"/>
    </pattern>`;
  svg.appendChild(defs);
}

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
  const stages = data.stages.filter(s => s.points.length >= (_deckEdit ? 1 : 3));
  if (!stages.length && !_deckEdit) return;

  _deckDefs(svg);
  const sw = Math.max(3, _mapNatW / 350);
  const fs = Math.max(16, _mapNatW / 110);

  stages.forEach(st => {
    const meta = DECK_STATUS[st.status] || DECK_STATUS.plan;
    const isSel = _deckEdit && st.id === _deckSelId;

    const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    g.classList.add('deck-stage');
    if (_deckEdit) g.classList.add(isSel ? 'deck-selected' : 'deck-dim');
    if (!_deckEdit && st.id === _deckPinnedId) g.classList.add('deck-pinned');
    g.dataset.id = st.id;

    const poly = document.createElementNS('http://www.w3.org/2000/svg', st.points.length >= 3 ? 'polygon' : 'polyline');
    poly.setAttribute('points', st.points.map(p => p.join(',')).join(' '));
    poly.setAttribute('fill', st.points.length < 3 ? 'none'
      : st.status === 'done' ? 'url(#deck-pat-done)'
      : st.status === 'wip'  ? 'url(#deck-pat-wip)'
      : 'rgba(148,163,184,0.25)');
    poly.setAttribute('stroke', meta.stroke);
    poly.setAttribute('stroke-width', st.status === 'wip' ? sw * 1.6 : sw);
    poly.setAttribute('stroke-linejoin', 'round');
    if (st.status === 'plan') poly.setAttribute('stroke-dasharray', `${_mapNatW / 90} ${_mapNatW / 140}`);
    g.appendChild(poly);

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

    // 꼭짓점 (편집 중 선택 단계)
    if (isSel) {
      const r = Math.max(8, _mapNatW / 180);
      st.points.forEach((p, i) => {
        const c = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        c.setAttribute('cx', p[0]); c.setAttribute('cy', p[1]); c.setAttribute('r', r);
        c.setAttribute('fill', i === 0 ? meta.stroke : '#fff');
        c.setAttribute('stroke', meta.stroke); c.setAttribute('stroke-width', sw);
        svg.appendChild(c);
      });
    }

    // 라벨 (항상 읽히도록 면과 별도, 호버 대상 아님)
    if (st.points.length >= 3) {
      const [cx, cy] = _deckCentroid(st.points);
      const t = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      t.classList.add('deck-label');
      t.setAttribute('x', cx); t.setAttribute('y', cy + fs * 0.35);
      t.setAttribute('text-anchor', 'middle');
      t.setAttribute('fill', meta.stroke); t.setAttribute('font-size', fs);
      t.setAttribute('font-weight', '800');
      t.setAttribute('paint-order', 'stroke');
      t.setAttribute('stroke', '#fff'); t.setAttribute('stroke-width', fs * 0.28);
      t.textContent = `${st.name} ${meta.label}`;
      svg.appendChild(t);
    }
  });

  if (!_deckEdit) _renderDeckSummary(data);
}

function _renderDeckSummary(data) {
  const mc = document.getElementById('map-container');
  if (!mc) return;
  let el = document.getElementById('deck-summary');
  const drawn = data ? data.stages.filter(s => s.points.length >= 3) : [];
  if (!drawn.length) { if (el) el.style.display = 'none'; return; }
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
  _deckSelId = (_deckDraft.stages.find(s => s.points.length < 3) || _deckDraft.stages[0])?.id || null;
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
  document.getElementById('zone-toggle-bar').style.display = 'flex';
  document.getElementById('deck-edit-bar').style.display  = 'none';
  document.getElementById('zone-click-overlay').style.display = 'none';
  renderAllPipes();
};

window.saveDeckEdit = async function() {
  const siteId = _deckSite();
  const data = _deckDraft;
  try {
    await _saveDeckData(siteId, data);
  } catch (e) { alert('복공 단계 저장 실패: ' + e.message); return; }
  try { localStorage.setItem(`sg2_deck_visible_${siteId}`, 'true'); } catch {}
  _updateDeckBtn();
  cancelDeckEdit();
};

function _deckSel() { return _deckDraft?.stages.find(s => s.id === _deckSelId); }

function _renderDeckEditBar() {
  const sel = document.getElementById('deck-stage-sel');
  if (!sel || !_deckDraft) return;
  sel.innerHTML = _deckDraft.stages.map(s =>
    `<option value="${s.id}"${s.id === _deckSelId ? ' selected' : ''}>${_deckEsc(s.name)}${s.points.length >= 3 ? '' : ' (미작도)'}</option>`).join('');
  const st = _deckSel();
  document.getElementById('deck-status-sel').value = st?.status || 'plan';
  document.getElementById('deck-date-input').value = st?.date || '';
  document.getElementById('deck-memo-input').value = st?.memo || '';
}

window._deckSelectStage = function(id) { _deckSelId = id; _renderDeckEditBar(); renderAllPipes(); };

window._deckSetField = function(field, value) {
  const st = _deckSel();
  if (!st) return;
  st[field] = value;
  renderAllPipes();
};

window._deckAddStage = function() {
  const n = _deckDraft.stages.length + 1;
  const name = (prompt('단계 이름', `${n}단계`) || '').trim();
  if (!name) return;
  const st = { id: 'd' + Date.now(), name, status: 'plan', points: [], date: '', memo: '' };
  _deckDraft.stages.push(st);
  _deckSelId = st.id;
  _renderDeckEditBar();
  renderAllPipes();
};

window._deckDeleteStage = function() {
  const st = _deckSel();
  if (!st || !confirm(`'${st.name}' 단계를 삭제할까요?`)) return;
  _deckDraft.stages = _deckDraft.stages.filter(s => s.id !== st.id);
  _deckSelId = _deckDraft.stages[0]?.id || null;
  _renderDeckEditBar();
  renderAllPipes();
};

window._deckUndoPoint  = function() { _deckSel()?.points.pop(); _renderDeckEditBar(); renderAllPipes(); };
window._deckClearPoints = function() { const st = _deckSel(); if (st) st.points = []; _renderDeckEditBar(); renderAllPipes(); };

// _onZoneOverlayClick에서 호출 → true면 처리 완료
function _onDeckMapClick(x, y) {
  if (!_deckEdit) return false;
  const st = _deckSel();
  if (st) { st.points.push([x, y]); _renderDeckEditBar(); renderAllPipes(); }
  return true;
}

// 고정 해제: 지도 빈 곳 클릭
document.addEventListener('click', e => {
  if (_deckPinnedId && !e.target.closest('.deck-stage')) {
    _deckPinnedId = null;
    _hidePipeTooltip();
    if (typeof renderAllPipes === 'function') renderAllPipes();
  }
});
