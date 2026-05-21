// ===== 상태 관리 =====
let currentSite = '115정거장';
let currentItemId = null;
let selectedRow = null;

// LocalStorage에서 데이터 불러오기
function loadData() {
  const saved = localStorage.getItem('gas_safety_data');
  return saved ? JSON.parse(saved) : {};
}

function saveData(data) {
  localStorage.setItem('gas_safety_data', JSON.stringify(data));
}

function getItemData(itemId) {
  const data = loadData();
  if (!data[itemId]) {
    data[itemId] = {
      dueDate: '',
      memo: '',
      processItems: DEFAULT_PROCESS.map(label => ({ label, done: false, doneAt: '', na: false })),
      safetyItems: DEFAULT_SAFETY.map(label => ({ label, done: false, doneAt: '', na: false })),
      customItems: [],
      smsLog: []
    };
    saveData(data);
  }
  return data[itemId];
}

function updateItemData(itemId, itemData) {
  const data = loadData();
  data[itemId] = itemData;
  saveData(data);
}

// ===== 진행률 계산 =====
function calcProgress(itemData) {
  const allItems = [
    ...itemData.processItems,
    ...itemData.safetyItems,
    ...itemData.customItems
  ].filter(i => !i.na);
  if (allItems.length === 0) return 0;
  const done = allItems.filter(i => i.done).length;
  return Math.round((done / allItems.length) * 100);
}

function calcSiteProgress(siteName) {
  const site = SITES[siteName];
  if (!site || site.items.length === 0) return { pct: 0, done: 0, total: 0, delay: 0 };
  let totalPct = 0;
  let delayCount = 0;
  site.items.forEach(item => {
    const d = getItemData(item.id);
    totalPct += calcProgress(d);
    if (d.dueDate && new Date(d.dueDate) < new Date() && calcProgress(d) < 100) delayCount++;
  });
  return {
    pct: Math.round(totalPct / site.items.length),
    done: site.items.filter(i => calcProgress(getItemData(i.id)) === 100).length,
    total: site.items.length,
    delay: delayCount
  };
}

function calcTotalProgress() {
  let total = 0, count = 0;
  Object.values(SITES).forEach(site => {
    site.items.forEach(item => {
      total += calcProgress(getItemData(item.id));
      count++;
    });
  });
  return count > 0 ? Math.round(total / count) : 0;
}

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

// ===== 대시보드 =====
function renderDashboard() {
  const total = calcTotalProgress();
  const circumference = 2 * Math.PI * 52;
  const offset = circumference - (total / 100) * circumference;
  document.getElementById('gauge-circle-path').style.strokeDashoffset = offset;
  document.getElementById('gauge-pct').textContent = total + '%';

  const allDone = Object.values(SITES).reduce((sum, s) =>
    sum + s.items.filter(i => calcProgress(getItemData(i.id)) === 100).length, 0);
  const allTotal = Object.values(SITES).reduce((sum, s) => sum + s.items.length, 0);
  document.getElementById('gauge-sub').textContent = `${allDone} / ${allTotal} 완료`;

  ['115정거장', '15환기구', '16환기구'].forEach(site => {
    const p = calcSiteProgress(site);
    const key = site.replace('정거장', '').replace('환기구', 'e');
    const el = document.getElementById('site-card-' + site);
    if (!el) return;
    el.querySelector('.pct').textContent = p.pct + '%';
    el.querySelector('.progress-fill').style.width = p.pct + '%';
    el.querySelector('.stat-done').textContent = '✓ ' + p.done + '건';
    el.querySelector('.stat-delay').textContent = p.delay + '건';
  });

  // 알람 배너
  const delays = getDelayItems();
  const banner = document.getElementById('alert-banner');
  if (delays.length > 0) {
    banner.style.display = 'flex';
    banner.querySelector('span').textContent = `기간 초과 항목 ${delays.length}건 — 즉시 확인 필요`;
  } else {
    banner.style.display = 'none';
  }

  // SMS 이력
  renderSmsLog();
}

function renderSmsLog() {
  const data = loadData();
  let logs = [];
  Object.values(SITES).forEach(site => {
    site.items.forEach(item => {
      const d = data[item.id];
      if (d && d.smsLog) {
        d.smsLog.forEach(log => logs.push({ ...log, itemName: item.name }));
      }
    });
  });
  logs.sort((a, b) => new Date(b.sentAt) - new Date(a.sentAt));
  logs = logs.slice(0, 3);

  const el = document.getElementById('sms-list');
  if (logs.length === 0) {
    el.innerHTML = '<div style="text-align:center;color:#9ca3af;padding:20px;font-size:13px">발송 내역이 없습니다.</div>';
  } else {
    el.innerHTML = logs.map(log => `
      <div class="sms-item">
        <div>
          <div style="font-weight:500">${log.itemName} — ${log.content}</div>
        </div>
        <div class="sms-date">${log.sentAt}</div>
      </div>
    `).join('');
  }
}

// ===== 현장관리 =====
function renderField() {
  const site = SITES[currentSite];
  const tbody = document.getElementById('field-tbody');
  tbody.innerHTML = site.items.map(item => {
    const d = getItemData(item.id);
    const pct = calcProgress(d);
    const isDelay = d.dueDate && new Date(d.dueDate) < new Date() && pct < 100;
    const procDone = d.processItems.filter(i => i.done && !i.na).length;
    const procTotal = d.processItems.filter(i => !i.na).length;
    const safeDone = d.safetyItems.filter(i => i.done && !i.na).length;
    const safeTotal = d.safetyItems.filter(i => !i.na).length;

    let status = '미착수', statusClass = 'status-wait';
    if (pct === 100) { status = '완료'; statusClass = 'status-done'; }
    else if (isDelay) { status = '지연'; statusClass = 'status-delay'; }
    else if (pct > 0) { status = '진행중'; statusClass = 'status-progress'; }

    const tagClass = item.type === '인입관' ? 'tag-inflow' : 'tag-valve';
    const procColor = isDelay ? '#dc2626' : pct > 0 ? '#0d2b5e' : '#e5e7eb';
    const safeColor = isDelay ? '#dc2626' : pct > 0 ? '#0d2b5e' : '#e5e7eb';

    return `
      <tr class="${isDelay ? 'delay' : ''} ${currentItemId === item.id ? 'selected' : ''}"
          onclick="selectItem('${item.id}')">
        <td style="font-weight:500">${item.name}</td>
        <td><span class="tag ${tagClass}">${item.type}</span></td>
        <td style="color:#6b7280;font-size:12px">${item.spec}</td>
        <td style="font-size:12px;color:${isDelay ? '#dc2626' : '#374151'}">${d.dueDate || '-'}</td>
        <td><span class="${statusClass}">${status}</span></td>
        <td>
          <span class="mini-bar"><span class="mini-fill" style="width:${procTotal > 0 ? Math.round(procDone/procTotal*100) : 0}%;background:${procColor}"></span></span>
          <span style="font-size:11px;color:#6b7280">${procDone}/${procTotal}</span>
        </td>
        <td>
          <span class="mini-bar"><span class="mini-fill" style="width:${safeTotal > 0 ? Math.round(safeDone/safeTotal*100) : 0}%;background:${safeColor}"></span></span>
          <span style="font-size:11px;color:#6b7280">${safeDone}/${safeTotal}</span>
        </td>
      </tr>
    `;
  }).join('');
}

function selectItem(itemId) {
  currentItemId = itemId;
  renderField();
  renderChecklist(itemId);
}

function renderChecklist(itemId) {
  const panel = document.getElementById('checklist-panel');
  panel.classList.add('open');

  const site = Object.values(SITES).find(s => s.items.find(i => i.id === itemId));
  const item = site?.items.find(i => i.id === itemId);
  const d = getItemData(itemId);

  document.getElementById('panel-title').textContent = `${item.name} — ${item.spec} (${item.type})`;
  document.getElementById('panel-due').value = d.dueDate || '';
  document.getElementById('panel-memo').value = d.memo || '';

  // 공정입회
  document.getElementById('process-list').innerHTML = d.processItems.map((it, idx) => `
    <div class="cl-item ${it.done ? 'checked' : ''} ${it.na ? 'na' : ''}" id="proc-${idx}">
      <input type="checkbox" ${it.done ? 'checked' : ''} ${it.na ? 'disabled' : ''}
        onchange="toggleCheck('process', ${idx})">
      <span>${it.label}</span>
      ${it.done ? `<span class="cl-date">${it.doneAt}</span>` : `<button class="na-btn" onclick="toggleNA('process', ${idx})">${it.na ? '취소' : '해당없음'}</button>`}
    </div>
  `).join('');

  // 안전조치
  document.getElementById('safety-list').innerHTML = d.safetyItems.map((it, idx) => `
    <div class="cl-item ${it.done ? 'checked' : ''} ${it.na ? 'na' : ''}" id="safe-${idx}">
      <input type="checkbox" ${it.done ? 'checked' : ''} ${it.na ? 'disabled' : ''}
        onchange="toggleCheck('safety', ${idx})">
      <span>${it.label}</span>
      ${it.done ? `<span class="cl-date">${it.doneAt}</span>` : `<button class="na-btn" onclick="toggleNA('safety', ${idx})">${it.na ? '취소' : '해당없음'}</button>`}
    </div>
  `).join('');

  // 기타 항목
  document.getElementById('custom-list').innerHTML = d.customItems.map((it, idx) => `
    <div class="cl-item ${it.done ? 'checked' : ''}">
      <input type="checkbox" ${it.done ? 'checked' : ''}
        onchange="toggleCheck('custom', ${idx})">
      <span>${it.label}</span>
      ${it.done ? `<span class="cl-date">${it.doneAt}</span>` : ''}
      <button class="na-btn" onclick="removeCustomItem(${idx})" style="color:#dc2626">삭제</button>
    </div>
  `).join('');

  panel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function toggleCheck(type, idx) {
  const d = getItemData(currentItemId);
  const arr = type === 'process' ? d.processItems : type === 'safety' ? d.safetyItems : d.customItems;
  arr[idx].done = !arr[idx].done;
  arr[idx].doneAt = arr[idx].done ? new Date().toLocaleDateString('ko-KR') : '';
  updateItemData(currentItemId, d);
  renderChecklist(currentItemId);
  renderField();
  renderDashboard();
}

function toggleNA(type, idx) {
  const d = getItemData(currentItemId);
  const arr = type === 'process' ? d.processItems : d.safetyItems;
  arr[idx].na = !arr[idx].na;
  arr[idx].done = false;
  updateItemData(currentItemId, d);
  renderChecklist(currentItemId);
  renderField();
  renderDashboard();
}

function addCustomItem() {
  const input = document.getElementById('custom-input');
  const label = input.value.trim();
  if (!label) return;
  const d = getItemData(currentItemId);
  d.customItems.push({ label, done: false, doneAt: '', na: false });
  updateItemData(currentItemId, d);
  input.value = '';
  renderChecklist(currentItemId);
  renderField();
}

function removeCustomItem(idx) {
  const d = getItemData(currentItemId);
  d.customItems.splice(idx, 1);
  updateItemData(currentItemId, d);
  renderChecklist(currentItemId);
  renderField();
}

function savePanel() {
  const d = getItemData(currentItemId);
  d.dueDate = document.getElementById('panel-due').value;
  d.memo = document.getElementById('panel-memo').value;
  updateItemData(currentItemId, d);
  renderField();
  renderDashboard();
  alert('저장되었습니다.');
}

function closePanel() {
  document.getElementById('checklist-panel').classList.remove('open');
  currentItemId = null;
  renderField();
}

function sendSMS() {
  if (!currentItemId) return;
  const site = Object.values(SITES).find(s => s.items.find(i => i.id === currentItemId));
  const item = site?.items.find(i => i.id === currentItemId);
  const d = getItemData(currentItemId);
  const pct = calcProgress(d);
  const msg = `[삼천리 도시가스] 인동선 11공구 ${currentSite} ${item.name}(${item.type}) 안전이행 확인 요청. 현재 진행률 ${pct}%. 미조치 항목 확인 및 조치 부탁드립니다.`;
  const phone = '01000000000';
  window.location.href = `sms:${phone}?body=${encodeURIComponent(msg)}`;

  d.smsLog = d.smsLog || [];
  d.smsLog.push({ content: '안전이행 확인 요청', sentAt: new Date().toLocaleDateString('ko-KR') });
  updateItemData(currentItemId, d);
  renderSmsLog();
}

function switchSite(site) {
  currentSite = site;
  currentItemId = null;
  document.getElementById('checklist-panel').classList.remove('open');
  document.querySelectorAll('.site-tab').forEach(t => t.classList.remove('active'));
  document.querySelector(`[data-site="${site}"]`).classList.add('active');
  renderField();
}

// ===== 알람 =====
function getDelayItems() {
  const delays = [];
  const today = new Date();
  Object.entries(SITES).forEach(([siteName, site]) => {
    site.items.forEach(item => {
      const d = getItemData(item.id);
      if (d.dueDate && new Date(d.dueDate) < today && calcProgress(d) < 100) {
        const diff = Math.floor((today - new Date(d.dueDate)) / (1000 * 60 * 60 * 24));
        delays.push({ item, siteName, d, diff });
      }
    });
  });
  return delays;
}

function getSoonItems() {
  const soon = [];
  const today = new Date();
  const week = new Date(today.getTime() + 7 * 24 * 60 * 60 * 1000);
  Object.entries(SITES).forEach(([siteName, site]) => {
    site.items.forEach(item => {
      const d = getItemData(item.id);
      const due = new Date(d.dueDate);
      if (d.dueDate && due >= today && due <= week && calcProgress(d) < 100) {
        const diff = Math.ceil((due - today) / (1000 * 60 * 60 * 24));
        soon.push({ item, siteName, d, diff });
      }
    });
  });
  return soon;
}

function renderAlarm() {
  const delays = getDelayItems();
  const soon = getSoonItems();

  document.getElementById('delay-count').textContent = delays.length + '건';
  document.getElementById('soon-count').textContent = soon.length + '건';

  document.getElementById('delay-list').innerHTML = delays.length === 0
    ? '<div style="text-align:center;color:#9ca3af;padding:20px;font-size:13px">기간 초과 항목이 없습니다.</div>'
    : delays.map(({ item, siteName, d }) => `
      <div class="alarm-item delay-item">
        <div class="alarm-info">
          <div class="alarm-name">${item.name} (${item.type} · ${item.spec})</div>
          <div class="alarm-detail">예정일 ${d.dueDate} · ${siteName}</div>
        </div>
        <div class="alarm-days delay-days">D+${Math.floor((new Date() - new Date(d.dueDate)) / (1000*60*60*24))} 초과</div>
        <button class="btn btn-danger" style="font-size:12px" onclick="sendAlarmSMS('${item.id}')">문자 발송</button>
      </div>
    `).join('');

  document.getElementById('soon-list').innerHTML = soon.length === 0
    ? '<div style="text-align:center;color:#9ca3af;padding:20px;font-size:13px">7일 내 예정 항목이 없습니다.</div>'
    : soon.map(({ item, siteName, d, diff }) => `
      <div class="alarm-item soon-item">
        <div class="alarm-info">
          <div class="alarm-name">${item.name} (${item.type} · ${item.spec})</div>
          <div class="alarm-detail">예정일 ${d.dueDate} · ${siteName}</div>
        </div>
        <div class="alarm-days soon-days">D-${diff}</div>
        <button class="btn btn-secondary" style="font-size:12px" onclick="sendAlarmSMS('${item.id}')">사전 안내</button>
      </div>
    `).join('');
}

function sendAlarmSMS(itemId) {
  const site = Object.values(SITES).find(s => s.items.find(i => i.id === itemId));
  const item = site?.items.find(i => i.id === itemId);
  const d = getItemData(itemId);
  const msg = `[삼천리 도시가스] 인동선 11공구 ${item.name}(${item.type}) 안전이행 확인 요청. 예정일: ${d.dueDate}. 조치 부탁드립니다.`;
  window.location.href = `sms:01000000000?body=${encodeURIComponent(msg)}`;
  d.smsLog = d.smsLog || [];
  d.smsLog.push({ content: '안전이행 확인 요청', sentAt: new Date().toLocaleDateString('ko-KR') });
  updateItemData(itemId, d);
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

// ===== 초기화 =====
document.addEventListener('DOMContentLoaded', () => {
  navigate('dashboard');
});
