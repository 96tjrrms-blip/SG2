// ===== 비상대응방안 =====

const _EMERG_IMGS = {
  'S015':  'photo_s015.jpg.jpg',
  '115st': 'map.png',
  'S016':  'photo_s016.jpg.JPG',
};

let _emergSite      = '115st';
let _emergValves    = [];   // [{ id, x, y, label }]
let _emergScenarios = [];   // [{ id, x, y, label, desc, procedure, internalValves:[], externalValves:[{name,location,note}] }]
let _emergMode      = 'view';   // 'view' | 'addValve' | 'addScenario'
let _emergActive    = null;     // 활성 시나리오 id
let _emergSubTab    = 'plan';   // 'plan' | 'contacts'

// ===== 서브탭 전환 =====
window.showEmergSubTab = function(tab) {
  _emergSubTab = tab;
  const planPanel     = document.getElementById('emerg-plan-panel');
  const contactsPanel = document.getElementById('emerg-contacts-panel');
  const btnPlan       = document.getElementById('emerg-subtab-plan');
  const btnContacts   = document.getElementById('emerg-subtab-contacts');
  const isPlan = tab === 'plan';
  if (planPanel)     planPanel.style.display     = isPlan ? '' : 'none';
  if (contactsPanel) contactsPanel.style.display = isPlan ? 'none' : '';
  if (btnPlan) {
    btnPlan.style.color = isPlan ? '#0d2b5e' : '#6b7280';
    btnPlan.style.fontWeight = isPlan ? '700' : '600';
    btnPlan.style.borderBottomColor = isPlan ? '#0d2b5e' : 'transparent';
  }
  if (btnContacts) {
    btnContacts.style.color = isPlan ? '#6b7280' : '#0d2b5e';
    btnContacts.style.fontWeight = isPlan ? '600' : '700';
    btnContacts.style.borderBottomColor = isPlan ? 'transparent' : '#0d2b5e';
  }
  if (tab === 'contacts') _renderEmergContacts();
};

// ===== 사이트 전환 =====
window.switchEmergSite = function(siteId) {
  _emergSite = siteId;
  document.querySelectorAll('.emerg-tab').forEach(b =>
    b.classList.toggle('active', b.dataset.esite === siteId));
  const img = document.getElementById('emerg-map-img');
  if (img) img.src = _EMERG_IMGS[siteId] || 'map.png';
  _loadEmergData(siteId);
  _renderEmergPipes();
  if (_emergSubTab === 'contacts') _loadEmergContacts(siteId).then(_renderEmergContacts);
};

// ===== 데이터 로드/저장 =====
async function _loadEmergData(siteId) {
  try {
    const rows = await fetchAllPipeSettings();
    _emergValves    = rows[`_emerg_valves_${siteId}`]?.colors    ?? [];
    _emergScenarios = rows[`_emerg_scenarios_${siteId}`]?.colors ?? [];
    _emergOrgChart  = rows[`_emerg_contacts_${siteId}`]?.chart ?? _ORG_DEFAULT();
  } catch {
    _emergValves = []; _emergScenarios = []; _emergOrgChart = _ORG_DEFAULT();
  }
  _renderEmergMarkers();
  if (_emergSubTab === 'contacts') _renderEmergContacts();
}

function _saveEmergValves() {
  upsertPipeSettings(`_emerg_valves_${_emergSite}`, { colors: _emergValves }).catch(e => console.warn('emerg valve save:', e));
}
function _saveEmergScenarios() {
  upsertPipeSettings(`_emerg_scenarios_${_emergSite}`, { colors: _emergScenarios }).catch(e => console.warn('emerg scenario save:', e));
}

// ===== 비상연락망 (조직도) =====
let _emergOrgChart  = null;
let _emergOrgEditMode = false;

const _ORG_DEFAULT = () => ({
  title: '합동감시체제 조직표',
  leftTitle: '공사 시공자측',
  rightTitle: '(주)삼천리 도시가스 사업자측',
  rows: []
});

async function _loadEmergContacts(siteId) {
  try {
    const rows = await fetchAllPipeSettings();
    _emergOrgChart = rows[`_emerg_contacts_${siteId}`]?.chart ?? null;
    if (!_emergOrgChart) _emergOrgChart = _ORG_DEFAULT();
  } catch {
    _emergOrgChart = _ORG_DEFAULT();
  }
}

function _saveEmergContacts() {
  upsertPipeSettings(`_emerg_contacts_${_emergSite}`, { chart: _emergOrgChart })
    .catch(e => console.warn('emerg org save:', e));
}

function _esc(s) {
  return String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function _renderEmergContacts() {
  const el = document.getElementById('emerg-contacts-table');
  if (!el) return;
  const org = _emergOrgChart || _ORG_DEFAULT();
  const em  = _emergOrgEditMode;

  const BOX_BASE = `flex:1;border-radius:7px;padding:9px 10px;text-align:center;
    min-height:64px;display:flex;flex-direction:column;justify-content:center;gap:3px;`;
  const BOX_FILLED = BOX_BASE + `border:1.5px solid #334155;background:#fff;cursor:${em?'pointer':'default'};`;
  const BOX_EMPTY  = BOX_BASE + `border:1.5px dashed #cbd5e1;background:#f8fafc;opacity:0.6;cursor:${em?'pointer':'default'};`;
  const CTR_BASE   = `width:110px;flex-shrink:0;border-radius:7px;padding:8px 6px;text-align:center;
    display:flex;align-items:center;justify-content:center;font-size:11.5px;font-weight:600;
    color:#334155;white-space:pre-line;line-height:1.5;cursor:${em?'pointer':'default'};`;
  const CTR_FILLED = CTR_BASE + `border:1.5px solid #475569;background:#fff;`;
  const CTR_EMPTY  = CTR_BASE + `border:1.5px dashed #cbd5e1;background:#f8fafc;opacity:0.4;`;
  const ARM = `width:16px;flex-shrink:0;display:flex;align-items:center;`;
  const LINE = `width:100%;height:2px;background:#6b7280;`;

  const renderBox = (cell, rid, side) => {
    if (!cell) return `<div style="${BOX_EMPTY}" onclick="${em?`_editOrgCell('${rid}','${side}')`:''}">
      ${em ? `<span style="font-size:11px;color:#9ca3af">클릭하여 추가</span>` : ''}
    </div>`;
    const phoneHtml = cell.phone
      ? `<a href="tel:${_esc(cell.phone)}" style="color:#0d2b5e;font-size:11.5px;font-weight:500;text-decoration:none" onclick="event.stopPropagation()">📞 ${_esc(cell.phone)}</a>`
      : '';
    return `<div style="${BOX_FILLED}" onclick="${em?`_editOrgCell('${rid}','${side}')`:''}">
      ${cell.role ? `<div style="font-size:11px;color:#64748b;line-height:1.3">${_esc(cell.role)}</div>` : ''}
      ${cell.name ? `<div style="font-size:13px;font-weight:700;color:#0d2b5e">${_esc(cell.name)}</div>` : ''}
      ${phoneHtml}
    </div>`;
  };

  const renderCenter = (center, rid) => {
    const hasLine = !!center;
    const armHtml = `<div style="${ARM}"><div style="${hasLine ? LINE : 'width:100%;'}"></div></div>`;
    const box = center
      ? `<div style="${CTR_FILLED}" onclick="${em?`_editOrgCell('${rid}','center')`:''}">
           ${_esc(center.label || '')}${em ? ' ✎' : ''}
         </div>`
      : `<div style="${CTR_EMPTY}" onclick="${em?`_editOrgCell('${rid}','center')`:''}">
           ${em ? `<span style="font-size:10px;color:#aaa">+중앙</span>` : ''}
         </div>`;
    return armHtml + box + armHtml;
  };

  const rowsHtml = org.rows.map(row => `
    <div style="display:flex;align-items:stretch;gap:0;margin-bottom:8px">
      ${renderBox(row.left, row.id, 'left')}
      ${renderCenter(row.center, row.id)}
      ${renderBox(row.right, row.id, 'right')}
      ${em ? `<div style="display:flex;align-items:center;padding-left:8px">
        <button onclick="_deleteOrgRow('${row.id}')"
          style="padding:3px 8px;border-radius:5px;border:1px solid #fca5a5;background:#fff;color:#ef4444;font-size:11px;cursor:pointer">✕</button>
      </div>` : ''}
    </div>`).join('');

  const headerPad = em ? 'padding-right:44px' : '';
  el.innerHTML = `
    <div style="padding:16px">
      <div style="text-align:center;font-size:14px;font-weight:700;color:#1e293b;padding:8px 0 14px;
        border-bottom:1px solid #e2e8f0;margin-bottom:14px;cursor:${em?'pointer':'default'}"
        onclick="${em?'_editOrgTitle()':''}">
        &lt; ${_esc(org.title)} &gt;${em ? ' <span style="font-size:11px;color:#94a3b8">✎</span>' : ''}
      </div>
      <div style="display:flex;align-items:center;margin-bottom:10px;${headerPad}">
        <div style="flex:1;text-align:center;font-weight:700;font-size:13px;color:#0d2b5e;cursor:${em?'pointer':'default'}"
          onclick="${em?`_editOrgGroupTitle('left')`:''}">
          ${_esc(org.leftTitle)}${em ? ' <span style="font-size:10px;color:#94a3b8">✎</span>' : ''}
        </div>
        <div style="width:142px;flex-shrink:0"></div>
        <div style="flex:1;text-align:center;font-weight:700;font-size:13px;color:#0d2b5e;cursor:${em?'pointer':'default'}"
          onclick="${em?`_editOrgGroupTitle('right')`:''}">
          ${_esc(org.rightTitle)}${em ? ' <span style="font-size:10px;color:#94a3b8">✎</span>' : ''}
        </div>
      </div>
      ${rowsHtml}
      ${org.rows.length === 0 ? `<div style="text-align:center;padding:28px 0;color:#9ca3af;font-size:13px">
        행을 추가해 조직도를 만들어보세요</div>` : ''}
      ${em ? `<button onclick="_addOrgRow()"
        style="width:100%;margin-top:8px;padding:10px;border-radius:7px;border:1.5px dashed #94a3b8;
          background:#f8fafc;color:#64748b;font-size:13px;cursor:pointer;font-weight:500">+ 행 추가</button>` : ''}
    </div>`;
}

// ── 조직도 편집 함수 ─────────────────────────────────────────

window.saveEmergOrgNow = function() {
  if (!_emergOrgChart) return;
  _saveEmergContacts();
  const toast = document.getElementById('emerg-save-toast');
  if (toast) {
    toast.style.display = 'inline';
    setTimeout(() => { toast.style.display = 'none'; }, 2000);
  }
};

window.toggleEmergOrgEdit = function() {
  _emergOrgEditMode = !_emergOrgEditMode;
  const btn = document.getElementById('emerg-org-edit-btn');
  if (btn) {
    btn.textContent = _emergOrgEditMode ? '✓ 편집 완료' : '편집';
    btn.style.background = _emergOrgEditMode ? '#0d2b5e' : '#fff';
    btn.style.color = _emergOrgEditMode ? '#fff' : '#0d2b5e';
  }
  _renderEmergContacts();
};

window._editOrgTitle = function() {
  const val = prompt('조직표 제목', _emergOrgChart.title);
  if (val === null) return;
  _emergOrgChart.title = val.trim() || _emergOrgChart.title;
  _saveEmergContacts(); _renderEmergContacts();
};

window._editOrgGroupTitle = function(side) {
  const cur = side === 'left' ? _emergOrgChart.leftTitle : _emergOrgChart.rightTitle;
  const val = prompt((side === 'left' ? '왼쪽' : '오른쪽') + ' 그룹명', cur);
  if (val === null) return;
  const v = val.trim() || cur;
  if (side === 'left') _emergOrgChart.leftTitle = v; else _emergOrgChart.rightTitle = v;
  _saveEmergContacts(); _renderEmergContacts();
};

window._addOrgRow = function() {
  if (!_emergOrgChart) _emergOrgChart = _ORG_DEFAULT();
  _emergOrgChart.rows.push({ id: `r_${Date.now()}`, left: null, center: null, right: null });
  _saveEmergContacts(); _renderEmergContacts();
};

window._deleteOrgRow = function(rowId) {
  if (!confirm('이 행을 삭제하시겠습니까?')) return;
  _emergOrgChart.rows = _emergOrgChart.rows.filter(r => r.id !== rowId);
  _saveEmergContacts(); _renderEmergContacts();
};

window._editOrgCell = function(rowId, side) {
  if (!_emergOrgEditMode) return;
  const row = _emergOrgChart.rows.find(r => r.id === rowId);
  if (!row) return;

  if (side === 'center') {
    const cur = row.center?.label ?? '';
    const val = prompt('가운데 박스 내용 (줄바꿈: Enter)', cur);
    if (val === null) return;
    row.center = val.trim() ? { label: val.trim() } : null;
    _saveEmergContacts(); _renderEmergContacts();
    return;
  }

  const cell = row[side] || { role: '', name: '', phone: '' };
  const modal = document.getElementById('emerg-modal');
  const body  = document.getElementById('emerg-modal-body');
  body.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px">
      <h3 style="margin:0;font-size:15px;color:#0d2b5e">${side === 'left' ? '왼쪽' : '오른쪽'} 칸 편집</h3>
      <button onclick="document.getElementById('emerg-modal').style.display='none'"
        style="background:none;border:none;font-size:20px;cursor:pointer;color:#6b7280;line-height:1">✕</button>
    </div>
    <div style="display:flex;flex-direction:column;gap:11px">
      <div>
        <label style="font-size:12px;font-weight:600;color:#374151;display:block;margin-bottom:4px">직책/직위</label>
        <input id="oc-role" value="${_esc(cell.role)}" placeholder="예: 현장안전관리 총괄자"
          style="width:100%;box-sizing:border-box;padding:8px 10px;border:1px solid #cbd5e1;border-radius:7px;font-size:13px">
      </div>
      <div>
        <label style="font-size:12px;font-weight:600;color:#374151;display:block;margin-bottom:4px">이름</label>
        <input id="oc-name" value="${_esc(cell.name)}" placeholder="홍길동"
          style="width:100%;box-sizing:border-box;padding:8px 10px;border:1px solid #cbd5e1;border-radius:7px;font-size:13px">
      </div>
      <div>
        <label style="font-size:12px;font-weight:600;color:#374151;display:block;margin-bottom:4px">연락처</label>
        <input id="oc-phone" value="${_esc(cell.phone)}" placeholder="010-0000-0000" type="tel"
          style="width:100%;box-sizing:border-box;padding:8px 10px;border:1px solid #cbd5e1;border-radius:7px;font-size:13px">
      </div>
    </div>
    <div style="display:flex;gap:8px;justify-content:space-between;margin-top:20px">
      <button onclick="_clearOrgCell('${rowId}','${side}')"
        style="padding:8px 14px;border-radius:7px;border:1px solid #fca5a5;background:#fff;color:#ef4444;font-size:12px;cursor:pointer">칸 비우기</button>
      <div style="display:flex;gap:8px">
        <button onclick="document.getElementById('emerg-modal').style.display='none'"
          style="padding:8px 16px;border-radius:7px;border:1px solid #cbd5e1;background:#fff;color:#374151;font-size:13px;cursor:pointer">취소</button>
        <button onclick="_saveOrgCell('${rowId}','${side}')"
          style="padding:8px 18px;border-radius:7px;border:none;background:#0d2b5e;color:#fff;font-size:13px;font-weight:600;cursor:pointer">저장</button>
      </div>
    </div>`;
  modal.style.display = 'flex';
};

window._saveOrgCell = function(rowId, side) {
  const row = _emergOrgChart.rows.find(r => r.id === rowId);
  if (!row) return;
  const role  = document.getElementById('oc-role').value.trim();
  const name  = document.getElementById('oc-name').value.trim();
  const phone = document.getElementById('oc-phone').value.trim();
  row[side] = (role || name || phone) ? { role, name, phone } : null;
  _saveEmergContacts(); _renderEmergContacts();
  document.getElementById('emerg-modal').style.display = 'none';
};

window._clearOrgCell = function(rowId, side) {
  const row = _emergOrgChart.rows.find(r => r.id === rowId);
  if (row) row[side] = null;
  _saveEmergContacts(); _renderEmergContacts();
  document.getElementById('emerg-modal').style.display = 'none';
};

// ===== 마커 좌표 계산 (줌 없음, 퍼센트 기반) =====
function _emergScreenPos(xPct, yPct) {
  const c = document.getElementById('emerg-map-container');
  return {
    x: (xPct / 100) * c.clientWidth,
    y: (yPct / 100) * c.clientHeight,
  };
}

function _emergMapPos(clientX, clientY) {
  const c = document.getElementById('emerg-map-container');
  const r = c.getBoundingClientRect();
  return {
    x: +((clientX - r.left) / c.clientWidth  * 100).toFixed(2),
    y: +((clientY - r.top)  / c.clientHeight * 100).toFixed(2),
  };
}

// ===== 배관 렌더링 (115정거장 전용) =====
function _renderEmergPipes() {
  const svg = document.getElementById('emerg-svg');
  if (!svg) return;
  svg.innerHTML = '';

  if (_emergSite !== '115st') return;

  const img = document.getElementById('emerg-map-img');
  const w = (img && img.naturalWidth) ? img.naturalWidth : (window._mapNatW || 0);
  const h = (img && img.naturalHeight) ? img.naturalHeight : (window._mapNatH || 0);

  if (!w || !h) {
    img && img.addEventListener('load', _renderEmergPipes, { once: true });
    return;
  }

  svg.setAttribute('viewBox', `0 0 ${w} ${h}`);
  const ns = 'http://www.w3.org/2000/svg';
  const lineW = Math.max(3, w / 200);

  const segs = (typeof PIPELINE_SEGMENTS !== 'undefined' ? PIPELINE_SEGMENTS : [])
    .filter(s => !s.site || s.site === '115정거장');

  segs.forEach(seg => {
    const pts = (seg.points || []).map(p => `${p[0]},${p[1]}`).join(' ');
    const line = document.createElementNS(ns, 'polyline');
    line.setAttribute('points', pts);
    line.setAttribute('fill', 'none');
    line.setAttribute('stroke', seg.color || '#facc15');
    line.setAttribute('stroke-width', lineW);
    line.setAttribute('stroke-linecap', 'round');
    line.setAttribute('stroke-linejoin', 'round');
    line.setAttribute('opacity', '0.85');
    line.style.pointerEvents = 'none';
    svg.appendChild(line);
  });

  // 현장개요에서 추가한 커스텀 밸브도 함께 표시
  _renderEmergValvesOnSvg();
}

// ===== 현장개요 밸브 렌더 (emerg-svg에 겹쳐 표시) =====

function _renderEmergValvesOnSvg() {
  const svg = document.getElementById('emerg-svg');
  if (!svg || _emergSite !== '115st') return;

  const img = document.getElementById('emerg-map-img');
  const w = (img && img.naturalWidth) ? img.naturalWidth : (window._mapNatW || 0);
  const h = (img && img.naturalHeight) ? img.naturalHeight : (window._mapNatH || 0);
  if (!w || !h) return;

  const valves = window._peGetValves ? window._peGetValves('115st') : [];
  if (!valves.length) return;

  const r = Math.max(22, w / 32);
  const ns = 'http://www.w3.org/2000/svg';
  const mk = (parent, tag, attrs) => {
    const el = document.createElementNS(ns, tag);
    Object.entries(attrs).forEach(([k, v]) => el.setAttribute(k, v));
    parent.appendChild(el);
    return el;
  };

  valves.forEach(v => {
    const { x, y, name, id } = v;
    const g = document.createElementNS(ns, 'g');
    g.style.cursor = window._editMode ? 'pointer' : 'default';

    // 밸브 아이콘 (나비형 — 현장개요와 동일)
    mk(g, 'polygon', { points: `${x-r},${y-r} ${x},${y} ${x-r},${y+r}`,
      fill: '#ef4444', stroke: '#fff', 'stroke-width': r*0.18, 'stroke-linejoin': 'round' });
    mk(g, 'polygon', { points: `${x+r},${y-r} ${x},${y} ${x+r},${y+r}`,
      fill: '#ef4444', stroke: '#fff', 'stroke-width': r*0.18, 'stroke-linejoin': 'round' });
    mk(g, 'line', { x1:x-r, y1:y, x2:x+r, y2:y, stroke:'#fff', 'stroke-width':r*0.22 });
    mk(g, 'line', { x1:x, y1:y-r, x2:x, y2:y-r*1.9, stroke:'#ef4444', 'stroke-width':r*0.28 });
    mk(g, 'circle', { cx:x, cy:y-r*2.3, r:r*0.5, fill:'none', stroke:'#ef4444', 'stroke-width':r*0.28 });
    mk(g, 'circle', { cx:x, cy:y, r:r*3, fill:'transparent' }); // 히트영역

    const lbl = document.createElementNS(ns, 'text');
    lbl.setAttribute('x', x); lbl.setAttribute('y', y + r * 2.8);
    lbl.setAttribute('text-anchor', 'middle');
    lbl.setAttribute('fill', '#ef4444');
    lbl.setAttribute('font-size', r * 1.3);
    lbl.setAttribute('font-weight', '700');
    lbl.setAttribute('paint-order', 'stroke');
    lbl.setAttribute('stroke', '#000');
    lbl.setAttribute('stroke-width', r * 0.35);
    lbl.textContent = name;
    g.appendChild(lbl);

    // 편집 모드: 클릭으로 이름 수정
    if (window._editMode) {
      g.addEventListener('click', async e => {
        e.stopPropagation();
        const newName = prompt('밸브 이름 수정:', name);
        if (newName === null || newName.trim() === '') return;
        if (window._peUpdateValveName) {
          await window._peUpdateValveName('115st', id, newName.trim());
        }
        _renderEmergPipes();
      });
    }

    svg.appendChild(g);
  });
}

// ===== 마커 렌더 =====
function _mkSvgEl(tag) { return document.createElementNS('http://www.w3.org/2000/svg', tag); }

function _renderEmergMarkers() {
  const svg = document.getElementById('emerg-overlay-svg');
  if (!svg) return;
  svg.innerHTML = '';

  const activeScenario  = _emergScenarios.find(s => s.id === _emergActive);
  const highlightedVIds = new Set(activeScenario?.internalValves || []);

  // 밸브 마커 (초록 / 활성 시 빨강)
  _emergValves.forEach(v => {
    const { x, y } = _emergScreenPos(v.x, v.y);
    const isHL = highlightedVIds.has(v.id);

    const g = _mkSvgEl('g');
    g.setAttribute('transform', `translate(${x},${y})`);
    g.style.pointerEvents = 'all';

    const r = 13;
    const color = isHL ? '#ef4444' : '#16a34a';
    const sw = r * 0.18;

    if (isHL) {
      const ring = _mkSvgEl('circle');
      ring.setAttribute('r', String(r * 2.8));
      ring.setAttribute('fill', 'none');
      ring.setAttribute('stroke', '#ef4444');
      ring.setAttribute('stroke-width', '2');
      ring.setAttribute('stroke-opacity', '0.5');
      ring.setAttribute('stroke-dasharray', '4,3');
      g.appendChild(ring);
    }

    // 나비밸브 — 좌날개
    const wL = _mkSvgEl('polygon');
    wL.setAttribute('points', `-${r},-${r} 0,0 -${r},${r}`);
    wL.setAttribute('fill', color); wL.setAttribute('stroke', '#fff');
    wL.setAttribute('stroke-width', sw); wL.setAttribute('stroke-linejoin', 'round');
    g.appendChild(wL);
    // 나비밸브 — 우날개
    const wR = _mkSvgEl('polygon');
    wR.setAttribute('points', `${r},-${r} 0,0 ${r},${r}`);
    wR.setAttribute('fill', color); wR.setAttribute('stroke', '#fff');
    wR.setAttribute('stroke-width', sw); wR.setAttribute('stroke-linejoin', 'round');
    g.appendChild(wR);
    // 수평 축
    const hBar = _mkSvgEl('line');
    hBar.setAttribute('x1', String(-r)); hBar.setAttribute('y1', '0');
    hBar.setAttribute('x2', String(r));  hBar.setAttribute('y2', '0');
    hBar.setAttribute('stroke', '#fff'); hBar.setAttribute('stroke-width', String(r * 0.22));
    g.appendChild(hBar);
    // 스템
    const stem = _mkSvgEl('line');
    stem.setAttribute('x1', '0'); stem.setAttribute('y1', String(-r));
    stem.setAttribute('x2', '0'); stem.setAttribute('y2', String(-r * 1.9));
    stem.setAttribute('stroke', color); stem.setAttribute('stroke-width', String(r * 0.28));
    g.appendChild(stem);
    // 핸들휠
    const wheel = _mkSvgEl('circle');
    wheel.setAttribute('cx', '0'); wheel.setAttribute('cy', String(-r * 2.3));
    wheel.setAttribute('r', String(r * 0.5));
    wheel.setAttribute('fill', 'none'); wheel.setAttribute('stroke', color);
    wheel.setAttribute('stroke-width', String(r * 0.28));
    g.appendChild(wheel);
    // 히트 영역
    const hit = _mkSvgEl('circle');
    hit.setAttribute('r', String(r * 3)); hit.setAttribute('fill', 'transparent');
    g.appendChild(hit);

    const lbl = _mkSvgEl('text');
    lbl.setAttribute('x', '0'); lbl.setAttribute('y', '30');
    lbl.setAttribute('text-anchor', 'middle');
    lbl.setAttribute('font-size', '12'); lbl.setAttribute('font-weight', '700');
    lbl.setAttribute('fill', isHL ? '#dc2626' : '#166534');
    lbl.setAttribute('font-family', 'sans-serif');
    lbl.setAttribute('stroke', 'white'); lbl.setAttribute('stroke-width', '3');
    lbl.setAttribute('paint-order', 'stroke');
    lbl.textContent = v.label;
    g.appendChild(lbl);

    if (window._editMode) {
      g.style.cursor = 'pointer';
      g.addEventListener('click', e => {
        e.stopPropagation();
        if (confirm(`"${v.label}" 밸브를 삭제할까요?`)) {
          _emergValves = _emergValves.filter(x => x.id !== v.id);
          _saveEmergValves();
          _renderEmergMarkers();
        }
      });
    }

    svg.appendChild(g);
  });

  // 사고지점 마커 (주황 삼각형 / 활성 시 빨강)
  _emergScenarios.forEach(s => {
    const { x, y } = _emergScreenPos(s.x, s.y);
    const isActive = _emergActive === s.id;

    const g = _mkSvgEl('g');
    g.setAttribute('transform', `translate(${x},${y})`);
    g.style.pointerEvents = 'all';
    g.style.cursor = 'pointer';

    const tri = _mkSvgEl('polygon');
    tri.setAttribute('points', '0,-20 18,14 -18,14');
    tri.setAttribute('fill', isActive ? '#dc2626' : '#f59e0b');
    tri.setAttribute('stroke', '#fff');
    tri.setAttribute('stroke-width', '2');
    tri.setAttribute('stroke-linejoin', 'round');
    g.appendChild(tri);

    const excl = _mkSvgEl('text');
    excl.setAttribute('x', '0'); excl.setAttribute('y', '8');
    excl.setAttribute('text-anchor', 'middle');
    excl.setAttribute('dominant-baseline', 'middle');
    excl.setAttribute('font-size', '16'); excl.setAttribute('font-weight', '900');
    excl.setAttribute('fill', '#fff'); excl.setAttribute('font-family', 'sans-serif');
    excl.textContent = '!';
    g.appendChild(excl);

    const lbl = _mkSvgEl('text');
    lbl.setAttribute('x', '0'); lbl.setAttribute('y', '30');
    lbl.setAttribute('text-anchor', 'middle');
    lbl.setAttribute('font-size', '11'); lbl.setAttribute('font-weight', '700');
    lbl.setAttribute('fill', isActive ? '#dc2626' : '#92400e');
    lbl.setAttribute('font-family', 'sans-serif');
    lbl.setAttribute('stroke', 'white'); lbl.setAttribute('stroke-width', '3');
    lbl.setAttribute('paint-order', 'stroke');
    lbl.textContent = s.label;
    g.appendChild(lbl);

    g.addEventListener('click', e => { e.stopPropagation(); _showEmergPopup(s); });

    if (window._editMode) {
      g.addEventListener('contextmenu', e => {
        e.preventDefault(); e.stopPropagation();
        if (confirm(`"${s.label}" 시나리오를 삭제할까요?\n(우클릭으로 삭제)`)) {
          _emergScenarios = _emergScenarios.filter(x => x.id !== s.id);
          _saveEmergScenarios();
          if (_emergActive === s.id) closeEmergPopup();
          _renderEmergMarkers();
        }
      });
    }

    svg.appendChild(g);
  });
}

// ===== 팝업 =====
function _showEmergPopup(scenario) {
  _emergActive = scenario.id;
  _renderEmergMarkers();

  const intLabels = (scenario.internalValves || [])
    .map(vid => _emergValves.find(v => v.id === vid)?.label || vid);

  const intHtml = intLabels.length ? `
    <div style="margin-bottom:10px">
      <div style="font-size:11px;font-weight:700;color:#374151;margin-bottom:5px">🗺️ 이 맵 내 차단 밸브</div>
      <div style="display:flex;flex-wrap:wrap;gap:4px">
        ${intLabels.map(l =>
          `<span style="background:#dcfce7;color:#166534;border:1px solid #86efac;border-radius:12px;padding:2px 10px;font-size:11px;font-weight:700">${l}</span>`
        ).join('')}
      </div>
    </div>` : '';

  const extHtml = (scenario.externalValves || []).length ? `
    <div style="margin-bottom:10px">
      <div style="font-size:11px;font-weight:700;color:#374151;margin-bottom:5px">🌐 외부 차단 밸브</div>
      ${(scenario.externalValves || []).map(ev => `
        <div style="background:#fef2f2;border:1px solid #fecaca;border-radius:8px;padding:9px 11px;margin-bottom:5px">
          <div style="font-size:12px;font-weight:700;color:#dc2626">🔑 ${ev.name}</div>
          ${ev.location ? `<div style="font-size:11px;color:#7f1d1d;margin-top:2px">📍 ${ev.location}</div>` : ''}
          ${ev.note     ? `<div style="font-size:11px;color:#92400e;margin-top:2px">📝 ${ev.note}</div>` : ''}
        </div>`).join('')}
    </div>` : '';

  const procHtml = scenario.procedure ? `
    <div style="padding-top:8px;border-top:1px solid #f3f4f6">
      <div style="font-size:11px;font-weight:700;color:#374151;margin-bottom:4px">📋 대응 절차</div>
      <div style="font-size:11px;color:#4b5563;white-space:pre-line;line-height:1.6">${scenario.procedure}</div>
    </div>` : '';

  const editBtn = window._editMode ? `
    <div style="padding-top:8px;border-top:1px solid #f3f4f6;margin-top:6px">
      <button onclick="openEmergScenarioEdit('${scenario.id}')"
        style="font-size:11px;padding:4px 12px;border-radius:6px;border:1px solid #cbd5e1;background:#f8fafc;cursor:pointer;color:#475569">
        ✏️ 편집
      </button>
    </div>` : '';

  document.getElementById('emerg-popup').innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:10px">
      <div>
        <div style="font-size:13px;font-weight:800;color:#dc2626">⚠️ ${scenario.label}</div>
        ${scenario.desc ? `<div style="font-size:11px;color:#6b7280;margin-top:2px">${scenario.desc}</div>` : ''}
      </div>
      <button onclick="closeEmergPopup()"
        style="background:none;border:none;font-size:16px;cursor:pointer;color:#94a3b8;line-height:1;padding:0 0 0 8px">✕</button>
    </div>
    ${intHtml}${extHtml}${procHtml}${editBtn}
  `;
  document.getElementById('emerg-popup').style.display = 'block';
}

window.closeEmergPopup = function() {
  _emergActive = null;
  const p = document.getElementById('emerg-popup');
  if (p) p.style.display = 'none';
  _renderEmergMarkers();
};

// ===== 편집 모드 =====
window.startEmergValveAdd = function() {
  _emergMode = 'addValve';
  document.getElementById('emerg-valve-overlay').style.display = 'block';
  document.getElementById('emerg-scenario-overlay').style.display = 'none';
  document.getElementById('emerg-mode-hint').textContent = '🔧 밸브 위치를 클릭하세요 (ESC: 취소)';
  document.getElementById('emerg-map-container').style.cursor = 'crosshair';
};

window.startEmergScenarioAdd = function() {
  _emergMode = 'addScenario';
  document.getElementById('emerg-scenario-overlay').style.display = 'block';
  document.getElementById('emerg-valve-overlay').style.display = 'none';
  document.getElementById('emerg-mode-hint').textContent = '⚠️ 사고지점 위치를 클릭하세요 (ESC: 취소)';
  document.getElementById('emerg-map-container').style.cursor = 'crosshair';
};

function _emergCancelMode() {
  _emergMode = 'view';
  const vo = document.getElementById('emerg-valve-overlay');
  const so = document.getElementById('emerg-scenario-overlay');
  if (vo) vo.style.display = 'none';
  if (so) so.style.display = 'none';
  const hint = document.getElementById('emerg-mode-hint');
  if (hint) hint.textContent = '사고지점(⚠)을 클릭하면 차단 밸브를 확인할 수 있습니다';
  const mc = document.getElementById('emerg-map-container');
  if (mc) mc.style.cursor = 'grab';
}

window._onEmergValveClick = function(e) {
  const pos = _emergMapPos(e.clientX, e.clientY);
  const label = prompt('밸브 이름을 입력하세요\n(예: 1번 차단밸브, 맨홀1 앞 밸브)');
  if (!label) { _emergCancelMode(); return; }
  _emergValves.push({ id: 'EV' + Date.now(), x: pos.x, y: pos.y, label: label.trim() });
  _saveEmergValves();
  _emergCancelMode();
  _renderEmergMarkers();
};

window._onEmergScenarioClick = function(e) {
  const pos = _emergMapPos(e.clientX, e.clientY);
  _emergCancelMode();
  _openEmergScenarioModal(null, pos.x, pos.y);
};

// ===== 시나리오 편집 모달 =====
function _openEmergScenarioModal(scenarioId, xPct, yPct) {
  const sc = scenarioId ? _emergScenarios.find(s => s.id === scenarioId) : null;

  const valveChecks = _emergValves.length
    ? _emergValves.map(v => `
        <label style="display:flex;align-items:center;gap:7px;font-size:12px;padding:6px 0;cursor:pointer;border-bottom:1px solid #f3f4f6">
          <input type="checkbox" class="em-int-valve" value="${v.id}"
            ${sc?.internalValves?.includes(v.id) ? 'checked' : ''}
            style="accent-color:#16a34a;width:15px;height:15px;cursor:pointer">
          <span>${v.label}</span>
        </label>`).join('')
    : '<div style="font-size:11px;color:#94a3b8;padding:6px 0">등록된 밸브가 없습니다. 먼저 밸브를 추가하세요.</div>';

  const extRows = (sc?.externalValves || [])
    .map(ev => _emergExtRowHtml(ev.name, ev.location, ev.note))
    .join('');

  const xArg  = xPct  != null ? xPct  : 'null';
  const yArg  = yPct  != null ? yPct  : 'null';
  const scArg = scenarioId || '';

  document.getElementById('emerg-modal-body').innerHTML = `
    <div style="font-size:15px;font-weight:800;color:#0d2b5e;margin-bottom:16px">
      ${sc ? '시나리오 편집' : '새 사고 시나리오 추가'}
    </div>

    <div style="margin-bottom:10px">
      <div style="font-size:11px;font-weight:700;color:#374151;margin-bottom:4px">시나리오 이름 *</div>
      <input id="em-label" value="${sc?.label || ''}" placeholder="예: A구간 배관 파손"
        style="width:100%;padding:8px 10px;border:1px solid #d1d5db;border-radius:7px;font-size:13px;box-sizing:border-box">
    </div>

    <div style="margin-bottom:10px">
      <div style="font-size:11px;font-weight:700;color:#374151;margin-bottom:4px">설명 (선택)</div>
      <input id="em-desc" value="${sc?.desc || ''}" placeholder="예: 맨좌측 구간 가스 누설 사고"
        style="width:100%;padding:8px 10px;border:1px solid #d1d5db;border-radius:7px;font-size:12px;box-sizing:border-box">
    </div>

    <div style="margin-bottom:12px">
      <div style="font-size:11px;font-weight:700;color:#374151;margin-bottom:6px">🗺️ 이 맵 내 차단 밸브 <span style="color:#94a3b8;font-weight:400">(복수 선택 가능)</span></div>
      <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:4px 10px;max-height:140px;overflow-y:auto">
        ${valveChecks}
      </div>
    </div>

    <div style="margin-bottom:12px">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px">
        <div style="font-size:11px;font-weight:700;color:#374151">🌐 외부 차단 밸브</div>
        <button onclick="_addEmergExtRow()"
          style="font-size:11px;padding:3px 10px;border-radius:6px;border:1px solid #93c5fd;background:#eff6ff;color:#1d4ed8;cursor:pointer">+ 추가</button>
      </div>
      <div id="em-ext-rows">${extRows}</div>
    </div>

    <div style="margin-bottom:18px">
      <div style="font-size:11px;font-weight:700;color:#374151;margin-bottom:4px">📋 대응 절차 <span style="color:#94a3b8;font-weight:400">(선택)</span></div>
      <textarea id="em-procedure" rows="4"
        placeholder="예: 1. 1번 차단밸브 잠금&#10;2. 한국가스공사 긴급연락 (1544-4500)&#10;3. 현장 통제 및 119 신고"
        style="width:100%;padding:8px 10px;border:1px solid #d1d5db;border-radius:7px;font-size:12px;box-sizing:border-box;resize:vertical;line-height:1.6"
      >${sc?.procedure || ''}</textarea>
    </div>

    <div style="display:flex;gap:8px;justify-content:flex-end">
      <button onclick="closeEmergModal()"
        style="padding:8px 20px;border-radius:7px;border:1px solid #d1d5db;background:#fff;font-size:12px;cursor:pointer;color:#475569;font-weight:600">
        취소
      </button>
      <button onclick="_saveEmergScenarioModal('${scArg}',${xArg},${yArg})"
        style="padding:8px 20px;border-radius:7px;border:none;background:#dc2626;color:#fff;font-size:13px;font-weight:700;cursor:pointer">
        저장
      </button>
    </div>
  `;
  document.getElementById('emerg-modal').style.display = 'flex';
}

function _emergExtRowHtml(name = '', location = '', note = '') {
  const esc = s => s.replace(/"/g, '&quot;');
  return `<div class="em-ext-row" style="background:#fef2f2;border:1px solid #fecaca;border-radius:8px;padding:9px;margin-bottom:6px">
    <input class="em-ext-name" placeholder="밸브 이름 (예: 메인 차단밸브)" value="${esc(name)}"
      style="width:100%;padding:5px 8px;border:1px solid #fca5a5;border-radius:5px;font-size:11px;margin-bottom:5px;box-sizing:border-box">
    <input class="em-ext-loc"  placeholder="위치 (예: 반송공원 정압기 앞)" value="${esc(location)}"
      style="width:100%;padding:5px 8px;border:1px solid #fca5a5;border-radius:5px;font-size:11px;margin-bottom:5px;box-sizing:border-box">
    <div style="display:flex;gap:5px">
      <input class="em-ext-note" placeholder="비고 (선택)" value="${esc(note)}"
        style="flex:1;padding:5px 8px;border:1px solid #fca5a5;border-radius:5px;font-size:11px;box-sizing:border-box">
      <button onclick="this.closest('.em-ext-row').remove()"
        style="padding:4px 8px;border:1px solid #fca5a5;border-radius:5px;background:#fff;color:#ef4444;cursor:pointer;font-size:12px">✕</button>
    </div>
  </div>`;
}

window._addEmergExtRow = function() {
  const div = document.createElement('div');
  div.innerHTML = _emergExtRowHtml();
  document.getElementById('em-ext-rows').appendChild(div.firstElementChild);
};

window._saveEmergScenarioModal = function(scenarioId, xPct, yPct) {
  const label = document.getElementById('em-label').value.trim();
  if (!label) { alert('시나리오 이름을 입력하세요'); return; }

  const internalValves = [...document.querySelectorAll('.em-int-valve:checked')].map(el => el.value);
  const externalValves = [...document.querySelectorAll('.em-ext-row')].map(row => ({
    name:     row.querySelector('.em-ext-name').value.trim(),
    location: row.querySelector('.em-ext-loc').value.trim(),
    note:     row.querySelector('.em-ext-note').value.trim(),
  })).filter(ev => ev.name);

  const data = {
    label,
    desc:      document.getElementById('em-desc').value.trim(),
    procedure: document.getElementById('em-procedure').value.trim(),
    internalValves,
    externalValves,
  };

  if (scenarioId) {
    const s = _emergScenarios.find(x => x.id === scenarioId);
    if (s) Object.assign(s, data);
  } else {
    _emergScenarios.push({ id: 'ES' + Date.now(), x: xPct, y: yPct, ...data });
  }

  _saveEmergScenarios();
  closeEmergModal();
  _renderEmergMarkers();
};

window.openEmergScenarioEdit = function(scenarioId) {
  closeEmergPopup();
  _openEmergScenarioModal(scenarioId, null, null);
};

window.closeEmergModal = function() {
  document.getElementById('emerg-modal').style.display = 'none';
};

// ===== 페이지 초기화 =====
window.initEmergencyPage = async function() {
  const ec = document.getElementById('emerg-edit-controls');
  if (ec) ec.style.display = window._editMode ? 'flex' : 'none';

  // 현장개요를 방문하지 않았을 경우 밸브 데이터 미리 로드
  if (window._loadCustomPipesForSite && (!window._peGetValves || !window._peGetValves('115st').length)) {
    await window._loadCustomPipesForSite('115st');
  }

  _loadEmergData(_emergSite);
  _renderEmergPipes();
};

// ESC 취소 (비상대응 페이지 활성 시)
document.addEventListener('keydown', e => {
  if (e.key !== 'Escape') return;
  if (document.getElementById('page-emergency')?.classList.contains('active')) {
    _emergCancelMode();
  }
});

// 리사이즈 시 재렌더
window.addEventListener('resize', () => {
  clearTimeout(window._emergResizeT);
  window._emergResizeT = setTimeout(() => { _renderEmergMarkers(); _renderEmergPipes(); }, 150);
});
