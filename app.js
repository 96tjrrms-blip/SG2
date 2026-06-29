// ===== 상태 관리 =====
let currentSite = '115정거장';
let currentItemId = null;
let siteMap = {};
let fieldCache = {};

// ===== 대시보드 현장 선택 =====
const DASH_SITES = [
  { id: 'S015',  label: '#S-015 환기구', mapImg: null, sitePhoto: 'photo_s015.jpg.jpg' },
  { id: '115st', label: '115 정거장',   mapImg: 'map.png',       sitePhoto: null        },
  { id: 'S016',  label: '#S-016 환기구', mapImg: null, sitePhoto: 'photo_s016.jpg.JPG' },
];
let currentDashSite = '115st';

// 115 정거장 전용 ON/OFF 버튼 (파킹/드론은 모든 현장 공통)
const _115_ONOFF = ['dir-toggle-btn', 'boring-toggle-btn', 'drone-toggle-btn'];
// 115 정거장 전용 편집 버튼
const _115_EDIT  = ['boring-edit-btn', 'boring-marker-sub'];

function _updateDashControls() {
  const is115 = currentDashSite === '115st';

  _115_ONOFF.forEach(id => {
    const el = document.getElementById(id);
    if (el) el.style.display = is115 ? '' : 'none';
  });
  _115_EDIT.forEach(id => {
    const el = document.getElementById(id);
    if (el) el.style.display = is115 ? '' : 'none';
  });
  const adjustBtn = document.querySelector('.zone-btn[onclick="toggleBoringAdjust()"]');
  if (adjustBtn) adjustBtn.style.display = is115 ? '' : 'none';

  // pipe SVG (배관망도) - 115정거장만
  const mapSvg = document.getElementById('map-svg');
  if (mapSvg) mapSvg.style.display = is115 ? '' : 'none';
}

window.switchDashSite = function(siteId) {
  currentDashSite = siteId;
  window.currentDashSite = siteId;

  document.querySelectorAll('.dash-site-tab').forEach(b => {
    b.classList.toggle('active', b.dataset.site === siteId);
  });

  if (_droneViewOpen) toggleDroneView();

  const site = DASH_SITES.find(s => s.id === siteId);

  if (site.sitePhoto) {
    // 환기구: map-container 유지, img src만 교체, pipe SVG 숨김
    const mapImg   = document.getElementById('map-img');
    const mapNoImg = document.getElementById('map-no-image');
    mapImg.src = site.sitePhoto;
    mapImg.style.display    = 'block';
    mapNoImg.style.display  = 'none';
    document.getElementById('map-container').style.display = '';
    if (typeof mapZoomReset === 'function') mapZoomReset();
    // 천공 마커 제거 (boring.js에서도 체크하지만 즉시 제거)
    document.querySelectorAll('#overlay-svg .boring-marker').forEach(el => el.remove());
  } else {
    // 115정거장: 정식 지도 로드
    if (typeof switchDashMap === 'function') switchDashMap(site.mapImg);
  }

  _updateDashControls();
  initDroneView();
};

// ===== 드론사진 =====
let _dronePhotos = [];
let _droneViewOpen = false;

async function initDroneView() {
  try { _dronePhotos = await listDronePhotos(currentDashSite); } catch(e) { _dronePhotos = []; }
  if (_droneViewOpen) _renderDroneList();
}

function _renderDroneList() {
  const list = document.getElementById('drone-list');
  const label = document.getElementById('drone-count-label');
  if (!list) return;
  if (label) label.textContent = _dronePhotos.length ? `${_dronePhotos.length}장` : '';
  if (!_dronePhotos.length) {
    list.innerHTML = '<div style="text-align:center;color:#9ca3af;padding:32px 0;font-size:13px">드론사진이 없습니다<br><small>위 + 버튼으로 추가하세요</small></div>';
    return;
  }
  list.innerHTML = _dronePhotos.map(p => {
    const safe = p.url.replace(/'/g, '%27');
    const safePath = p.path.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
    return `<div style="position:relative;margin-bottom:10px;border-radius:6px;overflow:hidden;line-height:0">
      <img src="${p.url}" onclick="openLightbox('${safe}')"
        style="width:100%;display:block;cursor:zoom-in;border-radius:6px">
      <button onclick="deleteDronePhoto('${safePath}')"
        style="position:absolute;top:8px;right:8px;width:28px;height:28px;border-radius:50%;border:none;background:rgba(239,68,68,0.85);color:#fff;font-size:14px;cursor:pointer;line-height:1">✕</button>
    </div>`;
  }).join('');
}

window.toggleDroneView = function() {
  _droneViewOpen = !_droneViewOpen;
  const btn = document.getElementById('drone-toggle-btn');
  const mapCont = document.getElementById('map-container');
  const mapNoImg = document.getElementById('map-no-image');
  const droneView = document.getElementById('drone-view');
  if (_droneViewOpen) {
    mapCont.style.display = 'none';
    mapNoImg.style.display = 'none';
    droneView.style.display = '';
    if (btn) { btn.style.background = '#0d2b5e'; btn.style.color = '#fff'; btn.style.borderColor = '#0d2b5e'; }
    _renderDroneList();
  } else {
    mapCont.style.display = '';
    mapNoImg.style.display = '';
    droneView.style.display = 'none';
    if (btn) { btn.style.background = ''; btn.style.color = ''; btn.style.borderColor = ''; }
  }
};

window.handleDroneUpload = async function(input) {
  const files = Array.from(input.files);
  if (!files.length) return;
  const addBtn = document.querySelector('#drone-view button');
  if (addBtn) addBtn.textContent = '업로드 중...';
  try {
    for (const f of files) await uploadDronePhoto(f, currentDashSite);
    _dronePhotos = await listDronePhotos(currentDashSite);
    _renderDroneList();
  } catch(e) { alert('업로드 실패: ' + e.message); }
  finally { if (addBtn) addBtn.textContent = '+ 사진 추가'; input.value = ''; }
};

window.deleteDronePhoto = async function(path) {
  if (!confirm('이 드론사진을 삭제할까요?')) return;
  try {
    await deleteDronePhotoStorage(path);
    _dronePhotos = await listDronePhotos(currentDashSite);
    _renderDroneList();
  } catch(e) { alert('삭제 실패: ' + e.message); }
};

// ===== 초기화 =====
document.addEventListener('DOMContentLoaded', async () => {
  siteMap = await getSiteMap();
  navigate('dashboard');
});

// ===== 네비게이션 =====
function navigate(page) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  document.getElementById('page-' + page).classList.add('active');
  document.querySelector(`[data-page="${page}"]`).classList.add('active');

  if (page === 'dashboard') renderDashboard();
  if (page === 'field') renderField();
  if (page === 'alarm') renderAlarm();
  if (page === 'regulation') renderRegulation();
}

// ===== 캐시 로드 =====
async function loadSiteItems(siteName) {
  const siteId = siteMap[siteName];
  if (!siteId) return [];
  if (!fieldCache[siteId]) {
    fieldCache[siteId] = await fetchFieldItems(siteId);
  }
  return fieldCache[siteId];
}

function invalidateCache(siteId) {
  delete fieldCache[siteId];
}

// ===== 진행률 계산 =====
function calcProgressFromRow(row) {
  const items = (row.checklist_items || []).filter(i => i.type !== 'na_marker');
  if (items.length === 0) return 0;
  const done = items.filter(i => i.checked).length;
  return Math.round((done / items.length) * 100);
}

async function calcSiteProgressFromCache(siteName) {
  const items = await loadSiteItems(siteName);
  if (items.length === 0) return { pct: 0, done: 0, total: 0, delay: 0 };
  let totalPct = 0, delayCount = 0;
  const today = new Date();
  items.forEach(row => {
    const pct = calcProgressFromRow(row);
    totalPct += pct;
    if (row.due_date && new Date(row.due_date) < today && pct < 100) delayCount++;
  });
  return {
    pct: Math.round(totalPct / items.length),
    done: items.filter(r => calcProgressFromRow(r) === 100).length,
    total: items.length,
    delay: delayCount
  };
}

// ===== 대시보드 =====
async function renderDashboard() {
  initMap();
  initDroneView();
  _updateDashControls();
}

async function renderSmsLog() {
  const logs = await fetchSmsLogs(3);
  const el = document.getElementById('sms-list');
  if (!logs || logs.length === 0) {
    el.innerHTML = '<div style="text-align:center;color:#9ca3af;padding:20px;font-size:13px">발송 내역이 없습니다.</div>';
  } else {
    el.innerHTML = logs.map(log => `
      <div class="sms-item">
        <div>
          <div style="font-weight:500">${log.field_items?.item_name || '-'} — ${log.message}</div>
        </div>
        <div class="sms-date">${new Date(log.sent_at).toLocaleDateString('ko-KR')}</div>
      </div>
    `).join('');
  }
}

// ===== 현장관리 =====
async function renderField() {
  const siteId = siteMap[currentSite];
  invalidateCache(siteId);
  const items = await loadSiteItems(currentSite);
  const tbody = document.getElementById('field-tbody');

  tbody.innerHTML = items.map(row => {
    const pct = calcProgressFromRow(row);
    const isDelay = row.due_date && new Date(row.due_date) < new Date() && pct < 100;

    const procItems = (row.checklist_items || []).filter(i => i.type === 'process');
    const safeItems = (row.checklist_items || []).filter(i => i.type === 'safety');
    const procDone = procItems.filter(i => i.checked).length;
    const safeDone = safeItems.filter(i => i.checked).length;

    let status = '미착공', statusClass = 'status-wait';
    if (pct === 100) { status = '완료'; statusClass = 'status-done'; }
    else if (isDelay) { status = '지연'; statusClass = 'status-delay'; }
    else if (pct > 0) { status = '진행중'; statusClass = 'status-progress'; }

    const tagClass = row.category === '인입관' ? 'tag-inflow' : 'tag-valve';
    const barColor = isDelay ? '#dc2626' : pct > 0 ? '#0d2b5e' : '#e5e7eb';

    return `
      <tr class="${isDelay ? 'delay' : ''} ${currentItemId === row.id ? 'selected' : ''}"
          onclick="selectItem(${row.id})">
        <td style="font-weight:500">${row.item_name}</td>
        <td><span class="tag ${tagClass}">${row.category || '-'}</span></td>
        <td style="color:#6b7280;font-size:12px">${row.spec || '-'}</td>
        <td style="font-size:12px;color:${isDelay ? '#dc2626' : '#374151'}">${row.due_date || '-'}</td>
        <td><span class="${statusClass}">${status}</span></td>
        <td>
          <span class="mini-bar"><span class="mini-fill" style="width:${procItems.length > 0 ? Math.round(procDone/procItems.length*100) : 0}%;background:${barColor}"></span></span>
          <span style="font-size:11px;color:#6b7280">${procDone}/${procItems.length}</span>
        </td>
        <td>
          <span class="mini-bar"><span class="mini-fill" style="width:${safeItems.length > 0 ? Math.round(safeDone/safeItems.length*100) : 0}%;background:${barColor}"></span></span>
          <span style="font-size:11px;color:#6b7280">${safeDone}/${safeItems.length}</span>
        </td>
      </tr>
    `;
  }).join('');
}

async function selectItem(fieldItemId) {
  currentItemId = fieldItemId;
  await renderField();
  await renderChecklist(fieldItemId);
}

async function renderChecklist(fieldItemId) {
  const panel = document.getElementById('checklist-panel');
  panel.classList.add('open');

  const row = await fetchFieldItem(fieldItemId);

  // 신규 항목이면 기본 체크리스트 시딩
  if (!row.checklist_items || row.checklist_items.length === 0) {
    await seedChecklistItems(fieldItemId);
    const refreshed = await fetchFieldItem(fieldItemId);
    row.checklist_items = refreshed.checklist_items;
  }

  document.getElementById('panel-title').textContent =
    `${row.item_name} — ${row.spec || ''} (${row.category || ''})`;
  document.getElementById('panel-due').value = row.due_date || '';
  document.getElementById('panel-memo').value = row.memo || '';

  const procItems = row.checklist_items.filter(i => i.type === 'process');
  const safeItems = row.checklist_items.filter(i => i.type === 'safety');
  const custItems = row.checklist_items.filter(i => i.type === 'custom');

  document.getElementById('process-list').innerHTML = procItems.map(it => `
    <div class="cl-item ${it.checked ? 'checked' : ''}" id="proc-${it.id}">
      <input type="checkbox" ${it.checked ? 'checked' : ''}
        onchange="toggleCheck(${it.id}, this.checked)">
      <span class="cl-label">${it.content}</span>
    </div>
  `).join('');

  document.getElementById('safety-list').innerHTML = safeItems.map(it => `
    <div class="cl-item ${it.checked ? 'checked' : ''}" id="safe-${it.id}">
      <input type="checkbox" ${it.checked ? 'checked' : ''}
        onchange="toggleCheck(${it.id}, this.checked)">
      <span class="cl-label">${it.content}</span>
    </div>
  `).join('');

  document.getElementById('custom-list').innerHTML = custItems.map(it => `
    <div class="cl-item ${it.checked ? 'checked' : ''}" id="cust-${it.id}">
      <input type="checkbox" ${it.checked ? 'checked' : ''}
        onchange="toggleCheck(${it.id}, this.checked)">
      <span class="cl-label">${it.content}</span>
      <button class="cl-remove" onclick="removeCustomItem(${it.id})">✕</button>
    </div>
  `).join('');
}

async function toggleCheck(checklistItemId, checked) {
  await updateChecklistItem(checklistItemId, checked);
  const siteId = siteMap[currentSite];
  invalidateCache(siteId);
}

async function addCustomItem() {
  const input = document.getElementById('custom-input');
  const content = input.value.trim();
  if (!content || !currentItemId) return;
  await insertChecklistItem(currentItemId, 'custom', content);
  input.value = '';
  await renderChecklist(currentItemId);
  const siteId = siteMap[currentSite];
  invalidateCache(siteId);
}

async function removeCustomItem(checklistItemId) {
  await deleteChecklistItem(checklistItemId);
  await renderChecklist(currentItemId);
  const siteId = siteMap[currentSite];
  invalidateCache(siteId);
}

async function savePanel() {
  if (!currentItemId) return;
  const dueDate = document.getElementById('panel-due').value;
  const memo = document.getElementById('panel-memo').value;

  // 진행률 기반 status 자동 갱신
  const row = await fetchFieldItem(currentItemId);
  const pct = calcProgressFromRow(row);
  let status = '대기';
  if (pct === 100) status = '완료';
  else if (dueDate && new Date(dueDate) < new Date() && pct < 100) status = '지연';
  else if (pct > 0) status = '진행중';

  await upsertFieldItem({
    id: currentItemId,
    due_date: dueDate || null,
    memo,
    status,
    process_checked: row.checklist_items.filter(i => i.type === 'process' && i.checked).length > 0,
    safety_checked: row.checklist_items.filter(i => i.type === 'safety' && i.checked).length > 0,
  });

  const siteId = siteMap[currentSite];
  invalidateCache(siteId);
  await renderField();
  await renderDashboard();
  alert('저장되었습니다.');
}

function closePanel() {
  document.getElementById('checklist-panel').classList.remove('open');
  currentItemId = null;
  renderField();
}

async function sendSMS() {
  if (!currentItemId) return;
  const row = await fetchFieldItem(currentItemId);
  const pct = calcProgressFromRow(row);
  const msg = `[삼천리 도시가스] 인동선 11공구 ${currentSite} ${row.item_name}(${row.category}) 안전이행 확인 요청. 현재 진행률 ${pct}%. 미조치 항목 확인 및 조치 부탁드립니다.`;
  const phone = '01000000000';
  window.location.href = `sms:${phone}?body=${encodeURIComponent(msg)}`;
  await insertSmsLog(currentItemId, phone, msg);
  await renderSmsLog();
}

async function switchSite(site) {
  currentSite = site;
  currentItemId = null;
  document.getElementById('checklist-panel').classList.remove('open');
  document.querySelectorAll('.site-tab').forEach(t => t.classList.remove('active'));
  document.querySelector(`[data-site="${site}"]`).classList.add('active');
  await renderField();
}

// ===== 알람 =====
async function getDelayItems() {
  const delays = [];
  const today = new Date();
  for (const siteName of SITE_NAMES) {
    const items = await loadSiteItems(siteName);
    items.forEach(row => {
      const pct = calcProgressFromRow(row);
      if (row.due_date && new Date(row.due_date) < today && pct < 100) {
        const diff = Math.floor((today - new Date(row.due_date)) / (1000 * 60 * 60 * 24));
        delays.push({ row, siteName, diff });
      }
    });
  }
  return delays;
}

async function getSoonItems() {
  const soon = [];
  const today = new Date();
  const week = new Date(today.getTime() + 7 * 24 * 60 * 60 * 1000);
  for (const siteName of SITE_NAMES) {
    const items = await loadSiteItems(siteName);
    items.forEach(row => {
      if (!row.due_date) return;
      const due = new Date(row.due_date);
      const pct = calcProgressFromRow(row);
      if (due >= today && due <= week && pct < 100) {
        const diff = Math.ceil((due - today) / (1000 * 60 * 60 * 24));
        soon.push({ row, siteName, diff });
      }
    });
  }
  return soon;
}

async function renderAlarm() {
  const delays = await getDelayItems();
  const soon = await getSoonItems();

  document.getElementById('delay-count').textContent = delays.length + '건';
  document.getElementById('soon-count').textContent = soon.length + '건';

  document.getElementById('delay-list').innerHTML = delays.length === 0
    ? '<div style="text-align:center;color:#9ca3af;padding:20px;font-size:13px">기간 초과 항목이 없습니다.</div>'
    : delays.map(({ row, siteName, diff }) => `
      <div class="alarm-item delay-item">
        <div class="alarm-info">
          <div class="alarm-name">${row.item_name} (${row.category} · ${row.spec || ''})</div>
          <div class="alarm-detail">예정일 ${row.due_date} · ${siteName}</div>
        </div>
        <div class="alarm-days delay-days">D+${diff} 초과</div>
        <button class="btn btn-danger" style="font-size:12px" onclick="sendAlarmSMS(${row.id})">문자 발송</button>
      </div>
    `).join('');

  document.getElementById('soon-list').innerHTML = soon.length === 0
    ? '<div style="text-align:center;color:#9ca3af;padding:20px;font-size:13px">7일 내 예정 항목이 없습니다.</div>'
    : soon.map(({ row, siteName, diff }) => `
      <div class="alarm-item soon-item">
        <div class="alarm-info">
          <div class="alarm-name">${row.item_name} (${row.category} · ${row.spec || ''})</div>
          <div class="alarm-detail">예정일 ${row.due_date} · ${siteName}</div>
        </div>
        <div class="alarm-days soon-days">D-${diff}</div>
        <button class="btn btn-secondary" style="font-size:12px" onclick="sendAlarmSMS(${row.id})">사전 안내</button>
      </div>
    `).join('');
}

async function sendAlarmSMS(fieldItemId) {
  const row = await fetchFieldItem(fieldItemId);
  const msg = `[삼천리 도시가스] 인동선 11공구 ${row.item_name}(${row.category}) 안전이행 확인 요청. 예정일: ${row.due_date}. 조치 부탁드립니다.`;
  const phone = '01000000000';
  window.location.href = `sms:${phone}?body=${encodeURIComponent(msg)}`;
  await insertSmsLog(fieldItemId, phone, msg);
}

// ===== 규정집 =====
let regCategory = '전체';

function renderRegulation() {
  const q = document.getElementById('reg-search')?.value.toLowerCase() || '';
  const filtered = REGULATIONS.filter(r => {
    const catOk = regCategory === '전체' || r.category === regCategory;
    if (!catOk) return false;
    if (!q) return true;
    return r.title.toLowerCase().includes(q) ||
      r.summary.toLowerCase().includes(q) ||
      r.items.some(i => i.toLowerCase().includes(q));
  });

  document.getElementById('reg-list').innerHTML = filtered.map(r => `
    <div class="reg-card" id="reg-${r.id}" onclick="toggleReg('${r.id}')">
      <div class="reg-header">
        <span class="reg-cat cat-${r.category}">${r.category}</span>
        <span class="reg-title">${highlight(r.title, q)}</span>
        <span class="reg-page-badge">${r.pages}</span>
        <span class="reg-arrow">›</span>
      </div>
      <div class="reg-body">
        <div class="reg-summary">${highlight(r.summary, q)}</div>
        <ul class="reg-items">
          ${r.items.map(item => `<li>${highlight(item, q)}</li>`).join('')}
        </ul>
        <div class="reg-source">📄 가스안전영향평가서 ${r.pages} · ${r.ref}</div>
      </div>
    </div>
  `).join('');

  if (q) {
    document.querySelectorAll('.reg-card').forEach(card => {
      if (card.querySelector('.reg-body').textContent.toLowerCase().includes(q)) {
        card.classList.add('open');
      }
    });
  }
}

function highlight(text, q) {
  if (!q) return text;
  const re = new RegExp(`(${q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
  return text.replace(re, '<span class="highlight">$1</span>');
}

function toggleReg(id) {
  document.getElementById('reg-' + id).classList.toggle('open');
}

function setRegCategory(cat) {
  regCategory = cat;
  document.querySelectorAll('.cat-btn').forEach(b => b.classList.remove('active'));
  document.querySelector(`[data-cat="${cat}"]`).classList.add('active');
  renderRegulation();
}

// ===== 라이트박스 =====
function openLightbox(url) {
  const lb  = document.getElementById('lightbox');
  const img = document.getElementById('lightbox-img');
  if (!lb || !img) return;
  img.src = url;
  lb.style.display = 'flex';
}
function closeLightbox() {
  const lb = document.getElementById('lightbox');
  if (lb) lb.style.display = 'none';
}

// ===== 천공 마커 패널 =====
let _currentBoringId      = null;
let _currentBoringIsCustom = false;

function _getBpIpwhoeMap() {
  try { return JSON.parse(localStorage.getItem('boring_ipwhoe_v1') || '{}'); }
  catch { return {}; }
}
function _getBpRepPhotoMap() {
  try { return JSON.parse(localStorage.getItem('boring_repphoto_v1') || '{}'); }
  catch { return {}; }
}

window.openBoringPanel = async function(boringId, isCustom) {
  _currentBoringId       = boringId;
  _currentBoringIsCustom = !!isCustom;

  document.getElementById('bp-title').textContent = boringId;

  const ipwhoe = _getBpIpwhoeMap()[boringId] || false;
  _renderBpIpwhoe(ipwhoe);

  const stateMap = (typeof _getBoringStateMap === 'function') ? _getBoringStateMap() : {};
  _renderBpColorState(stateMap[boringId] || 0);

  const delBtn = document.getElementById('bp-delete-btn');
  if (delBtn) delBtn.style.display = 'block';

  const panel = document.getElementById('boring-panel');
  panel.style.display = 'block';

  await renderBoringPhotos(boringId);
};

window.closeBoringPanel = function() {
  document.getElementById('boring-panel').style.display = 'none';
  _currentBoringId = null;
};

function _renderBpIpwhoe(val) {
  const yBtn = document.getElementById('bp-ipwhoe-y');
  const nBtn = document.getElementById('bp-ipwhoe-n');
  if (!yBtn || !nBtn) return;
  yBtn.style.background  = val  ? '#16a34a' : '#f1f5f9';
  yBtn.style.color       = val  ? '#fff'    : '#64748b';
  nBtn.style.background  = !val ? '#dc2626' : '#f1f5f9';
  nBtn.style.color       = !val ? '#fff'    : '#64748b';
}

window.setBoringIpwhoe = function(val) {
  if (!_currentBoringId) return;
  const m = _getBpIpwhoeMap();
  m[_currentBoringId] = val;
  localStorage.setItem('boring_ipwhoe_v1', JSON.stringify(m));
  _renderBpIpwhoe(val);
};

function _renderBpColorState(state) {
  [0, 1, 2].forEach(s => {
    const btn = document.getElementById('bp-color-' + s);
    if (!btn) return;
    btn.style.outline = s === state ? '2px solid #0ea5e9' : 'none';
    btn.style.outlineOffset = '2px';
  });
}

window.setBoringColorState = function(state) {
  if (!_currentBoringId) return;
  if (typeof setBoringState === 'function') setBoringState(_currentBoringId, state);
  _renderBpColorState(state);
};

window.renderBoringPhotos = async function(boringId) {
  const repPath = _getBpRepPhotoMap()[boringId] || null;

  const repEl = document.getElementById('bp-repphoto');
  if (repEl) {
    if (repPath) {
      const url = getPipePhotoUrl(repPath);
      repEl.innerHTML = `<img src="${url}" style="width:100%;max-height:200px;object-fit:cover;border-radius:8px;cursor:pointer;margin-bottom:8px" onclick="openLightbox('${url}')">`;
    } else {
      repEl.innerHTML = '<div style="color:#94a3b8;font-size:12px;text-align:center;padding:8px 0">대표사진 없음</div>';
    }
  }

  const gallery = document.getElementById('bp-photos');
  if (!gallery) return;
  gallery.innerHTML = '<div style="color:#94a3b8;font-size:12px">불러오는 중...</div>';
  try {
    const photos = await listBoringPhotos(boringId);
    if (!photos.length) {
      gallery.innerHTML = '<div style="color:#94a3b8;font-size:12px;text-align:center">사진 없음</div>';
      return;
    }
    gallery.innerHTML = photos.map(p => `
      <div style="position:relative;display:inline-block;margin:3px">
        <img src="${p.url}" style="width:76px;height:76px;object-fit:cover;border-radius:6px;cursor:pointer;border:${repPath===p.path?'2.5px solid #16a34a':'1px solid #e2e8f0'}"
          onclick="openLightbox('${p.url}')">
        <div style="position:absolute;top:2px;right:2px;display:flex;gap:2px">
          <button onclick="event.stopPropagation();boringSetRepPhoto('${p.path}')" title="대표사진으로 지정"
            style="width:18px;height:18px;border-radius:3px;border:none;background:rgba(255,255,255,0.92);font-size:10px;cursor:pointer;line-height:1">★</button>
          <button onclick="event.stopPropagation();boringDeletePhoto('${p.path}')" title="삭제"
            style="width:18px;height:18px;border-radius:3px;border:none;background:rgba(255,255,255,0.92);font-size:10px;cursor:pointer;line-height:1">✕</button>
        </div>
      </div>
    `).join('');
  } catch {
    gallery.innerHTML = '<div style="color:#ef4444;font-size:12px">로드 실패</div>';
  }
};

window.boringSetRepPhoto = function(path) {
  if (!_currentBoringId) return;
  const m = _getBpRepPhotoMap();
  m[_currentBoringId] = path;
  localStorage.setItem('boring_repphoto_v1', JSON.stringify(m));
  renderBoringPhotos(_currentBoringId);
};

window.boringDeletePhoto = async function(path) {
  if (!confirm('사진을 삭제할까요?')) return;
  try {
    await deleteBoringPhoto(path);
    const m = _getBpRepPhotoMap();
    if (m[_currentBoringId] === path) {
      delete m[_currentBoringId];
      localStorage.setItem('boring_repphoto_v1', JSON.stringify(m));
    }
    await renderBoringPhotos(_currentBoringId);
  } catch (e) { alert('삭제 실패: ' + e.message); }
};

window.handleBoringPhotoUpload = async function(input) {
  if (!_currentBoringId || !input.files.length) return;
  const lbl = document.getElementById('bp-upload-lbl');
  if (lbl) lbl.textContent = '업로드 중...';
  try {
    for (const file of Array.from(input.files)) {
      await uploadBoringPhoto(_currentBoringId, file);
    }
    input.value = '';
    await renderBoringPhotos(_currentBoringId);
  } catch (e) { alert('업로드 실패: ' + e.message); }
  if (lbl) lbl.textContent = '📷 사진 추가';
};

window.deleteCustomBoring = function() {
  if (!_currentBoringId) return;
  if (!confirm(`마커 "${_currentBoringId}"를 삭제할까요?`)) return;
  if (_currentBoringIsCustom) {
    if (typeof _removeCustomPoint === 'function') _removeCustomPoint(_currentBoringId);
  } else {
    if (typeof _hideMarker === 'function') _hideMarker(_currentBoringId);
  }
  closeBoringPanel();
  if (typeof renderBoringPoints === 'function') renderBoringPoints();
};
