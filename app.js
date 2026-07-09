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
  // 배관 편집 그룹: 환기구(S015/S016)에서만 표시
  const pipeGroup = document.getElementById('pipe-edit-group');
  if (pipeGroup) pipeGroup.style.display = is115 ? 'none' : 'flex';
  // 정압기 그룹: S016에서만 표시
  const regGroup = document.getElementById('regulator-edit-group');
  if (regGroup) regGroup.style.display = currentDashSite === 'S016' ? 'flex' : 'none';
  // map-svg는 항상 표시 유지 (환기구에서도 구역·입구 표시용으로 필요)
  // zone-toggle-bar / 주소칩 / 가스카드 복원 (overview에서 숨겼을 수 있음)
  const ztb = document.getElementById('zone-toggle-bar');
  if (ztb) ztb.style.display = 'flex';
  const addrChip = document.getElementById('map-address-chip');
  if (addrChip) addrChip.style.display = '';
  const gasCard = document.getElementById('gas-exposure-card');
  if (gasCard) gasCard.style.display = '';
  _updateSiteInfoOverlay();
}

window.switchDashSite = function(siteId) {
  // 전체 위치도 → 개별 현장으로 전환 시 overview 숨기고 map-container 복원
  const ov = document.getElementById('site-overview-map');
  const mc = document.getElementById('map-container');
  if (ov) ov.style.display = 'none';
  if (mc) mc.style.display = '';

  currentDashSite = siteId;
  window.currentDashSite = siteId;

  document.querySelectorAll('.dash-site-tab').forEach(b => {
    b.classList.toggle('active', b.dataset.site === siteId);
  });

  if (_droneViewOpen) toggleDroneView();
  _closeExcavView();

  const site = DASH_SITES.find(s => s.id === siteId);

  // 모든 현장: switchDashMap으로 통일 (환기구는 정적 사진 경로, 115st는 map.png)
  const imgSrc = site.sitePhoto || site.mapImg;
  if (typeof switchDashMap === 'function') switchDashMap(imgSrc);
  if (typeof mapZoomReset === 'function') mapZoomReset();
  // Supabase에서 최신 데이터 로드 (구역/입구, 커스텀 배관, 주차, 정압기)
  if (typeof _syncZoneForSite === 'function') _syncZoneForSite();
  if (typeof _loadCustomPipesForSite === 'function') _loadCustomPipesForSite(siteId);
  if (typeof window._syncParkingForSite === 'function') window._syncParkingForSite(siteId);
  if (typeof window._syncRegulatorForSite === 'function') window._syncRegulatorForSite(siteId);
  if (typeof window._syncGasExposureForSite === 'function') window._syncGasExposureForSite(siteId);

  _updateDashControls();
  initDroneView();
};

// ===== 굴착공사현황 =====
let _excavPhotos = [];
const EXCAV_DRAW_KEY = 'excav_draw_v1';
let _excavMode  = null;
let _excavColor = '#ef4444';
let _excavSize  = 4;
let _excavStrokes = {};
try { _excavStrokes = JSON.parse(localStorage.getItem(EXCAV_DRAW_KEY) || '{}'); } catch {}
let _excavToolbarOpen = false;

function _saveExcavStrokes() {
  localStorage.setItem(EXCAV_DRAW_KEY, JSON.stringify(_excavStrokes));
}

function _drawExcavStrokes(canvas, path) {
  const ctx = canvas.getContext('2d');
  const W = canvas.width, H = canvas.height;
  ctx.clearRect(0, 0, W, H);
  (_excavStrokes[path] || []).forEach(s => {
    if (!s.pts.length) return;
    ctx.save();
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    if (s.tool === 'eraser') {
      ctx.globalCompositeOperation = 'destination-out';
      ctx.strokeStyle = 'rgba(0,0,0,1)';
      ctx.lineWidth = (s.size || 4) * 4;
    } else {
      ctx.globalCompositeOperation = 'source-over';
      ctx.strokeStyle = s.color || '#ef4444';
      ctx.lineWidth = s.size || 4;
    }
    ctx.beginPath();
    if (s.pts.length === 1) {
      ctx.arc(s.pts[0].x * W, s.pts[0].y * H, ctx.lineWidth / 2, 0, Math.PI * 2);
      ctx.fillStyle = ctx.strokeStyle;
      ctx.fill();
    } else {
      ctx.moveTo(s.pts[0].x * W, s.pts[0].y * H);
      s.pts.slice(1).forEach(p => ctx.lineTo(p.x * W, p.y * H));
      ctx.stroke();
    }
    ctx.restore();
  });
}

function _initExcavCanvas(canvas) {
  const path = canvas.dataset.path;
  const img  = canvas.parentElement.querySelector('img');
  const setup = () => {
    const w = img.offsetWidth, h = img.offsetHeight;
    if (w && h) { canvas.width = w; canvas.height = h; }
    _drawExcavStrokes(canvas, path);
  };
  if (img.complete && img.naturalHeight) setup();
  else img.addEventListener('load', setup, { once: true });

  let drawing = false, curStroke = null;
  canvas.addEventListener('pointerdown', e => {
    if (!_excavMode) return;
    e.preventDefault();
    canvas.setPointerCapture(e.pointerId);
    drawing = true;
    const r = canvas.getBoundingClientRect();
    const pt = { x: (e.clientX - r.left) / r.width, y: (e.clientY - r.top) / r.height };
    curStroke = { tool: _excavMode, color: _excavColor, size: _excavSize, pts: [pt] };
    if (!_excavStrokes[path]) _excavStrokes[path] = [];
    _excavStrokes[path].push(curStroke);
    _drawExcavStrokes(canvas, path);
  });
  canvas.addEventListener('pointermove', e => {
    if (!drawing || !curStroke) return;
    const r = canvas.getBoundingClientRect();
    curStroke.pts.push({ x: (e.clientX - r.left) / r.width, y: (e.clientY - r.top) / r.height });
    _drawExcavStrokes(canvas, path);
  });
  canvas.addEventListener('pointerup', () => { if (drawing) { drawing = false; curStroke = null; _saveExcavStrokes(); } });
  canvas.addEventListener('pointercancel', () => { drawing = false; curStroke = null; });
}

function _updateExcavDrawUI() {
  const penBtn    = document.getElementById('excav-pen-btn');
  const eraserBtn = document.getElementById('excav-eraser-btn');
  if (penBtn)    { penBtn.style.background = _excavMode === 'pen' ? '#0d2b5e' : '#fff'; penBtn.style.color = _excavMode === 'pen' ? '#fff' : ''; penBtn.style.borderColor = _excavMode === 'pen' ? '#0d2b5e' : '#cbd5e1'; }
  if (eraserBtn) { eraserBtn.style.background = _excavMode === 'eraser' ? '#0d2b5e' : '#fff'; eraserBtn.style.color = _excavMode === 'eraser' ? '#fff' : ''; eraserBtn.style.borderColor = _excavMode === 'eraser' ? '#0d2b5e' : '#cbd5e1'; }
  document.querySelectorAll('.excav-color-btn').forEach(btn => {
    btn.style.boxShadow = btn.dataset.color === _excavColor ? '0 0 0 3px #0d2b5e' : '0 0 0 1px #cbd5e1';
  });
  document.querySelectorAll('.excav-canvas').forEach(c => {
    c.style.pointerEvents = _excavMode ? 'all' : 'none';
    c.style.cursor = _excavMode ? 'crosshair' : '';
  });
}

window._toggleExcavToolbar = function() {
  _excavToolbarOpen = !_excavToolbarOpen;
  const toolbar   = document.getElementById('excav-draw-toolbar');
  const toggleBtn = document.getElementById('excav-draw-toggle-btn');
  if (toolbar)   toolbar.style.display = _excavToolbarOpen ? '' : 'none';
  if (toggleBtn) { toggleBtn.style.background = _excavToolbarOpen ? '#0d2b5e' : '#fff'; toggleBtn.style.color = _excavToolbarOpen ? '#fff' : '#475569'; toggleBtn.style.borderColor = _excavToolbarOpen ? '#0d2b5e' : '#cbd5e1'; }
  if (!_excavToolbarOpen) { _excavMode = null; _updateExcavDrawUI(); }
};

window._setExcavTool = function(tool) {
  _excavMode = _excavMode === tool ? null : tool;
  _updateExcavDrawUI();
};

window._setExcavColor = function(color) {
  _excavColor = color;
  if (_excavMode !== 'pen') _excavMode = 'pen';
  _updateExcavDrawUI();
};

window._setExcavSize = function(size) {
  _excavSize = size;
  const label = document.getElementById('excav-size-label');
  if (label) label.textContent = size + 'px';
};

window._clearAllExcavDrawings = function() {
  if (!confirm('모든 굴착공사현황 사진의 그림을 지울까요?')) return;
  _excavPhotos.forEach(p => delete _excavStrokes[p.path]);
  _saveExcavStrokes();
  document.querySelectorAll('.excav-canvas').forEach(c => {
    const ctx = c.getContext('2d');
    ctx.clearRect(0, 0, c.width, c.height);
  });
};

function _renderExcavList() {
  const list  = document.getElementById('excav-list');
  const label = document.getElementById('excav-count-label');
  if (!list) return;
  if (label) label.textContent = _excavPhotos.length ? `${_excavPhotos.length}장` : '';
  if (!_excavPhotos.length) {
    list.innerHTML = '<div style="text-align:center;color:#9ca3af;padding:32px 0;font-size:13px">사진이 없습니다<br><small>위 + 버튼으로 추가하세요</small></div>';
    return;
  }
  list.innerHTML = _excavPhotos.map(p => {
    const safe     = p.url.replace(/'/g, '%27');
    const safePath = p.path.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
    const safeDataPath = p.path.replace(/"/g, '&quot;');
    return `<div style="position:relative;margin-bottom:12px;border-radius:8px;overflow:hidden;box-shadow:0 1px 4px rgba(0,0,0,0.1)">
      <img src="${safe}" style="width:100%;display:block;border-radius:6px">
      <canvas class="excav-canvas" data-path="${safeDataPath}"
        style="position:absolute;top:0;left:0;width:100%;height:100%;pointer-events:none"></canvas>
      <button onclick="deleteExcavPhoto('${safePath}')"
        style="position:absolute;top:6px;right:6px;background:rgba(0,0,0,0.55);border:none;border-radius:50%;width:26px;height:26px;color:#fff;font-size:14px;cursor:pointer;line-height:1;padding:0">✕</button>
    </div>`;
  }).join('');
  list.querySelectorAll('.excav-canvas').forEach(c => _initExcavCanvas(c));
  _updateExcavDrawUI();
}

function _closeExcavView() {
  const view = document.getElementById('excav-view');
  if (view) view.style.display = 'none';
  if (_excavToolbarOpen) {
    _excavToolbarOpen = false;
    _excavMode = null;
  }
}

window.showExcavView = function() {
  document.querySelectorAll('.dash-site-tab').forEach(b => b.classList.remove('active'));
  const tab = document.getElementById('excav-tab');
  if (tab) tab.classList.add('active');

  document.getElementById('map-container').style.display = 'none';
  const mn = document.getElementById('map-no-image');
  if (mn) mn.style.display = 'none';
  const ov = document.getElementById('site-overview-map');
  if (ov) ov.style.display = 'none';
  if (_droneViewOpen) toggleDroneView();

  document.getElementById('excav-view').style.display = '';

  ['zone-toggle-bar','pipe-edit-group','regulator-edit-group',
   'map-address-chip','gas-exposure-card'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.style.display = 'none';
  });

  listExcavPhotos().then(photos => {
    _excavPhotos = photos;
    _renderExcavList();
  }).catch(() => { _excavPhotos = []; _renderExcavList(); });
};

window.handleExcavUpload = async function(input) {
  const files = Array.from(input.files);
  if (!files.length) return;
  const addBtn = document.querySelector('#excav-view button:last-of-type');
  if (addBtn) addBtn.textContent = '업로드 중...';
  try {
    for (const f of files) await uploadExcavPhoto(f);
    _excavPhotos = await listExcavPhotos();
    _renderExcavList();
  } catch(e) { alert('업로드 실패: ' + e.message); }
  finally { input.value = ''; if (addBtn) addBtn.textContent = '+ 사진 추가'; }
};

window.deleteExcavPhoto = async function(path) {
  if (!confirm('이 사진을 삭제할까요?')) return;
  try {
    await deleteExcavPhotoStorage(path);
    _excavPhotos = await listExcavPhotos();
    _renderExcavList();
  } catch(e) { alert('삭제 실패: ' + e.message); }
};

// ===== 전체 위치도 (스마트배관망 iframe) =====
window.showOverviewMap = function() {
  // 탭 active 처리
  document.querySelectorAll('.dash-site-tab').forEach(b => b.classList.remove('active'));
  const tab = document.getElementById('overview-map-tab');
  if (tab) tab.classList.add('active');

  // map-container / drone-view 숨기고 overview 표시
  const mc = document.getElementById('map-container');
  const ov = document.getElementById('site-overview-map');
  const mn = document.getElementById('map-no-image');
  if (mc) mc.style.display = 'none';
  if (mn) mn.style.display = 'none';
  if (ov) ov.style.display = '';
  if (_droneViewOpen) toggleDroneView();
  _closeExcavView();

  // 편집 컨트롤 전체 숨김
  ['zone-toggle-bar','pipe-edit-group','regulator-edit-group',
   'map-address-chip','gas-exposure-card'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.style.display = 'none';
  });

  // iframe 로드 실패 감지
  const frame = document.getElementById('samchully-map-frame');
  const errDiv = document.getElementById('map-frame-error');
  if (frame && errDiv) {
    frame.onerror = () => { errDiv.style.display = 'flex'; };
    // X-Frame-Options 차단 시 contentDocument 접근 불가 → 1.5초 후 체크
    setTimeout(() => {
      try {
        const doc = frame.contentDocument || frame.contentWindow.document;
        if (!doc || doc.URL === 'about:blank') errDiv.style.display = 'flex';
        else errDiv.style.display = 'none';
      } catch(e) {
        // cross-origin but loaded — this is normal when it works
        errDiv.style.display = 'none';
      }
    }, 1500);
  }
};

// ===== 현장 주소 / 도시가스 노출현황 =====
const _SITE_DEFAULT_ADDR = {
  '115st': '화성시 병점구 능동 464-4',
  'S015': '화성시 병점구 기산동 35-1',
  'S016': '화성시 동탄구 반송동 59'
};
// S015/S016은 주소 고정 (편집 불필요)
const _SITE_ADDR_EDITABLE = { '115st': true, 'S015': false, 'S016': false };

function _getSiteAddress(siteId) {
  return localStorage.getItem(`_site_address_${siteId}`) || _SITE_DEFAULT_ADDR[siteId] || '';
}

window.openAddressModal = function() {
  if (!_SITE_ADDR_EDITABLE[currentDashSite]) return;
  const input = document.getElementById('address-input');
  if (input) input.value = _getSiteAddress(currentDashSite);
  const modal = document.getElementById('address-modal');
  if (modal) modal.style.display = 'flex';
  setTimeout(() => { if (input) input.focus(); }, 50);
};

window.closeAddressModal = function() {
  const modal = document.getElementById('address-modal');
  if (modal) modal.style.display = 'none';
};

window.saveAddress = function() {
  const input = document.getElementById('address-input');
  if (!input) return;
  const val = input.value.trim();
  localStorage.setItem(`_site_address_${currentDashSite}`, val);
  const chip = document.getElementById('map-address-text');
  if (chip) chip.textContent = val || '-';
  closeAddressModal();
};

let _gasExposureCache = {};

function _renderGasExposureList(siteId) {
  const list = document.getElementById('gas-exposure-list');
  if (!list) return;
  const items = _gasExposureCache[siteId] || [];
  if (!items.length) {
    list.innerHTML = '<span style="color:rgba(255,255,255,0.4);font-size:13px;line-height:normal">-</span>';
    return;
  }
  list.innerHTML = items.map(item =>
    `<div style="display:flex;align-items:center;gap:6px;line-height:normal">` +
    `<span style="display:inline-block;width:6px;height:6px;border-radius:50%;background:#fb923c;flex-shrink:0"></span>` +
    `<span style="line-height:normal">${item}</span></div>`
  ).join('');
}

function _updateSiteInfoOverlay() {
  const addrText = document.getElementById('map-address-text');
  if (addrText) addrText.textContent = _getSiteAddress(currentDashSite) || '-';
  // 편집 아이콘: 115st만 표시
  const editIcon = document.getElementById('address-edit-icon');
  const chip = document.getElementById('map-address-chip');
  const editable = _SITE_ADDR_EDITABLE[currentDashSite];
  if (editIcon) editIcon.style.display = editable ? 'inline' : 'none';
  if (chip) chip.style.cursor = editable ? 'pointer' : 'default';
  const siteId = currentDashSite;
  try { _gasExposureCache[siteId] = JSON.parse(localStorage.getItem(`_gasexposure_${siteId}`) || '[]'); }
  catch { _gasExposureCache[siteId] = []; }
  _renderGasExposureList(siteId);
}

window._syncGasExposureForSite = async function(siteId) {
  try {
    const rows = await fetchAllPipeSettings();
    const key = `_gasexposure_${siteId}`;
    if (rows[key]?.colors?.items) {
      _gasExposureCache[siteId] = rows[key].colors.items;
      localStorage.setItem(`_gasexposure_${siteId}`, JSON.stringify(rows[key].colors.items));
    } else {
      try { _gasExposureCache[siteId] = JSON.parse(localStorage.getItem(`_gasexposure_${siteId}`) || '[]'); }
      catch { _gasExposureCache[siteId] = []; }
    }
  } catch {
    try { _gasExposureCache[siteId] = JSON.parse(localStorage.getItem(`_gasexposure_${siteId}`) || '[]'); }
    catch { _gasExposureCache[siteId] = []; }
  }
  _renderGasExposureList(siteId);
};

window.openGasExposureModal = function() {
  const items = _gasExposureCache[currentDashSite] || [];
  const ta = document.getElementById('gas-items-textarea');
  if (ta) ta.value = items.join('\n');
  const modal = document.getElementById('gas-exposure-modal');
  if (modal) modal.style.display = 'flex';
};

window.closeGasExposureModal = function() {
  const modal = document.getElementById('gas-exposure-modal');
  if (modal) modal.style.display = 'none';
};

window.saveGasExposure = async function() {
  const ta = document.getElementById('gas-items-textarea');
  if (!ta) return;
  const items = ta.value.split('\n').map(l => l.trim()).filter(Boolean);
  const siteId = currentDashSite;
  _gasExposureCache[siteId] = items;
  localStorage.setItem(`_gasexposure_${siteId}`, JSON.stringify(items));
  try { await upsertPipeSettings(`_gasexposure_${siteId}`, { colors: { items } }); }
  catch(e) { console.warn('gas exposure save failed:', e); }
  _renderGasExposureList(siteId);
  closeGasExposureModal();
};

// ===== 드론사진 =====
let _dronePhotos = [];
let _droneViewOpen = false;

// ── 드론 그리기 ──────────────────────────────────────────────
const DRONE_DRAW_KEY = 'drone_draw_v1';
let _drawMode   = null;        // null | 'pen' | 'eraser'
let _drawColor  = '#ef4444';
let _drawSize   = 4;
let _droneStrokes = {};        // { [path]: [{tool,color,size,pts:[{x,y}]}] }
try { _droneStrokes = JSON.parse(localStorage.getItem(DRONE_DRAW_KEY) || '{}'); } catch {}

// 배관/밸브 오버레이 모드 (선언은 여기서 — 초기화는 오버레이 블록에서)
let _overlayMode = null;

function _saveDroneDrawStrokes() {
  localStorage.setItem(DRONE_DRAW_KEY, JSON.stringify(_droneStrokes));
}

function _drawStrokesOnCanvas(canvas, path) {
  const ctx = canvas.getContext('2d');
  const W = canvas.width, H = canvas.height;
  ctx.clearRect(0, 0, W, H);
  (_droneStrokes[path] || []).forEach(s => {
    if (!s.pts.length) return;
    ctx.save();
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    if (s.tool === 'eraser') {
      ctx.globalCompositeOperation = 'destination-out';
      ctx.strokeStyle = 'rgba(0,0,0,1)';
      ctx.lineWidth = (s.size || 4) * 4;
    } else {
      ctx.globalCompositeOperation = 'source-over';
      ctx.strokeStyle = s.color || '#ef4444';
      ctx.lineWidth = s.size || 4;
    }
    ctx.beginPath();
    if (s.pts.length === 1) {
      ctx.arc(s.pts[0].x * W, s.pts[0].y * H, ctx.lineWidth / 2, 0, Math.PI * 2);
      ctx.fillStyle = ctx.strokeStyle;
      ctx.fill();
    } else {
      ctx.moveTo(s.pts[0].x * W, s.pts[0].y * H);
      s.pts.slice(1).forEach(p => ctx.lineTo(p.x * W, p.y * H));
      ctx.stroke();
    }
    ctx.restore();
  });
}

function _initDroneCanvas(canvas) {
  const path = canvas.dataset.path;
  const img  = canvas.parentElement.querySelector('img');
  const setup = () => {
    const w = img.offsetWidth, h = img.offsetHeight;
    if (w && h) { canvas.width = w; canvas.height = h; }
    _drawStrokesOnCanvas(canvas, path);
  };
  if (img.complete && img.naturalHeight) setup();
  else img.addEventListener('load', setup, { once: true });

  let drawing = false, curStroke = null;
  canvas.addEventListener('pointerdown', e => {
    if (!_drawMode) return;
    e.preventDefault();
    canvas.setPointerCapture(e.pointerId);
    drawing = true;
    const r = canvas.getBoundingClientRect();
    const pt = { x: (e.clientX - r.left) / r.width, y: (e.clientY - r.top) / r.height };
    curStroke = { tool: _drawMode, color: _drawColor, size: _drawSize, pts: [pt] };
    if (!_droneStrokes[path]) _droneStrokes[path] = [];
    _droneStrokes[path].push(curStroke);
    _drawStrokesOnCanvas(canvas, path);
  });
  canvas.addEventListener('pointermove', e => {
    if (!drawing || !curStroke) return;
    const r = canvas.getBoundingClientRect();
    curStroke.pts.push({ x: (e.clientX - r.left) / r.width, y: (e.clientY - r.top) / r.height });
    _drawStrokesOnCanvas(canvas, path);
  });
  canvas.addEventListener('pointerup', () => { if (drawing) { drawing = false; curStroke = null; _saveDroneDrawStrokes(); } });
  canvas.addEventListener('pointercancel', () => { drawing = false; curStroke = null; });
}

function _updateDrawToolUI() {
  const penBtn    = document.getElementById('draw-pen-btn');
  const eraserBtn = document.getElementById('draw-eraser-btn');
  if (penBtn)    { penBtn.style.background = _drawMode === 'pen' ? '#0d2b5e' : '#fff'; penBtn.style.color = _drawMode === 'pen' ? '#fff' : ''; penBtn.style.borderColor = _drawMode === 'pen' ? '#0d2b5e' : '#cbd5e1'; }
  if (eraserBtn) { eraserBtn.style.background = _drawMode === 'eraser' ? '#0d2b5e' : '#fff'; eraserBtn.style.color = _drawMode === 'eraser' ? '#fff' : ''; eraserBtn.style.borderColor = _drawMode === 'eraser' ? '#0d2b5e' : '#cbd5e1'; }
  document.querySelectorAll('.draw-color-btn').forEach(btn => {
    btn.style.boxShadow = btn.dataset.color === _drawColor ? '0 0 0 3px #0d2b5e' : '0 0 0 1px #cbd5e1';
  });
  const activeDraw = _drawMode && !_overlayMode;
  document.querySelectorAll('.drone-canvas').forEach(c => {
    c.style.pointerEvents = activeDraw ? 'all' : 'none';
    c.style.cursor = activeDraw ? 'crosshair' : '';
  });
}

let _drawToolbarOpen = false;

window._toggleDrawToolbar = function() {
  _drawToolbarOpen = !_drawToolbarOpen;
  const toolbar   = document.getElementById('drone-draw-toolbar');
  const toggleBtn = document.getElementById('draw-toggle-btn');
  if (toolbar)   toolbar.style.display = _drawToolbarOpen ? '' : 'none';
  if (toggleBtn) { toggleBtn.style.background = _drawToolbarOpen ? '#0d2b5e' : '#fff'; toggleBtn.style.color = _drawToolbarOpen ? '#fff' : '#475569'; toggleBtn.style.borderColor = _drawToolbarOpen ? '#0d2b5e' : '#cbd5e1'; }
  if (!_drawToolbarOpen) { _drawMode = null; _updateDrawToolUI(); }
};

window._setDrawTool = function(tool) {
  _drawMode = _drawMode === tool ? null : tool;
  if (_drawMode && _overlayMode) { _overlayMode = null; _updateOverlayUI(); }
  _updateDrawToolUI();
};

window._setDrawColor = function(color) {
  _drawColor = color;
  if (_drawMode !== 'pen') _drawMode = 'pen';
  _updateDrawToolUI();
};

window._setDrawSize = function(size) {
  _drawSize = size;
  const label = document.getElementById('draw-size-label');
  if (label) label.textContent = size + 'px';
};

window._clearAllDroneDrawings = function() {
  if (!confirm('현재 현장의 모든 드론사진 그림을 지울까요?')) return;
  _dronePhotos.forEach(p => delete _droneStrokes[p.path]);
  _saveDroneDrawStrokes();
  document.querySelectorAll('.drone-canvas').forEach(c => {
    const ctx = c.getContext('2d');
    ctx.clearRect(0, 0, c.width, c.height);
  });
};

// ===== 맵 그림판 =====
const MAP_DRAW_KEY = 'map_draw_v1';
window._mapDrawMode = null;   // null | 'pen' | 'eraser'
let _mapDrawColor  = '#ef4444';
let _mapDrawSize   = 4;
let _mapStrokes    = {};      // { [siteId]: [{tool,color,size,pts:[{x,y}]}] }
try { _mapStrokes = JSON.parse(localStorage.getItem(MAP_DRAW_KEY) || '{}'); } catch {}

function _saveMapStrokes() {
  localStorage.setItem(MAP_DRAW_KEY, JSON.stringify(_mapStrokes));
}

function _redrawMapCanvas() {
  const canvas = document.getElementById('map-draw-canvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const W = canvas.width, H = canvas.height;
  ctx.clearRect(0, 0, W, H);
  const strokes = _mapStrokes[currentDashSite] || [];
  strokes.forEach(s => {
    if (!s.pts.length) return;
    ctx.save();
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    if (s.tool === 'eraser') {
      ctx.globalCompositeOperation = 'destination-out';
      ctx.strokeStyle = 'rgba(0,0,0,1)';
      ctx.lineWidth = (s.size || 4) * 4;
    } else {
      ctx.globalCompositeOperation = 'source-over';
      ctx.strokeStyle = s.color || '#ef4444';
      ctx.lineWidth = s.size || 4;
    }
    ctx.beginPath();
    if (s.pts.length === 1) {
      ctx.arc(s.pts[0].x * W, s.pts[0].y * H, ctx.lineWidth / 2, 0, Math.PI * 2);
      ctx.fillStyle = ctx.strokeStyle;
      ctx.fill();
    } else {
      ctx.moveTo(s.pts[0].x * W, s.pts[0].y * H);
      s.pts.slice(1).forEach(p => ctx.lineTo(p.x * W, p.y * H));
      ctx.stroke();
    }
    ctx.restore();
  });
}

window._initMapCanvas = function() {
  const canvas = document.getElementById('map-draw-canvas');
  const img    = document.getElementById('map-img');
  if (!canvas || !img) return;
  canvas.width  = img.offsetWidth  || img.naturalWidth  || 800;
  canvas.height = img.offsetHeight || img.naturalHeight || 600;
  _redrawMapCanvas();

  // 이미 이벤트 달려있으면 중복 방지
  if (canvas._drawInited) return;
  canvas._drawInited = true;

  let drawing = false, curStroke = null;
  canvas.addEventListener('pointerdown', e => {
    if (!window._mapDrawMode) return;
    e.preventDefault();
    canvas.setPointerCapture(e.pointerId);
    drawing = true;
    const r = canvas.getBoundingClientRect();
    const pt = { x: (e.clientX - r.left) / r.width, y: (e.clientY - r.top) / r.height };
    curStroke = { tool: window._mapDrawMode, color: _mapDrawColor, size: _mapDrawSize, pts: [pt] };
    if (!_mapStrokes[currentDashSite]) _mapStrokes[currentDashSite] = [];
    _mapStrokes[currentDashSite].push(curStroke);
    _redrawMapCanvas();
  });
  canvas.addEventListener('pointermove', e => {
    if (!drawing || !curStroke) return;
    const r = canvas.getBoundingClientRect();
    curStroke.pts.push({ x: (e.clientX - r.left) / r.width, y: (e.clientY - r.top) / r.height });
    _redrawMapCanvas();
  });
  canvas.addEventListener('pointerup', () => {
    if (!drawing) return;
    drawing = false; curStroke = null;
    _saveMapStrokes();
  });
  canvas.addEventListener('pointercancel', () => { drawing = false; curStroke = null; });
};

function _updateMapDrawUI() {
  const penBtn    = document.getElementById('map-pen-btn');
  const eraserBtn = document.getElementById('map-eraser-btn');
  const canvas    = document.getElementById('map-draw-canvas');
  if (penBtn)    { penBtn.style.background = window._mapDrawMode === 'pen' ? '#0d2b5e' : '#fff'; penBtn.style.color = window._mapDrawMode === 'pen' ? '#fff' : ''; penBtn.style.borderColor = window._mapDrawMode === 'pen' ? '#0d2b5e' : '#cbd5e1'; }
  if (eraserBtn) { eraserBtn.style.background = window._mapDrawMode === 'eraser' ? '#0d2b5e' : '#fff'; eraserBtn.style.color = window._mapDrawMode === 'eraser' ? '#fff' : ''; eraserBtn.style.borderColor = window._mapDrawMode === 'eraser' ? '#0d2b5e' : '#cbd5e1'; }
  document.querySelectorAll('.map-color-btn').forEach(btn => {
    btn.style.boxShadow = btn.dataset.color === _mapDrawColor ? '0 0 0 3px #0d2b5e' : '0 0 0 1px #cbd5e1';
  });
  if (canvas) {
    canvas.style.pointerEvents = window._mapDrawMode ? 'all' : 'none';
    canvas.style.cursor = window._mapDrawMode ? 'crosshair' : '';
    canvas.style.touchAction = window._mapDrawMode ? 'none' : '';
  }
}

let _mapDrawToolbarOpen = false;

window._toggleMapDraw = function() {
  _mapDrawToolbarOpen = !_mapDrawToolbarOpen;
  const toolbar   = document.getElementById('map-draw-toolbar');
  const toggleBtn = document.getElementById('map-draw-toggle-btn');
  if (toolbar)   toolbar.style.display = _mapDrawToolbarOpen ? '' : 'none';
  if (toggleBtn) { toggleBtn.style.background = _mapDrawToolbarOpen ? '#0d2b5e' : ''; toggleBtn.style.color = _mapDrawToolbarOpen ? '#fff' : ''; }
  if (!_mapDrawToolbarOpen) { window._mapDrawMode = null; _updateMapDrawUI(); }
};

window._setMapDrawTool = function(tool) {
  window._mapDrawMode = window._mapDrawMode === tool ? null : tool;
  _updateMapDrawUI();
};

window._setMapDrawColor = function(color) {
  _mapDrawColor = color;
  if (window._mapDrawMode !== 'pen') window._mapDrawMode = 'pen';
  _updateMapDrawUI();
};

window._setMapDrawSize = function(size) {
  _mapDrawSize = size;
  const label = document.getElementById('map-draw-size-label');
  if (label) label.textContent = size + 'px';
};

window._clearMapDrawing = function() {
  if (!confirm('이 현장의 맵 그림을 모두 지울까요?')) return;
  delete _mapStrokes[currentDashSite];
  _saveMapStrokes();
  _redrawMapCanvas();
};

// ── 드론 순서 ─────────────────────────────────────────────────
let _droneReorderMode = false;

function _getDroneOrder(siteId) {
  try { return JSON.parse(localStorage.getItem(`drone_order_v1_${siteId}`) || '[]'); } catch { return []; }
}

function _saveDroneOrder(siteId) {
  localStorage.setItem(`drone_order_v1_${siteId}`, JSON.stringify(_dronePhotos.map(p => p.path)));
}

function _applyDroneOrder(photos, siteId) {
  const order = _getDroneOrder(siteId);
  if (!order.length) return photos;
  const ordered = order.map(p => photos.find(ph => ph.path === p)).filter(Boolean);
  const rest = photos.filter(ph => !order.includes(ph.path));
  return [...ordered, ...rest];
}

window._toggleDroneReorder = function() {
  _droneReorderMode = !_droneReorderMode;
  const btn = document.getElementById('drone-reorder-btn');
  if (btn) {
    btn.style.background = _droneReorderMode ? '#0d2b5e' : '#fff';
    btn.style.color = _droneReorderMode ? '#fff' : '#475569';
    btn.style.borderColor = _droneReorderMode ? '#0d2b5e' : '#cbd5e1';
    btn.textContent = _droneReorderMode ? '✓ 완료' : '⇅ 순서 변경';
  }
  _renderDroneList();
};

window._moveDronePhoto = function(index, dir) {
  const newIdx = index + dir;
  if (newIdx < 0 || newIdx >= _dronePhotos.length) return;
  [_dronePhotos[index], _dronePhotos[newIdx]] = [_dronePhotos[newIdx], _dronePhotos[index]];
  _saveDroneOrder(currentDashSite);
  _renderDroneList();
};

// ── 슬라이드쇼 ────────────────────────────────────────────────
let _droneSlideIndex = 0;
let _slideCanvasReady = false;
let _droneSubTab = 'drone';

function _initSlideCanvas() {
  if (_slideCanvasReady) return;
  _slideCanvasReady = true;
  const canvas = document.getElementById('drone-slide-canvas');
  const img    = document.getElementById('drone-slide-img');
  if (!canvas || !img) return;
  img.addEventListener('load', () => {
    const w = img.offsetWidth, h = img.offsetHeight;
    canvas.width  = w; canvas.height = h;
    _drawStrokesOnCanvas(canvas, canvas.dataset.path);
    const oc = document.getElementById('drone-overlay-canvas');
    if (oc) { oc.width = w; oc.height = h; _renderOverlayCanvas(oc, oc.dataset.path); }
  });
  let drawing = false, curStroke = null;
  canvas.addEventListener('pointerdown', e => {
    if (!_drawMode) return;
    const path = canvas.dataset.path;
    e.preventDefault();
    canvas.setPointerCapture(e.pointerId);
    drawing = true;
    const r = canvas.getBoundingClientRect();
    const pt = { x: (e.clientX - r.left) / r.width, y: (e.clientY - r.top) / r.height };
    curStroke = { tool: _drawMode, color: _drawColor, size: _drawSize, pts: [pt] };
    if (!_droneStrokes[path]) _droneStrokes[path] = [];
    _droneStrokes[path].push(curStroke);
    _drawStrokesOnCanvas(canvas, path);
  });
  canvas.addEventListener('pointermove', e => {
    if (!drawing || !curStroke) return;
    const path = canvas.dataset.path;
    const r = canvas.getBoundingClientRect();
    curStroke.pts.push({ x: (e.clientX - r.left) / r.width, y: (e.clientY - r.top) / r.height });
    _drawStrokesOnCanvas(canvas, path);
  });
  canvas.addEventListener('pointerup',     () => { if (drawing) { drawing = false; curStroke = null; _saveDroneDrawStrokes(); } });
  canvas.addEventListener('pointercancel', () => { drawing = false; curStroke = null; });
}

// ── 드론 배관/밸브 오버레이 ───────────────────────────────────
let _droneOverlay   = {};
let _overlayVisible = true;
let _overlayEditOpen = false;
// _overlayMode declared above with draw vars
let _overlayColor   = '#3b82f6';
let _overlayWidth   = 6;
let _overlayCanvasReady = false;
let _pipeStart      = null;
let _lastOverlayType = null;

function _overlayKey(siteId) { return `drone_overlay_v1_${siteId}`; }

function _loadOverlayData(siteId) {
  try { _droneOverlay = JSON.parse(localStorage.getItem(_overlayKey(siteId)) || '{}'); } catch { _droneOverlay = {}; }
}

function _saveOverlayData() {
  localStorage.setItem(_overlayKey(currentDashSite), JSON.stringify(_droneOverlay));
}

function _renderOverlayCanvas(canvas, path) {
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  if (!_overlayVisible || !path || !_droneOverlay[path]) return;
  const W = canvas.width, H = canvas.height;
  const data = _droneOverlay[path];

  (data.pipes || []).forEach(p => {
    ctx.save();
    ctx.strokeStyle = p.color || '#3b82f6';
    ctx.lineWidth   = p.width || 6;
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(p.x1 * W, p.y1 * H);
    ctx.lineTo(p.x2 * W, p.y2 * H);
    ctx.stroke();
    ctx.restore();
  });

  (data.valves || []).forEach(v => {
    const x = v.x * W, y = v.y * H, r = v.size || 10;
    ctx.save();
    // diamond shape
    ctx.beginPath();
    ctx.moveTo(x,     y - r);
    ctx.lineTo(x + r, y);
    ctx.lineTo(x,     y + r);
    ctx.lineTo(x - r, y);
    ctx.closePath();
    ctx.fillStyle   = v.color || '#ef4444';
    ctx.fill();
    ctx.strokeStyle = '#fff';
    ctx.lineWidth   = 2;
    ctx.stroke();
    // cross inside
    ctx.beginPath();
    ctx.moveTo(x - r * 0.45, y); ctx.lineTo(x + r * 0.45, y);
    ctx.moveTo(x, y - r * 0.45); ctx.lineTo(x, y + r * 0.45);
    ctx.stroke();
    ctx.restore();
  });
}

function _syncOverlayCanvasSize() {
  const oc  = document.getElementById('drone-overlay-canvas');
  const img = document.getElementById('drone-slide-img');
  if (!oc || !img) return;
  if (img.offsetWidth > 0) { oc.width = img.offsetWidth; oc.height = img.offsetHeight; }
}

function _initOverlayCanvas() {
  if (_overlayCanvasReady) return;
  _overlayCanvasReady = true;
  const canvas = document.getElementById('drone-overlay-canvas');
  if (!canvas) return;

  canvas.addEventListener('pointerdown', e => {
    if (!_overlayMode) return;
    e.preventDefault();
    canvas.setPointerCapture(e.pointerId);
    const r  = canvas.getBoundingClientRect();
    const nx = (e.clientX - r.left) / r.width;
    const ny = (e.clientY - r.top)  / r.height;
    if (_overlayMode === 'valve') {
      const path = canvas.dataset.path;
      if (!_droneOverlay[path]) _droneOverlay[path] = { pipes: [], valves: [] };
      _droneOverlay[path].valves.push({ x: nx, y: ny, color: _overlayColor, size: _overlayWidth + 6 });
      _lastOverlayType = 'valve';
      _saveOverlayData();
      _renderOverlayCanvas(canvas, path);
    } else if (_overlayMode === 'pipe') {
      _pipeStart = { x: nx, y: ny };
    }
  });

  canvas.addEventListener('pointermove', e => {
    if (_overlayMode !== 'pipe' || !_pipeStart) return;
    const r  = canvas.getBoundingClientRect();
    const nx = (e.clientX - r.left) / r.width;
    const ny = (e.clientY - r.top)  / r.height;
    _renderOverlayCanvas(canvas, canvas.dataset.path);
    const ctx = canvas.getContext('2d');
    ctx.save();
    ctx.strokeStyle = _overlayColor; ctx.lineWidth = _overlayWidth; ctx.lineCap = 'round';
    ctx.setLineDash([8, 4]);
    ctx.beginPath();
    ctx.moveTo(_pipeStart.x * canvas.width, _pipeStart.y * canvas.height);
    ctx.lineTo(nx * canvas.width, ny * canvas.height);
    ctx.stroke();
    ctx.restore();
  });

  canvas.addEventListener('pointerup', e => {
    if (_overlayMode !== 'pipe' || !_pipeStart) return;
    const r  = canvas.getBoundingClientRect();
    const nx = (e.clientX - r.left) / r.width;
    const ny = (e.clientY - r.top)  / r.height;
    const dx = Math.abs(nx - _pipeStart.x), dy = Math.abs(ny - _pipeStart.y);
    if (dx > 0.01 || dy > 0.01) {
      const path = canvas.dataset.path;
      if (!_droneOverlay[path]) _droneOverlay[path] = { pipes: [], valves: [] };
      _droneOverlay[path].pipes.push({ x1: _pipeStart.x, y1: _pipeStart.y, x2: nx, y2: ny, color: _overlayColor, width: _overlayWidth });
      _lastOverlayType = 'pipe';
      _saveOverlayData();
    }
    _pipeStart = null;
    _renderOverlayCanvas(canvas, canvas.dataset.path);
  });

  canvas.addEventListener('pointercancel', () => { _pipeStart = null; });
}

function _updateOverlayUI() {
  const pipeBtn  = document.getElementById('overlay-pipe-btn');
  const valveBtn = document.getElementById('overlay-valve-btn');
  if (pipeBtn)  { pipeBtn.style.background  = _overlayMode === 'pipe'  ? '#0d2b5e' : '#fff'; pipeBtn.style.color  = _overlayMode === 'pipe'  ? '#fff' : ''; pipeBtn.style.borderColor  = _overlayMode === 'pipe'  ? '#0d2b5e' : '#cbd5e1'; }
  if (valveBtn) { valveBtn.style.background = _overlayMode === 'valve' ? '#0d2b5e' : '#fff'; valveBtn.style.color = _overlayMode === 'valve' ? '#fff' : ''; valveBtn.style.borderColor = _overlayMode === 'valve' ? '#0d2b5e' : '#cbd5e1'; }
  document.querySelectorAll('.ov-color-btn').forEach(btn => {
    btn.style.boxShadow = btn.dataset.color === _overlayColor ? '0 0 0 3px #0d2b5e' : '0 0 0 1px #cbd5e1';
  });
  const oc = document.getElementById('drone-overlay-canvas');
  const fc = document.getElementById('drone-slide-canvas');
  if (oc) { oc.style.pointerEvents = _overlayMode ? 'all' : 'none'; oc.style.cursor = _overlayMode ? 'crosshair' : ''; }
  if (fc) { fc.style.pointerEvents = (_drawMode && !_overlayMode) ? 'all' : 'none'; fc.style.cursor = (_drawMode && !_overlayMode) ? 'crosshair' : ''; }
}

window._toggleOverlayToolbar = function() {
  _overlayEditOpen = !_overlayEditOpen;
  const toolbar = document.getElementById('drone-overlay-toolbar');
  const btn     = document.getElementById('overlay-edit-btn');
  if (toolbar) toolbar.style.display = _overlayEditOpen ? '' : 'none';
  if (btn) { btn.style.background = _overlayEditOpen ? '#0d2b5e' : '#fff'; btn.style.color = _overlayEditOpen ? '#fff' : '#475569'; btn.style.borderColor = _overlayEditOpen ? '#0d2b5e' : '#cbd5e1'; }
  if (!_overlayEditOpen) { _overlayMode = null; _updateOverlayUI(); }
};

window._setOverlayTool = function(tool) {
  _overlayMode = _overlayMode === tool ? null : tool;
  if (_overlayMode && _drawMode) { _drawMode = null; _updateDrawToolUI(); }
  _updateOverlayUI();
};

window._setOverlayColor = function(color) {
  _overlayColor = color;
  _updateOverlayUI();
};

window._setOverlayWidth = function(w) {
  _overlayWidth = w;
  const label = document.getElementById('overlay-width-label');
  if (label) label.textContent = w + 'px';
};

window._toggleOverlayVisible = function() {
  _overlayVisible = !_overlayVisible;
  const btn = document.getElementById('overlay-visible-btn');
  if (btn) { btn.textContent = _overlayVisible ? '👁 ON' : '👁 OFF'; btn.style.color = _overlayVisible ? '#475569' : '#9ca3af'; }
  const canvas = document.getElementById('drone-overlay-canvas');
  if (!canvas) return;
  if (_overlayVisible) { _syncOverlayCanvasSize(); _renderOverlayCanvas(canvas, canvas.dataset.path); }
  else { const ctx = canvas.getContext('2d'); ctx.clearRect(0, 0, canvas.width, canvas.height); }
};

window._undoLastOverlay = function() {
  const canvas = document.getElementById('drone-overlay-canvas');
  if (!canvas) return;
  const path = canvas.dataset.path;
  if (!_droneOverlay[path]) return;
  const d = _droneOverlay[path];
  if (_lastOverlayType === 'valve' && d.valves && d.valves.length) d.valves.pop();
  else if (_lastOverlayType === 'pipe'  && d.pipes  && d.pipes.length)  d.pipes.pop();
  else if (d.valves && d.valves.length) d.valves.pop();
  else if (d.pipes  && d.pipes.length)  d.pipes.pop();
  _saveOverlayData();
  _renderOverlayCanvas(canvas, path);
};

window._clearCurrentOverlay = function() {
  const canvas = document.getElementById('drone-overlay-canvas');
  if (!canvas) return;
  const path = canvas.dataset.path;
  if (!path || !_droneOverlay[path]) return;
  if (!confirm('이 사진의 배관/밸브를 모두 지울까요?')) return;
  delete _droneOverlay[path];
  _saveOverlayData();
  _renderOverlayCanvas(canvas, path);
};

function _renderDroneSlide() {
  _initSlideCanvas();
  _initOverlayCanvas();
  const empty   = document.getElementById('drone-slide-empty');
  const content = document.getElementById('drone-slide-content');
  if (!_dronePhotos.length) {
    if (empty)   empty.style.display = '';
    if (content) content.style.display = 'none';
    return;
  }
  if (empty)   empty.style.display = 'none';
  if (content) content.style.display = '';
  _droneSlideIndex = Math.max(0, Math.min(_droneSlideIndex, _dronePhotos.length - 1));
  const p      = _dronePhotos[_droneSlideIndex];
  const img    = document.getElementById('drone-slide-img');
  const fc     = document.getElementById('drone-slide-canvas');
  const oc     = document.getElementById('drone-overlay-canvas');
  fc.dataset.path = p.path;
  if (oc) oc.dataset.path = p.path;
  img.src = p.url;
  if (img.complete && img.naturalHeight) {
    const w = img.offsetWidth, h = img.offsetHeight;
    if (w > 0 && h > 0) {
      fc.width = w; fc.height = h;
      if (oc) { oc.width = w; oc.height = h; }
    }
    _drawStrokesOnCanvas(fc, p.path);
    if (oc) _renderOverlayCanvas(oc, p.path);
  }
  document.getElementById('drone-slide-counter').textContent = `${_droneSlideIndex + 1} / ${_dronePhotos.length}장`;
  document.getElementById('slide-prev-btn').disabled = _droneSlideIndex === 0;
  document.getElementById('slide-next-btn').disabled = _droneSlideIndex === _dronePhotos.length - 1;
  _updateDrawToolUI();
  _updateOverlayUI();
}

window._slideMove = function(dir) {
  _droneSlideIndex = Math.max(0, Math.min(_droneSlideIndex + dir, _dronePhotos.length - 1));
  _renderDroneSlide();
};

window._deleteCurrDronePhoto = function() {
  if (!_dronePhotos.length) return;
  deleteDronePhoto(_dronePhotos[_droneSlideIndex].path);
};

window._moveCurrDroneToConstr = async function() {
  if (!_dronePhotos.length) return;
  const p = _dronePhotos[_droneSlideIndex];
  const btn = document.querySelector('button[onclick="_moveCurrDroneToConstr()"]');
  if (btn) btn.textContent = '이동 중...';
  try {
    await moveDroneToConstr(p.path, currentDashSite);
    const remaining = _getDroneOrder(currentDashSite).filter(op => op !== p.path);
    localStorage.setItem(`drone_order_v1_${currentDashSite}`, JSON.stringify(remaining));
    [_dronePhotos, _constrPhotos] = await Promise.all([
      listDronePhotos(currentDashSite).catch(() => []),
      listConstrPhotos(currentDashSite).catch(() => []),
    ]);
    _dronePhotos = _applyDroneOrder(_dronePhotos, currentDashSite);
    if (_droneSlideIndex >= _dronePhotos.length) _droneSlideIndex = Math.max(0, _dronePhotos.length - 1);
    _renderDroneList();
  } catch(e) {
    alert('이동 실패: ' + e.message);
    if (btn) btn.textContent = '📷 공사사진으로 이동';
  }
};

// ── 서브탭 ────────────────────────────────────────────────────
window.showDroneSubTab = function(tab) {
  _droneSubTab = tab;
  const isDrone = tab === 'drone';
  const dp = document.getElementById('drone-panel');
  const cp = document.getElementById('constr-panel');
  if (dp) dp.style.display = isDrone ? '' : 'none';
  if (cp) cp.style.display = isDrone ? 'none' : '';
  const db = document.getElementById('subtab-drone');
  const cb = document.getElementById('subtab-constr');
  if (db) { db.style.color = isDrone ? '#0d2b5e' : '#6b7280'; db.style.borderBottomColor = isDrone ? '#0d2b5e' : 'transparent'; db.style.fontWeight = isDrone ? '700' : '600'; }
  if (cb) { cb.style.color = isDrone ? '#6b7280' : '#0d2b5e'; cb.style.borderBottomColor = isDrone ? 'transparent' : '#0d2b5e'; cb.style.fontWeight = isDrone ? '600' : '700'; }
  if (tab === 'constr') _renderConstrGrid();
};

// ── 드론 리스트 렌더 (슬라이드 or 순서변경 리스트) ───────────
function _renderDroneList() {
  const label = document.getElementById('drone-count-label');
  if (label) label.textContent = _dronePhotos.length ? `총 ${_dronePhotos.length}장` : '';

  if (_droneReorderMode) {
    document.getElementById('drone-slide-view').style.display = 'none';
    const reorderList = document.getElementById('drone-reorder-list');
    reorderList.style.display = '';
    if (!_dronePhotos.length) {
      reorderList.innerHTML = '<div style="text-align:center;color:#9ca3af;padding:24px 0;font-size:13px">드론사진이 없습니다</div>';
      return;
    }
    const n = _dronePhotos.length;
    reorderList.innerHTML = _dronePhotos.map((p, i) => `
      <div style="display:flex;align-items:center;gap:8px;padding:7px 0;border-bottom:1px solid #f1f5f9">
        <span style="font-size:11px;color:#9ca3af;width:18px;text-align:right;flex-shrink:0">${i+1}</span>
        <img src="${p.url}" style="width:48px;height:48px;object-fit:cover;border-radius:4px;flex-shrink:0">
        <div style="flex:1;min-width:0;font-size:11px;color:#6b7280;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${p.path.split('/').pop().replace(/^\d+_/, '')}</div>
        <div style="display:flex;flex-direction:column;gap:2px;flex-shrink:0">
          <button onclick="_moveDronePhoto(${i},-1)" ${i===0?'disabled':''}
            style="width:28px;height:22px;border-radius:4px;border:1px solid #cbd5e1;font-size:11px;line-height:1;cursor:${i===0?'default':'pointer'};background:${i===0?'#f9fafb':'#fff'};color:${i===0?'#d1d5db':'#374151'}">▲</button>
          <button onclick="_moveDronePhoto(${i},1)" ${i===n-1?'disabled':''}
            style="width:28px;height:22px;border-radius:4px;border:1px solid #cbd5e1;font-size:11px;line-height:1;cursor:${i===n-1?'default':'pointer'};background:${i===n-1?'#f9fafb':'#fff'};color:${i===n-1?'#d1d5db':'#374151'}">▼</button>
        </div>
      </div>`).join('');
  } else {
    document.getElementById('drone-reorder-list').style.display = 'none';
    document.getElementById('drone-slide-view').style.display = '';
    _renderDroneSlide();
  }
}

async function initDroneView() {
  try {
    [_dronePhotos, _constrPhotos] = await Promise.all([
      listDronePhotos(currentDashSite).catch(() => []),
      listConstrPhotos(currentDashSite).catch(() => []),
    ]);
  } catch(e) { _dronePhotos = []; _constrPhotos = []; }
  _dronePhotos = _applyDroneOrder(_dronePhotos, currentDashSite);
  _loadOverlayData(currentDashSite);
  _droneReorderMode = false;
  _droneSlideIndex  = 0;
  _overlayMode      = null;
  const btn = document.getElementById('drone-reorder-btn');
  if (btn) { btn.style.background = '#fff'; btn.style.color = '#475569'; btn.style.borderColor = '#cbd5e1'; btn.textContent = '⇅ 순서 변경'; }
  if (_droneViewOpen) {
    showDroneSubTab(_droneSubTab || 'drone');
    _renderDroneList();
  }
}

window.toggleDroneView = function() {
  _droneViewOpen = !_droneViewOpen;
  const btn      = document.getElementById('drone-toggle-btn');
  const mapCont  = document.getElementById('map-container');
  const mapNoImg = document.getElementById('map-no-image');
  const droneView = document.getElementById('drone-view');
  if (_droneViewOpen) {
    mapCont.style.display  = 'none';
    mapNoImg.style.display = 'none';
    droneView.style.display = '';
    if (btn) { btn.style.background = '#0d2b5e'; btn.style.color = '#fff'; btn.style.borderColor = '#0d2b5e'; }
    showDroneSubTab(_droneSubTab || 'drone');
    _renderDroneList();
  } else {
    mapCont.style.display  = '';
    mapNoImg.style.display = '';
    droneView.style.display = 'none';
    if (btn) { btn.style.background = ''; btn.style.color = ''; btn.style.borderColor = ''; }
  }
};

window.handleDroneUpload = async function(input) {
  const files = Array.from(input.files);
  if (!files.length) return;
  const addBtn = document.querySelector('#drone-panel button:last-of-type');
  if (addBtn) addBtn.textContent = '업로드 중...';
  try {
    for (const f of files) await uploadDronePhoto(f, currentDashSite);
    _dronePhotos = _applyDroneOrder(await listDronePhotos(currentDashSite), currentDashSite);
    _renderDroneList();
  } catch(e) { alert('업로드 실패: ' + e.message); }
  finally { if (addBtn) addBtn.textContent = '+ 사진 추가'; input.value = ''; }
};

window.deleteDronePhoto = async function(path) {
  if (!confirm('이 드론사진을 삭제할까요?')) return;
  try {
    await deleteDronePhotoStorage(path);
    const remaining = _getDroneOrder(currentDashSite).filter(p => p !== path);
    localStorage.setItem(`drone_order_v1_${currentDashSite}`, JSON.stringify(remaining));
    _dronePhotos = _applyDroneOrder(await listDronePhotos(currentDashSite), currentDashSite);
    if (_droneSlideIndex >= _dronePhotos.length) _droneSlideIndex = Math.max(0, _dronePhotos.length - 1);
    _renderDroneList();
  } catch(e) { alert('삭제 실패: ' + e.message); }
};

// ── 공사사진 ──────────────────────────────────────────────────
let _constrPhotos = [];
let _constrSize   = 180;

window._setConstrSize = function(size) {
  _constrSize = size;
  const label = document.getElementById('constr-size-label');
  if (label) label.textContent = size + 'px';
  document.querySelectorAll('.constr-thumb').forEach(el => {
    el.style.width  = size + 'px';
    el.style.height = size + 'px';
  });
};

function _renderConstrGrid() {
  const grid = document.getElementById('constr-grid');
  if (!grid) return;
  if (!_constrPhotos.length) {
    grid.innerHTML = '<div style="text-align:center;color:#9ca3af;padding:32px 0;font-size:13px;width:100%">공사사진이 없습니다<br><small>위 + 버튼으로 추가하세요</small></div>';
    return;
  }
  const s = _constrSize;
  grid.innerHTML = _constrPhotos.map((p, i) => {
    const safePath = p.path.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
    return `<div class="constr-thumb" onclick="openConstrLightbox(${i})"
      style="width:${s}px;height:${s}px;border-radius:8px;overflow:hidden;cursor:zoom-in;
        background:#e2e8f0;flex-shrink:0;position:relative;box-shadow:0 1px 4px rgba(0,0,0,0.1)">
      <img src="${p.url}" style="width:100%;height:100%;object-fit:cover;display:block">
      <button onclick="event.stopPropagation();deleteConstrPhoto('${safePath}')"
        style="position:absolute;top:4px;right:4px;width:22px;height:22px;border-radius:50%;border:none;
          background:rgba(239,68,68,0.85);color:#fff;font-size:12px;cursor:pointer;line-height:1;padding:0">✕</button>
    </div>`;
  }).join('');
}

window.handleConstrUpload = async function(input) {
  const files = Array.from(input.files);
  if (!files.length) return;
  const addBtn = document.querySelector('#constr-panel button');
  if (addBtn) addBtn.textContent = '업로드 중...';
  try {
    for (const f of files) await uploadConstrPhoto(f, currentDashSite);
    _constrPhotos = await listConstrPhotos(currentDashSite);
    _renderConstrGrid();
  } catch(e) { alert('업로드 실패: ' + e.message); }
  finally { input.value = ''; if (addBtn) addBtn.textContent = '+ 사진 추가'; }
};

window.deleteConstrPhoto = async function(path) {
  if (!confirm('이 공사사진을 삭제할까요?')) return;
  try {
    await deleteConstrPhotoStorage(path);
    _constrPhotos = await listConstrPhotos(currentDashSite);
    _renderConstrGrid();
  } catch(e) { alert('삭제 실패: ' + e.message); }
};

// ── 라이트박스 확장 (공사사진 내비게이션) ────────────────────
let _lbPhotos = null;
let _lbIndex  = 0;

function _applyLbNav() {
  document.getElementById('lightbox-img').src = _lbPhotos[_lbIndex].url;
  document.getElementById('lb-prev').disabled = _lbIndex === 0;
  document.getElementById('lb-next').disabled = _lbIndex === _lbPhotos.length - 1;
}

window.openConstrLightbox = function(index) {
  _lbPhotos = _constrPhotos;
  _lbIndex  = index;
  _applyLbNav();
  document.getElementById('lightbox').style.display = 'flex';
  document.getElementById('lb-prev').style.display = '';
  document.getElementById('lb-next').style.display = '';
};

window._lbMove = function(dir) {
  if (!_lbPhotos) return;
  _lbIndex = Math.max(0, Math.min(_lbIndex + dir, _lbPhotos.length - 1));
  _applyLbNav();
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
  if (typeof _syncZoneForSite === 'function') _syncZoneForSite();
  if (typeof window._syncGasExposureForSite === 'function') window._syncGasExposureForSite(currentDashSite);
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
  _lbPhotos = null;
  img.src = url;
  lb.style.display = 'flex';
  const prev = document.getElementById('lb-prev');
  const next = document.getElementById('lb-next');
  if (prev) prev.style.display = 'none';
  if (next) next.style.display = 'none';
}
function closeLightbox() {
  const lb = document.getElementById('lightbox');
  if (lb) lb.style.display = 'none';
  _lbPhotos = null;
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
