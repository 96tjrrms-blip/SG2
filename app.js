// ===== 상태 관리 =====
let currentSite = '115정거장';
let currentItemId = null;   // field_items.id (DB의 bigint)
let siteMap = {};           // { '115정거장': 1, '15환기구': 2, '16환기구': 3 }
let fieldCache = {};        // { siteId: [ field_item rows ] }

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
  let allPct = 0, allCount = 0, allDone = 0;
  const today = new Date();
  let delayTotal = 0;

  for (const siteName of SITE_NAMES) {
    const items = await loadSiteItems(siteName);
    items.forEach(row => {
      const pct = calcProgressFromRow(row);
      allPct += pct;
      allCount++;
      if (pct === 100) allDone++;
      if (row.due_date && new Date(row.due_date) < today && pct < 100) delayTotal++;
    });
  }

  const total = allCount > 0 ? Math.round(allPct / allCount) : 0;
  const circumference = 2 * Math.PI * 52;
  const offset = circumference - (total / 100) * circumference;
  document.getElementById('gauge-circle-path').style.strokeDashoffset = offset;
  document.getElementById('gauge-pct').textContent = total + '%';
  document.getElementById('gauge-sub').textContent = `${allDone} / ${allCount} 완료`;

  for (const siteName of SITE_NAMES) {
    const p = await calcSiteProgressFromCache(siteName);
    const el = document.getElementById('site-card-' + siteName);
    if (!el) continue;
    el.querySelector('.pct').textContent = p.pct + '%';
    el.querySelector('.progress-fill').style.width = p.pct + '%';
    el.querySelector('.stat-done').textContent = '✓ ' + p.done + '건';
    el.querySelector('.stat-delay').textContent = p.delay + '건';
  }

  // 알람 배너
  const banner = document.getElementById('alert-banner');
  if (delayTotal > 0) {
    banner.style.display = 'flex';
    banner.querySelector('span').textContent = `기간 초과 항목 ${delayTotal}건 — 즉시 확인 필요`;
  } else {
    banner.style.display = 'none';
  }

  await renderSmsLog();
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

    let status = '미착수', statusClass = 'status-wait';
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
