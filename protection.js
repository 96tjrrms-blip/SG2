// ===== 일별 방호조치 현황 =====

const PROT_DEFAULT_MEASURES = {
  '115정거장': [
    { id: 'pm1', label: '노출길이(m)', isSum: false },
    { id: 'pm2', label: '매달기(EA)', isSum: true },
    { id: 'pm3', label: '횡진방지(EA)', isSum: true },
    { id: 'pm4', label: '경보기(EA)', isSum: true },
    { id: 'pm5', label: '지표침하계(EA)', isSum: true },
    { id: 'pm6', label: '침하관측공(EA)', isSum: true },
  ],
  '15환기구': [
    { id: 'pm5', label: '지표침하계(EA)', isSum: true },
    { id: 'pm6', label: '침하관측공(EA)', isSum: true },
  ],
  '16환기구': [
    { id: 'pm5', label: '지표침하계(EA)', isSum: true },
    { id: 'pm6', label: '침하관측공(EA)', isSum: true },
  ],
};

const _PROT_SK = { '115정거장': '115st', '15환기구': 'S015', '16환기구': 'S016' };

let _protSite = '115정거장';
let _protCache = {};

function _protKey(s) { return `_daily_prot_${_PROT_SK[s] || s}`; }

function _emptyProt(s) {
  return {
    pipes: [],
    measures: (PROT_DEFAULT_MEASURES[s] || []).map(m => ({ ...m })),
    dates: [],
    records: {}
  };
}

async function _loadProt(s) {
  if (_protCache[s]) return _protCache[s];
  try {
    const all = await fetchAllPipeSettings();
    const row = all[_protKey(s)];
    _protCache[s] = (row && row.scenarios) ? row.scenarios : _emptyProt(s);
  } catch (e) {
    console.warn('prot load:', e);
    _protCache[s] = _emptyProt(s);
  }
  return _protCache[s];
}

async function _saveProt() {
  await upsertPipeSettings(_protKey(_protSite), { scenarios: _protCache[_protSite] });
}

function _pd() {
  if (!_protCache[_protSite]) _protCache[_protSite] = _emptyProt(_protSite);
  return _protCache[_protSite];
}

function _rk(pid, mid, dt) { return `${pid}|${mid}|${dt}`; }

function _colTotal(pid, mid) {
  const d = _pd();
  let s = 0, any = false;
  d.dates.forEach(dt => {
    const v = d.records[_rk(pid, mid, dt)];
    if (v !== undefined && v !== '') { s += parseFloat(v) || 0; any = true; }
  });
  return any ? s : '-';
}

function _grandTotal(mid) {
  const d = _pd();
  let s = 0, any = false;
  d.pipes.forEach(p => d.dates.forEach(dt => {
    const v = d.records[_rk(p.id, mid, dt)];
    if (v !== undefined && v !== '') { s += parseFloat(v) || 0; any = true; }
  }));
  return any ? s : '-';
}

function _dateColSum(mid, dt) {
  const d = _pd();
  let s = 0, any = false;
  d.pipes.forEach(p => {
    const v = d.records[_rk(p.id, mid, dt)];
    if (v !== undefined && v !== '') { s += parseFloat(v) || 0; any = true; }
  });
  return any ? s : '';
}

// ===== 렌더 =====

function _renderProtTable() {
  const d = _pd(), em = !!window._editMode;
  const wrap = document.getElementById('prot-table-wrap');
  if (!wrap) return;

  const tb = document.getElementById('prot-toolbar');
  if (tb) tb.style.display = em ? 'flex' : 'none';

  const hasPipes = d.pipes.length > 0;

  if (!hasPipes && d.measures.length === 0) {
    wrap.innerHTML = `<div class="prot-empty">${em ? '항목 추가 버튼을 클릭하여 시작하세요.' : '데이터가 없습니다.'}</div>`;
    return;
  }

  let h = `<div style="overflow-x:auto"><table class="prot-table${hasPipes ? '' : ' no-pipes'}">`;

  // ── 헤더 ──
  h += '<thead><tr>';
  if (hasPipes) h += '<th class="prot-th prot-col-pipe">배관</th>';
  h += '<th class="prot-th prot-col-measure">항목</th>';
  h += '<th class="prot-th prot-col-total">합계</th>';
  d.dates.forEach(dt => {
    const lbl = dt.slice(5).replace('-', '/');
    h += `<th class="prot-th prot-col-date">${lbl}${em ? `<button class="prot-del" onclick="_delProtDate('${dt}')">✕</button>` : ''}</th>`;
  });
  h += '</tr></thead>';

  // ── 바디 ──
  h += '<tbody>';

  if (hasPipes) {
    d.pipes.forEach((pipe, pi) => {
      d.measures.forEach((m, mi) => {
        h += '<tr>';
        if (mi === 0) {
          h += `<td class="prot-td prot-col-pipe" rowspan="${d.measures.length}">
            <div class="prot-pipe-cell">
              <span class="prot-pipe-name${em ? ' prot-editable' : ''}"
                ${em ? `onclick="_editProtPipeName('${pipe.id}',this)"` : ''}>
                ${pipe.name || '<em style="color:#94a3b8;font-style:normal">이름 없음</em>'}
              </span>
              ${em ? `<button class="prot-del prot-del-pipe" onclick="_delProtPipe('${pipe.id}')">✕ 삭제</button>` : ''}
            </div>
          </td>`;
        }
        h += `<td class="prot-td prot-col-measure">
          <div style="display:flex;align-items:center;justify-content:space-between;gap:4px">
            <span>${m.label}</span>
            ${(em && pi === 0) ? `<button class="prot-del" onclick="_delProtMeasure('${m.id}')">✕</button>` : ''}
          </div>
        </td>`;
        h += `<td class="prot-td prot-col-total">${_colTotal(pipe.id, m.id)}</td>`;
        d.dates.forEach(dt => {
          const val = d.records[_rk(pipe.id, m.id, dt)] || '';
          h += `<td class="prot-cell" data-pipe="${pipe.id}" data-measure="${m.id}" data-date="${dt}" onclick="editProtCell(this)">${val}</td>`;
        });
        h += '</tr>';
      });
      if (pi < d.pipes.length - 1) {
        const cols = (hasPipes ? 1 : 0) + 1 + 1 + d.dates.length;
        h += `<tr class="prot-pipe-sep"><td colspan="${cols}"></td></tr>`;
      }
    });

    // 전체 합계 (복수 배관 시)
    if (d.pipes.length > 1 && d.measures.length > 0 && d.dates.length > 0) {
      d.measures.forEach((m, mi) => {
        h += '<tr class="prot-grand-row">';
        if (mi === 0) {
          h += `<td class="prot-td prot-col-pipe prot-grand-pipe" rowspan="${d.measures.length}">전체 합계</td>`;
        }
        h += `<td class="prot-td prot-col-measure prot-grand-measure">${m.label}</td>`;
        h += `<td class="prot-td prot-col-total prot-grand-total-cell">${_grandTotal(m.id)}</td>`;
        d.dates.forEach(dt => {
          const s = _dateColSum(m.id, dt);
          h += `<td class="prot-grand-cell">${s}</td>`;
        });
        h += '</tr>';
      });
    }
  } else {
    // 배관 없음 (15환기구 등)
    d.measures.forEach((m) => {
      h += '<tr>';
      h += `<td class="prot-td prot-col-measure">
        <div style="display:flex;align-items:center;justify-content:space-between;gap:4px">
          <span>${m.label}</span>
          ${em ? `<button class="prot-del" onclick="_delProtMeasure('${m.id}')">✕</button>` : ''}
        </div>
      </td>`;
      h += `<td class="prot-td prot-col-total">${_colTotal('site', m.id)}</td>`;
      d.dates.forEach(dt => {
        const val = d.records[_rk('site', m.id, dt)] || '';
        h += `<td class="prot-cell" data-pipe="site" data-measure="${m.id}" data-date="${dt}" onclick="editProtCell(this)">${val}</td>`;
      });
      h += '</tr>';
    });
  }

  h += '</tbody></table>';

  if (d.dates.length === 0) {
    h += `<p class="prot-hint">${em ? '📅 날짜 추가 버튼을 눌러 첫 번째 점검일을 추가하세요.' : '점검 날짜가 없습니다.'}</p>`;
  }
  h += '</div>';

  wrap.innerHTML = h;
  _renderRegSection();
}

// ===== 셀 편집 =====

window.editProtCell = function(td) {
  if (!window._editMode || td.querySelector('input')) return;
  const { pipe, measure, date } = td.dataset;
  const cur = td.textContent.trim();
  td.innerHTML = `<input type="text" class="prot-cell-input" value="${cur}">`;
  const inp = td.querySelector('input');
  inp.focus(); inp.select();

  const commit = async () => {
    const val = inp.value.trim();
    const d = _pd(), key = _rk(pipe, measure, date);
    if (val === '') delete d.records[key]; else d.records[key] = val;
    await _saveProt();
    _renderProtTable();
  };
  inp.addEventListener('blur', commit);
  inp.addEventListener('keydown', e => {
    if (e.key === 'Enter') { e.preventDefault(); inp.blur(); }
    if (e.key === 'Escape') _renderProtTable();
  });
};

window._editProtPipeName = function(pipeId, el) {
  if (el.querySelector('input')) return;
  const cur = el.textContent.trim();
  el.innerHTML = `<input type="text" value="${cur}"
    style="width:90px;border:1px solid #0d2b5e;border-radius:3px;padding:2px 4px;font-size:12px;text-align:center;font-family:inherit">`;
  const inp = el.querySelector('input');
  inp.focus(); inp.select();
  const commit = async () => {
    const d = _pd(), p = d.pipes.find(x => x.id === pipeId);
    if (p) p.name = inp.value.trim();
    await _saveProt();
    _renderProtTable();
  };
  inp.addEventListener('blur', commit);
  inp.addEventListener('keydown', e => { if (e.key === 'Enter') inp.blur(); if (e.key === 'Escape') _renderProtTable(); });
};

// ===== CRUD =====

window.addProtDate = function() {
  const today = new Date().toISOString().split('T')[0];
  const val = prompt('날짜 입력 (YYYY-MM-DD):', today);
  if (!val || !val.match(/^\d{4}-\d{2}-\d{2}$/)) return;
  const d = _pd();
  if (d.dates.includes(val)) { alert('이미 추가된 날짜입니다.'); return; }
  d.dates.push(val); d.dates.sort();
  _saveProt().then(() => _renderProtTable());
};

window.addProtPipe = function() {
  const name = prompt('배관명을 입력하세요\n(예: MB 300A, 인입관-1)');
  if (name === null) return;
  _pd().pipes.push({ id: `p${Date.now()}`, name: name.trim() });
  _saveProt().then(() => _renderProtTable());
};

window.addProtMeasure = function() {
  const label = prompt('항목명을 입력하세요\n(예: 외부손상점검(EA))');
  if (!label) return;
  const isSum = confirm('이 항목의 합계를 계산합니까?\n\n확인: 합계 계산 (EA 등)\n취소: 최근값 표시 (노출길이 등)');
  _pd().measures.push({ id: `pm${Date.now()}`, label: label.trim(), isSum });
  _saveProt().then(() => _renderProtTable());
};

window._delProtDate = function(date) {
  if (!confirm(`"${date}" 날짜 열을 삭제하시겠습니까?`)) return;
  const d = _pd();
  d.dates = d.dates.filter(x => x !== date);
  Object.keys(d.records).forEach(k => { if (k.endsWith(`|${date}`)) delete d.records[k]; });
  _saveProt().then(() => _renderProtTable());
};

window._delProtPipe = function(pipeId) {
  if (!confirm('이 배관과 관련 데이터를 모두 삭제하시겠습니까?')) return;
  const d = _pd();
  d.pipes = d.pipes.filter(p => p.id !== pipeId);
  Object.keys(d.records).forEach(k => { if (k.startsWith(`${pipeId}|`)) delete d.records[k]; });
  _saveProt().then(() => _renderProtTable());
};

window._delProtMeasure = function(mid) {
  if (!confirm('이 항목과 관련 데이터를 모두 삭제하시겠습니까?')) return;
  const d = _pd();
  d.measures = d.measures.filter(m => m.id !== mid);
  Object.keys(d.records).forEach(k => { if (k.split('|')[1] === mid) delete d.records[k]; });
  _saveProt().then(() => _renderProtTable());
};

// ===== 사이트 전환 =====

window.switchProtSite = async function(s) {
  _protSite = s;
  document.querySelectorAll('.prot-site-tab').forEach(t =>
    t.classList.toggle('active', t.dataset.site === s)
  );
  if (!_protCache[s]) await _loadProt(s);
  _renderProtTable();
};

// ===== 초기화 =====

window.initProtectionPage = async function() {
  if (!_protCache[_protSite]) await _loadProt(_protSite);
  _renderProtTable();
};

// ===== 반송공원 지역정압기 현장점검 (16환기구 전용) =====

// ⚠️ 수기 판독 — 불확실한 값 있음. 불러온 후 원본과 대조 필요.
const _REG_HISTORY = [
  {id:'h01',date:'2025-04-21',pt1_1:'77cm',pt1_2:'0.5cm',pt4_1:'79cm',pt4_2:'0.9cm'},
  {id:'h02',date:'2025-04-28',pt1_1:'78cm',pt1_2:'0.5cm',pt4_1:'79cm',pt4_2:'0.7cm'},
  {id:'h03',date:'2025-05-07',pt1_1:'77cm',pt1_2:'0.5cm',pt4_1:'79cm',pt4_2:'0.7cm'},
  {id:'h04',date:'2025-05-13',pt1_1:'77cm',pt1_2:'0.5cm',pt4_1:'79cm',pt4_2:'0.7cm'},
  {id:'h05',date:'2025-05-20',pt1_1:'78cm',pt1_2:'0.4cm',pt4_1:'79cm',pt4_2:'0.7cm'},
  {id:'h06',date:'2025-05-26',pt1_1:'77cm',pt1_2:'0.4cm',pt4_1:'79cm',pt4_2:'0.7cm'},
  {id:'h07',date:'2025-06-02',pt1_1:'78cm',pt1_2:'0.5cm',pt4_1:'77cm',pt4_2:'0.7cm'},
  {id:'h08',date:'2025-06-09',pt1_1:'78cm',pt1_2:'0.5cm',pt4_1:'80cm',pt4_2:'0.8cm'},
  {id:'h09',date:'2025-06-16',pt1_1:'78cm',pt1_2:'0.4cm',pt4_1:'80cm',pt4_2:'0.8cm'},
  {id:'h10',date:'2025-06-23',pt1_1:'78cm',pt1_2:'0.4cm',pt4_1:'80cm',pt4_2:'0.8cm'},
  {id:'h11',date:'2025-06-30',pt1_1:'78cm',pt1_2:'0.5cm',pt4_1:'80cm',pt4_2:'0.8cm'},
  {id:'h12',date:'2025-07-07',pt1_1:'78cm',pt1_2:'0.5cm',pt4_1:'80cm',pt4_2:'0.8cm'},
  {id:'h13',date:'2025-07-14',pt1_1:'79cm',pt1_2:'0.5cm',pt4_1:'80cm',pt4_2:'0.8cm'},
  {id:'h14',date:'2025-07-21',pt1_1:'79cm',pt1_2:'0.5cm',pt4_1:'80cm',pt4_2:'0.8cm'},
  {id:'h15',date:'2025-07-28',pt1_1:'78cm',pt1_2:'0.5cm',pt4_1:'80cm',pt4_2:'0.8cm'},
  {id:'h16',date:'2025-08-04',pt1_1:'78cm',pt1_2:'0.5cm',pt4_1:'80cm',pt4_2:'0.8cm'},
  {id:'h17',date:'2025-08-11',pt1_1:'78cm',pt1_2:'0.5cm',pt4_1:'80cm',pt4_2:'0.8cm'},
  {id:'h18',date:'2025-08-18',pt1_1:'79cm',pt1_2:'0.5cm',pt4_1:'80cm',pt4_2:'0.8cm'},
  {id:'h19',date:'2025-08-25',pt1_1:'78cm',pt1_2:'0.5cm',pt4_1:'80cm',pt4_2:'0.8cm'},
  {id:'h20',date:'2025-09-01',pt1_1:'78cm',pt1_2:'0.5cm',pt4_1:'80cm',pt4_2:'0.8cm'},
  {id:'h21',date:'2025-09-15',pt1_1:'78cm',pt1_2:'0.5cm',pt4_1:'80cm',pt4_2:'0.8cm'},
  {id:'h22',date:'2025-09-22',pt1_1:'78cm',pt1_2:'0.5cm',pt4_1:'80cm',pt4_2:'0.8cm'},
  {id:'h23',date:'2025-09-29',pt1_1:'79cm',pt1_2:'0.5cm',pt4_1:'80cm',pt4_2:'0.8cm'},
  {id:'h24',date:'2025-10-12',pt1_1:'79cm',pt1_2:'0.5cm',pt4_1:'80cm',pt4_2:'0.8cm'},
  {id:'h25',date:'2025-10-20',pt1_1:'78cm',pt1_2:'0.5cm',pt4_1:'80cm',pt4_2:'0.8cm'},
  {id:'h26',date:'2025-10-27',pt1_1:'78cm',pt1_2:'0.5cm',pt4_1:'80cm',pt4_2:'0.7cm'},
  {id:'h27',date:'2025-11-03',pt1_1:'79cm',pt1_2:'0.5cm',pt4_1:'80cm',pt4_2:'0.9cm'},
  {id:'h28',date:'2025-11-10',pt1_1:'78cm',pt1_2:'0.5cm',pt4_1:'78cm',pt4_2:'0.8cm'},
  {id:'h29',date:'2025-11-17',pt1_1:'78cm',pt1_2:'0.5cm',pt4_1:'78cm',pt4_2:'0.8cm'},
  {id:'h30',date:'2025-11-24',pt1_1:'78cm',pt1_2:'0.5cm',pt4_1:'78cm',pt4_2:'0.8cm'},
  {id:'h31',date:'2025-12-01',pt1_1:'77cm',pt1_2:'0.3cm',pt4_1:'80cm',pt4_2:'0.8cm'},
  {id:'h32',date:'2025-12-15',pt1_1:'78cm',pt1_2:'0.3cm',pt4_1:'80cm',pt4_2:'0.7cm'},
  {id:'h33',date:'2025-12-23',pt1_1:'78cm',pt1_2:'0.4cm',pt4_1:'78cm',pt4_2:'0.7cm'},
  {id:'h34',date:'2025-12-29',pt1_1:'78cm',pt1_2:'0.4cm',pt4_1:'79cm',pt4_2:'0.7cm'},
  {id:'h35',date:'2026-01-05',pt1_1:'79cm',pt1_2:'0.4cm',pt4_1:'80cm',pt4_2:'0.8cm'},
  {id:'h36',date:'2026-01-12',pt1_1:'77cm',pt1_2:'0.3cm',pt4_1:'80cm',pt4_2:'0.7cm'},
  {id:'h37',date:'2026-01-19',pt1_1:'78cm',pt1_2:'0.2cm',pt4_1:'79cm',pt4_2:'0.6cm'},
  {id:'h38',date:'2026-01-26',pt1_1:'78cm',pt1_2:'0.3cm',pt4_1:'79cm',pt4_2:'0.8cm'},
  {id:'h39',date:'2026-02-02',pt1_1:'79cm',pt1_2:'0.5cm',pt4_1:'79cm',pt4_2:'0.8cm'},
  {id:'h40',date:'2026-02-09',pt1_1:'79cm',pt1_2:'0.4cm',pt4_1:'79cm',pt4_2:'0.9cm'},
  {id:'h41',date:'2026-02-19',pt1_1:'77cm',pt1_2:'0.3cm',pt4_1:'79cm',pt4_2:'0.9cm'},
  {id:'h42',date:'2026-02-22',pt1_1:'79cm',pt1_2:'0.3cm',pt4_1:'79cm',pt4_2:'0.9cm'},
  {id:'h43',date:'2026-03-03',pt1_1:'79cm',pt1_2:'0.3cm',pt4_1:'79cm',pt4_2:'0.8cm'},
  {id:'h44',date:'2026-03-11',pt1_1:'78cm',pt1_2:'0.4cm',pt4_1:'78cm',pt4_2:'0.8cm'},
  {id:'h45',date:'2026-03-16',pt1_1:'78cm',pt1_2:'0.4cm',pt4_1:'79cm',pt4_2:'0.8cm'},
  {id:'h46',date:'2026-03-30',pt1_1:'79cm',pt1_2:'0.4cm',pt4_1:'80cm',pt4_2:'0.7cm'},
  {id:'h47',date:'2026-04-06',pt1_1:'78cm',pt1_2:'0.4cm',pt4_1:'80cm',pt4_2:'0.8cm'},
  {id:'h48',date:'2026-04-13',pt1_1:'80cm',pt1_2:'0.4cm',pt4_1:'80cm',pt4_2:'0.7cm'},
  {id:'h49',date:'2026-04-20',pt1_1:'80cm',pt1_2:'0.4cm',pt4_1:'80cm',pt4_2:'0.8cm'},
  {id:'h50',date:'2026-04-30',pt1_1:'80cm',pt1_2:'0.4cm',pt4_1:'80cm',pt4_2:'0.7cm'},
  {id:'h51',date:'2026-05-06',pt1_1:'80cm',pt1_2:'0.4cm',pt4_1:'80cm',pt4_2:'0.6cm'},
  {id:'h52',date:'2026-05-11',pt1_1:'80cm',pt1_2:'0.4cm',pt4_1:'80cm',pt4_2:'0.6cm'},
  {id:'h53',date:'2026-05-18',pt1_1:'78cm',pt1_2:'0.7cm',pt4_1:'79cm',pt4_2:'0.8cm'},
  {id:'h54',date:'2026-05-26',pt1_1:'79cm',pt1_2:'0.3cm',pt4_1:'79cm',pt4_2:'0.7cm'},
  {id:'h55',date:'2026-06-02',pt1_1:'79cm',pt1_2:'0.3cm',pt4_1:'79cm',pt4_2:'0.7cm'},
  {id:'h56',date:'2026-06-08',pt1_1:'79cm',pt1_2:'0.3cm',pt4_1:'79cm',pt4_2:'0.9cm'},
];

const _REG_KEY = '_regulator_S016';
const _REG_PER_PAGE = 20;
let _regData = null;
let _regPage = 0;

async function _loadReg() {
  if (_regData) return _regData;
  try {
    const all = await fetchAllPipeSettings();
    const row = all[_REG_KEY];
    _regData = (row && row.scenarios) ? row.scenarios : { entries: [] };
  } catch {
    _regData = { entries: [] };
  }
  return _regData;
}

async function _saveReg() {
  await upsertPipeSettings(_REG_KEY, { scenarios: _regData });
}

function _renderRegSection() {
  const section = document.getElementById('reg-section');
  const addBtn = document.getElementById('reg-add-btn');
  const is16 = _protSite === '16환기구';
  if (section) section.style.display = is16 ? '' : 'none';
  if (addBtn) addBtn.style.display = (is16 && window._editMode) ? '' : 'none';
  if (!is16) return;
  if (!_regData) {
    _loadReg().then(() => _renderRegTable());
    return;
  }
  _renderRegTable();
}

function _regPager(page, total, label) {
  const totalPages = Math.ceil(total / _REG_PER_PAGE);
  if (totalPages <= 1) return '';
  return `<div class="reg-pager">
    <button class="reg-pg-btn" onclick="_regPageMove(-1)" ${page === 0 ? 'disabled' : ''}>◀</button>
    <span class="reg-pg-label">${page + 1} / ${totalPages} 페이지 (${label})</span>
    <button class="reg-pg-btn" onclick="_regPageMove(1)" ${page >= totalPages - 1 ? 'disabled' : ''}>▶</button>
  </div>`;
}

function _renderRegTable() {
  const wrap = document.getElementById('reg-table-wrap');
  if (!wrap || !_regData) return;
  const em = !!window._editMode;

  const allEntries = [...(_regData.entries || [])].sort((a, b) =>
    b.date.localeCompare(a.date)
  );
  const total = allEntries.length;

  if (total === 0) {
    wrap.innerHTML = `<div class="prot-empty">
      ${em
        ? `<div style="display:flex;flex-direction:column;align-items:center;gap:10px">
            <div>측정 데이터가 없습니다.</div>
            <button class="zone-btn" onclick="importRegHistory()" style="font-size:13px">📋 과거 데이터 불러오기 (2025.04 ~ 2026.06)</button>
           </div>`
        : '측정 데이터가 없습니다.'}
    </div>`;
    return;
  }

  const totalPages = Math.ceil(total / _REG_PER_PAGE);
  _regPage = Math.max(0, Math.min(_regPage, totalPages - 1));
  const pageEntries = allEntries.slice(_regPage * _REG_PER_PAGE, (_regPage + 1) * _REG_PER_PAGE);
  const countLabel = `전체 ${total}건`;

  const pager = _regPager(_regPage, total, countLabel);

  let h = pager;
  h += '<div style="overflow-x:auto"><table class="prot-table reg-table">';
  h += `<thead><tr>
    <th class="prot-th reg-th-date">날짜</th>
    <th class="prot-th reg-th-val">1번 ①<br><small style="font-weight:400;opacity:.85">배관→지면</small></th>
    <th class="prot-th reg-th-val">1번 ②<br><small style="font-weight:400;opacity:.85">배관→서포트</small></th>
    <th class="prot-th reg-th-val">4번 ①<br><small style="font-weight:400;opacity:.85">배관→지면</small></th>
    <th class="prot-th reg-th-val">4번 ②<br><small style="font-weight:400;opacity:.85">배관→서포트</small></th>
    ${em ? '<th class="prot-th" style="width:36px"></th>' : ''}
  </tr></thead><tbody>`;

  pageEntries.forEach(e => {
    const disp = e.date.slice(5).replace('-', '/');
    h += `<tr>
      <td class="reg-td reg-td-date" data-id="${e.id}" data-field="date"
        onclick="${em ? `editRegDate('${e.id}',this)` : ''}"
        style="${em ? 'cursor:pointer' : ''}">
        ${disp}
      </td>
      <td class="reg-cell" data-id="${e.id}" data-field="pt1_1" onclick="editRegCell(this)">${e.pt1_1 || ''}</td>
      <td class="reg-cell" data-id="${e.id}" data-field="pt1_2" onclick="editRegCell(this)">${e.pt1_2 || ''}</td>
      <td class="reg-cell" data-id="${e.id}" data-field="pt4_1" onclick="editRegCell(this)">${e.pt4_1 || ''}</td>
      <td class="reg-cell" data-id="${e.id}" data-field="pt4_2" onclick="editRegCell(this)">${e.pt4_2 || ''}</td>
      ${em ? `<td class="reg-td" style="text-align:center"><button class="prot-del" onclick="_delRegEntry('${e.id}')">✕</button></td>` : ''}
    </tr>`;
  });

  h += '</tbody></table></div>';
  h += pager;
  wrap.innerHTML = h;
}

window._regPageMove = function(dir) {
  const total = (_regData && _regData.entries) ? _regData.entries.length : 0;
  const totalPages = Math.ceil(total / _REG_PER_PAGE);
  _regPage = Math.max(0, Math.min(_regPage + dir, totalPages - 1));
  _renderRegTable();
};

window.importRegHistory = function() {
  if (!window._editMode) return;
  if (!confirm(
    `수기 기록(2025.04~2026.06) 56건을 불러옵니다.\n\n⚠️ 주의: 손글씨 판독이라 일부 값이 부정확할 수 있습니다.\n불러온 후 원본 자료와 대조하여 확인하세요.\n\n계속하시겠습니까?`
  )) return;
  if (!_regData) _regData = { entries: [] };
  const existingDates = new Set(_regData.entries.map(e => e.date));
  const toAdd = _REG_HISTORY.filter(h => !existingDates.has(h.date));
  _regData.entries = [..._regData.entries, ...toAdd];
  _regPage = 0;
  _saveReg().then(() => _renderRegTable());
};

window.addRegEntry = function() {
  const today = new Date().toISOString().split('T')[0];
  const date = prompt('측정 날짜 (YYYY-MM-DD):', today);
  if (!date || !date.match(/^\d{4}-\d{2}-\d{2}$/)) return;
  if (!_regData) _regData = { entries: [] };
  _regData.entries.push({ id: `e${Date.now()}`, date, pt1_1: '', pt1_2: '', pt4_1: '', pt4_2: '' });
  _regPage = 0;
  _saveReg().then(() => _renderRegTable());
};

window.editRegCell = function(td) {
  if (!window._editMode || td.querySelector('input')) return;
  const { id, field } = td.dataset;
  const cur = td.textContent.trim();
  td.innerHTML = `<input type="text" class="prot-cell-input" value="${cur}" placeholder="예: 79cm">`;
  const inp = td.querySelector('input');
  inp.focus(); inp.select();
  const done = async () => {
    const val = inp.value.trim();
    const entry = _regData.entries.find(e => e.id === id);
    if (entry) entry[field] = val;
    await _saveReg();
    _renderRegTable();
  };
  inp.addEventListener('blur', done);
  inp.addEventListener('keydown', e => {
    if (e.key === 'Enter') { e.preventDefault(); inp.blur(); }
    if (e.key === 'Escape') _renderRegTable();
  });
};

window.editRegDate = function(id, td) {
  if (!window._editMode || td.querySelector('input')) return;
  const entry = _regData.entries.find(e => e.id === id);
  if (!entry) return;
  const cur = entry.date;
  td.innerHTML = `<input type="date" class="prot-cell-input" value="${cur}" style="width:120px">`;
  const inp = td.querySelector('input');
  inp.focus();
  const done = async () => {
    const val = inp.value.trim();
    if (val && val.match(/^\d{4}-\d{2}-\d{2}$/)) entry.date = val;
    await _saveReg();
    _renderRegTable();
  };
  inp.addEventListener('blur', done);
  inp.addEventListener('keydown', e => { if (e.key === 'Enter') inp.blur(); if (e.key === 'Escape') _renderRegTable(); });
};

window._delRegEntry = function(id) {
  if (!confirm('이 측정 행을 삭제하시겠습니까?')) return;
  _regData.entries = _regData.entries.filter(e => e.id !== id);
  _saveReg().then(() => _renderRegTable());
};
