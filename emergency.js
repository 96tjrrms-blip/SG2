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

// ===== 사이트 전환 =====
window.switchEmergSite = function(siteId) {
  _emergSite = siteId;
  document.querySelectorAll('.emerg-tab').forEach(b =>
    b.classList.toggle('active', b.dataset.esite === siteId));
  const img = document.getElementById('emerg-map-img');
  if (img) img.src = _EMERG_IMGS[siteId] || 'map.png';
  _loadEmergData(siteId);
  _renderEmergPipes();
};

// ===== 데이터 로드/저장 =====
async function _loadEmergData(siteId) {
  try {
    const rows = await fetchAllPipeSettings();
    _emergValves    = rows[`_emerg_valves_${siteId}`]?.colors    ?? [];
    _emergScenarios = rows[`_emerg_scenarios_${siteId}`]?.colors ?? [];
  } catch {
    _emergValves = []; _emergScenarios = [];
  }
  _renderEmergMarkers();
}

function _saveEmergValves() {
  upsertPipeSettings(`_emerg_valves_${_emergSite}`, { colors: _emergValves }).catch(e => console.warn('emerg valve save:', e));
}
function _saveEmergScenarios() {
  upsertPipeSettings(`_emerg_scenarios_${_emergSite}`, { colors: _emergScenarios }).catch(e => console.warn('emerg scenario save:', e));
}

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

    if (isHL) {
      const ring = _mkSvgEl('circle');
      ring.setAttribute('r', '22');
      ring.setAttribute('fill', 'none');
      ring.setAttribute('stroke', '#ef4444');
      ring.setAttribute('stroke-width', '2.5');
      ring.setAttribute('stroke-opacity', '0.55');
      ring.setAttribute('stroke-dasharray', '5,3');
      g.appendChild(ring);
    }

    const circle = _mkSvgEl('circle');
    circle.setAttribute('r', '15');
    circle.setAttribute('fill', isHL ? '#ef4444' : '#16a34a');
    circle.setAttribute('stroke', '#fff');
    circle.setAttribute('stroke-width', isHL ? '3' : '2');
    g.appendChild(circle);

    const icon = _mkSvgEl('text');
    icon.setAttribute('x', '0'); icon.setAttribute('y', '0');
    icon.setAttribute('text-anchor', 'middle');
    icon.setAttribute('dominant-baseline', 'middle');
    icon.setAttribute('font-size', '12'); icon.setAttribute('font-weight', '900');
    icon.setAttribute('fill', '#fff'); icon.setAttribute('font-family', 'sans-serif');
    icon.textContent = 'V';
    g.appendChild(icon);

    const lbl = _mkSvgEl('text');
    lbl.setAttribute('x', '0'); lbl.setAttribute('y', '27');
    lbl.setAttribute('text-anchor', 'middle');
    lbl.setAttribute('font-size', '11'); lbl.setAttribute('font-weight', '700');
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
