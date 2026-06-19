// ===== 배관 위치도 인터랙션 =====

let _mapReady    = false;
let _mapNatW     = 0;
let _mapNatH     = 0;
let _activePipeId = null;
let _sectionPick  = null; // { segId, step:'start'|'end'|'confirm', startM,startT, fromM,toM,fromT,toT, color }
const PIPE_SETTINGS_KEY = 'sg2_pipe_settings';
const ZONE_KEY = 'sg2_construction_zone';
let _zoneEdit     = false;
let _zoneEditPts  = [];
let _entranceEdit = false;

// ── 초기화 ────────────────────────────────────────────────────
function initMap() {
  const img = document.getElementById('map-img');
  if (!img) return;

  if (_mapReady) {
    renderAllPipes();
    return;
  }

  const doSetup = () => {
    if (!img.naturalWidth) return;
    _mapNatW = img.naturalWidth;
    _mapNatH = img.naturalHeight;

    document.getElementById('map-img').style.display     = 'block';
    document.getElementById('map-no-image').style.display = 'none';

    const svg = document.getElementById('map-svg');
    svg.setAttribute('viewBox', `0 0 ${_mapNatW} ${_mapNatH}`);

    _mapReady = true;
    renderAllPipes();
    _setupMapDocListener();
    _syncSettingsFromSupabase();
    _updateZoneBtn(); // Supabase에서 최신 설정 로드
  };

  if (img.complete) {
    doSetup();
  } else {
    img.addEventListener('load',  doSetup,       { once: true });
    img.addEventListener('error', () => {
      document.getElementById('map-no-image').style.display = 'block';
    }, { once: true });
  }
}

function _setupMapDocListener() {
  document.addEventListener('click', (e) => {
    if (_sectionPick) return; // 구간 선택 중엔 팝업 닫기 차단
    if (
      !e.target.closest('#pipe-popup') &&
      !e.target.closest('.pipe-group') &&
      !e.target.closest('#color-modal')
    ) {
      hidePipePopup();
    }
  });
}

// ── SVG 렌더링 ────────────────────────────────────────────────
function renderAllPipes() {
  const svg = document.getElementById('map-svg');
  if (!svg || !_mapReady) return;
  svg.innerHTML = '';

  // 글로우 필터 정의
  const defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
  const blur = _mapNatW / 500;
  defs.innerHTML = `
    <filter id="pipe-glow" x="-80%" y="-80%" width="260%" height="260%">
      <feGaussianBlur in="SourceGraphic" stdDeviation="${blur}" result="b"/>
      <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
    </filter>`;
  svg.appendChild(defs);

  PIPELINE_SEGMENTS.forEach(seg => svg.appendChild(_buildPipeGroup(seg)));
  _renderConstructionZone();
  _renderLabels();
  _renderValves();
  _renderExposedLabels();
  _drawPickMarkers(); // 구간 선택 마커 (pick mode 중에만 표시)
}

// 해당 파이프 위에 있는 밸브들의 fraction 목록 반환 (오름차순)
function _valveFractionsOnPipe(seg) {
  if (typeof VALVE_POSITIONS === 'undefined' || !VALVE_POSITIONS.length) return [];
  const threshold = _mapNatW / 30; // 화면 너비의 1/30 픽셀 이내면 파이프 위로 판단
  return VALVE_POSITIONS
    .map(v => {
      const t = _closestFractionOnPolyline(seg.points, v.x, v.y);
      const [cx, cy] = _pointAtFraction(seg.points, t);
      const dist = Math.hypot(cx - v.x, cy - v.y);
      return dist < threshold ? t : null;
    })
    .filter(t => t !== null)
    .sort((a, b) => a - b);
}

function _buildPipeGroup(seg) {
  const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
  g.setAttribute('class', 'pipe-group');
  g.setAttribute('data-pipe-id', seg.id);
  g.style.cursor = 'pointer';

  const lineW = Math.max(3, _mapNatW / 200);
  const hitW  = lineW * 7;

  const saved = _getSegmentColors(seg.id);
  const segs  = saved.매달기구간 ?? seg.매달기구간;

  if (segs.length === 0 || seg.노출길이 === 0) {
    const line = _mkPolyline(seg.points, seg.color, lineW, 'pipe-line');
    line.dataset.baseWidth = lineW;
    g.appendChild(line);
  } else {
    // 매달기구간 기반 분할 렌더링 (밸브 위치에서 클리핑)
    const L = seg.노출길이;
    const valveTs = _valveFractionsOnPipe(seg); // 0~1 fraction

    // 컬러 구간을 밸브 직전까지 클리핑
    const clipped = segs.map(s => {
      let toT = s.to / L;
      for (const vt of valveTs) {
        if (vt > s.from / L && vt < toT) toT = vt;
      }
      return { ...s, to: parseFloat((toT * L).toFixed(2)) };
    }).filter(s => s.to > s.from);

    const sorted = [...clipped].sort((a, b) => a.from - b.from);
    const full = [];
    let cur = 0;
    for (const s of sorted) {
      if (s.from > cur) full.push({ from: cur, to: s.from, color: seg.color });
      full.push(s);
      cur = s.to;
    }
    if (cur < L) full.push({ from: cur, to: L, color: seg.color });

    for (const s of full) {
      const pts  = _pxSubpath(seg.points, s.from / L, s.to / L);
      const line = _mkPolyline(pts, s.color, lineW, 'pipe-line');
      line.dataset.baseWidth = lineW;
      g.appendChild(line);
    }
  }

  // 히트 영역 (넓고 투명)
  const hit = _mkPolyline(seg.points, 'transparent', hitW, 'pipe-hit');
  hit.setAttribute('stroke-opacity', '0');
  hit.style.pointerEvents = 'stroke';
  g.appendChild(hit);

  g.addEventListener('mouseenter', () => _onPipeHover(seg.id, true));
  g.addEventListener('mouseleave', () => _onPipeHover(seg.id, false));
  g.addEventListener('click', (e) => { e.stopPropagation(); _onPipeClick(seg.id, e); });

  return g;
}

function _mkPolyline(points, color, width, cls) {
  const el = document.createElementNS('http://www.w3.org/2000/svg', 'polyline');
  el.setAttribute('points', points.map(p => p.join(',')).join(' '));
  el.setAttribute('fill', 'none');
  el.setAttribute('stroke', color);
  el.setAttribute('stroke-width', width);
  el.setAttribute('stroke-linecap', 'round');
  el.setAttribute('stroke-linejoin', 'round');
  if (cls) el.setAttribute('class', cls);
  return el;
}

// ── 호버 이펙트 ───────────────────────────────────────────────
function _onPipeHover(segId, enter) {
  const g = document.querySelector(`.pipe-group[data-pipe-id="${segId}"]`);
  if (!g) return;
  const seg = PIPELINE_SEGMENTS.find(s => s.id === segId);

  if (enter) {
    g.setAttribute('filter', 'url(#pipe-glow)');
    g.querySelectorAll('.pipe-line').forEach(el => {
      const base = parseFloat(el.dataset.baseWidth);
      el.setAttribute('stroke-width', base * 1.7);
    });
  } else {
    g.removeAttribute('filter');
    g.querySelectorAll('.pipe-line').forEach(el => {
      el.setAttribute('stroke-width', el.dataset.baseWidth);
    });
  }
}

// ── 클릭 → 팝업 ──────────────────────────────────────────────
function _onPipeClick(segId, e) {
  // 구간 선택 모드: 대상 배관만 처리
  if (_sectionPick) {
    if (_sectionPick.segId === segId) _handleSectionPick(segId, e);
    return;
  }
  const seg = PIPELINE_SEGMENTS.find(s => s.id === segId);
  if (!seg) return;
  _activePipeId = segId;
  _showPipePopup(seg, e);
}

function _showPipePopup(seg, e) {
  const container = document.getElementById('map-container');
  const rect      = container.getBoundingClientRect();
  const popup     = document.getElementById('pipe-popup');

  const saved = _getSegmentColors(seg.id);
  const segs  = saved.매달기구간 ?? seg.매달기구간;
  const L     = seg.노출길이;

  let madalkiHtml = '';
  if (L > 0 && segs.length > 0) {
    const sorted = [...segs].sort((a, b) => a.from - b.from);
    const barParts = [];
    let cur = 0;
    for (const s of sorted) {
      if (s.from > cur) barParts.push({ from: cur, to: s.from, color: '#374151' });
      barParts.push(s);
      cur = s.to;
    }
    if (cur < L) barParts.push({ from: cur, to: L, color: '#374151' });
    const done = parseFloat(segs.reduce((acc, s) => acc + (s.to - s.from), 0).toFixed(1));
    const pct  = Math.round(done / L * 100);
    madalkiHtml = `
      <div class="pp-madalki">
        <div class="pp-bar-label">매달기 현황 <span class="pp-bar-pct">${pct}%</span></div>
        <div class="pp-bar">
          ${barParts.map(s => `<div style="width:${(s.to - s.from) / L * 100}%;background:${s.color}"></div>`).join('')}
        </div>
        <div class="pp-bar-sub">${done}m / ${L}m 완료</div>
      </div>`;
  }

  // 구간별 사진 or 배관 전체 사진
  let photoHtml = '';
  if (L > 0 && segs.length > 0) {
    // 구간별 사진 목록
    const subsegList = segs.map(s => {
      const subId = s.id || (s.from + '_' + s.to);
      const rep   = _getRepPhoto(seg.id, subId);
      return `
        <div class="pp-subseg-item" onclick="openPhotoModal('${seg.id}','${subId}')">
          <div class="pp-subseg-header">
            <span class="pp-subseg-dot" style="background:${s.color}"></span>
            <span>${s.from}m ~ ${s.to}m</span>
            <span class="pp-subseg-photo-hint">${rep ? '📷' : '📷 없음'}</span>
          </div>
          ${rep
            ? `<img src="${rep.url}" class="pp-photo-img-sm">`
            : `<div class="pp-photo-placeholder-sm">탭하여 사진 추가</div>`}
        </div>`;
    }).join('');
    photoHtml = `<div class="pp-subseg-list">${subsegList}</div>`;
  } else {
    // 구간 미설정 시 배관 전체 사진
    const rep = _getRepPhoto(seg.id, '_pipe');
    photoHtml = `
      <div class="pp-photo-area" onclick="openPhotoModal('${seg.id}','_pipe')">
        ${rep
          ? `<img src="${rep.url}" class="pp-photo-img">`
          : `<div class="pp-photo-placeholder">📷 사진 없음 — 탭하여 추가</div>`}
      </div>`;
  }

  popup.innerHTML = `
    <div class="pp-header">
      <div class="pp-dot" style="background:${seg.color}"></div>
      <div class="pp-name">${seg.name}</div>
      <button class="pp-close" onclick="hidePipePopup()">✕</button>
    </div>
    <div class="pp-body">
      <div class="pp-row"><span>현장</span><span>${seg.site}</span></div>
      <div class="pp-row"><span>관경</span><span>${seg.관경 || '-'}</span></div>
      <div class="pp-row"><span>노출길이</span><span>${L > 0 ? L + 'm' : '-'}</span></div>
      ${madalkiHtml}
      ${photoHtml}
    </div>
    <div class="pp-footer pp-footer-col">
      ${L > 0 ? `
      <div class="pp-footer-row">
        <button class="pp-btn-pick" onclick="startSectionPick('${seg.id}')">🗺️ 구간 선택</button>
        <button class="pp-btn-mgr"  onclick="openColorModal('${seg.id}')">📋 목록 관리</button>
      </div>` : ''}
      <button class="pp-btn-photo" onclick="openPhotoModal('${seg.id}','_pipe')">📷 배관 전체 사진</button>
    </div>
  `;

  popup.style.display = 'block';

  // position:fixed 기준 뷰포트 좌표로 계산
  let x = e.clientX + 14;
  let y = e.clientY - 14;
  popup.style.left = x + 'px';
  popup.style.top  = y + 'px';

  requestAnimationFrame(() => {
    const pw = popup.offsetWidth;
    const ph = popup.offsetHeight;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    if (x + pw > vw - 8) x = e.clientX - pw - 14;
    if (y + ph > vh - 8) y = vh - ph - 8;
    if (y < 8) y = 8;
    if (x < 8) x = 8;
    popup.style.left = x + 'px';
    popup.style.top  = y + 'px';
  });
}

function hidePipePopup() {
  const popup = document.getElementById('pipe-popup');
  if (popup) popup.style.display = 'none';
  _activePipeId = null;
}

// ── 색상 설정 모달 ────────────────────────────────────────────
function openColorModal(segId) {
  const seg = PIPELINE_SEGMENTS.find(s => s.id === segId);
  if (!seg) return;
  hidePipePopup();

  const saved  = _getSegmentColors(segId);
  let   cmSegs = JSON.parse(JSON.stringify(saved.매달기구간 ?? seg.매달기구간));

  const modal     = document.getElementById('color-modal');
  const titleEl   = document.getElementById('cm-title');
  const segsEl    = document.getElementById('cm-segs');

  titleEl.textContent = `구간 설정 — ${seg.name} (노출길이 ${seg.노출길이}m)`;

  function renderRows() {
    if (cmSegs.length === 0) {
      segsEl.innerHTML = '<div class="cm-empty">아래 버튼으로 구간을 추가하세요.</div>';
    } else {
      segsEl.innerHTML = cmSegs.map((s, i) => `
        <div class="cm-row" data-index="${i}" data-ssid="${s.id || ''}">
          <input type="number" class="cm-from" value="${s.from}"
            min="0" max="${seg.노출길이}" step="0.5" placeholder="시작(m)">
          <span class="cm-sep">~</span>
          <input type="number" class="cm-to" value="${s.to}"
            min="0" max="${seg.노출길이}" step="0.5" placeholder="끝(m)">
          <span class="cm-unit">m</span>
          <input type="color" class="cm-color" value="${s.color}">
          <button class="cm-del" data-idx="${i}">✕</button>
        </div>
      `).join('');

      segsEl.querySelectorAll('.cm-del').forEach(btn => {
        btn.addEventListener('click', () => {
          cmSegs.splice(parseInt(btn.dataset.idx), 1);
          renderRows();
        });
      });
    }
  }

  renderRows();
  modal.style.display = 'flex';

  // 버튼 이벤트: cloneNode로 이전 리스너 제거
  ['cm-add', 'cm-save', 'cm-cancel', 'cm-x'].forEach(id => {
    const el = document.getElementById(id);
    const clone = el.cloneNode(true);
    el.parentNode.replaceChild(clone, el);
  });

  document.getElementById('cm-add').addEventListener('click', () => {
    const last = cmSegs[cmSegs.length - 1];
    const from = last ? last.to : 0;
    const to   = Math.min(from + 5, seg.노출길이);
    cmSegs.push({ id: _makeSubSegId(), from, to, color: '#f59e0b' });
    renderRows();
  });

  document.getElementById('cm-save').addEventListener('click', () => {
    const newSegs = [];
    document.querySelectorAll('.cm-row').forEach(row => {
      const from  = parseFloat(row.querySelector('.cm-from').value);
      const to    = parseFloat(row.querySelector('.cm-to').value);
      const color = row.querySelector('.cm-color').value;
      if (!isNaN(from) && !isNaN(to) && to > from) {
        // 기존 ID 보존, 없으면 새로 생성
        const existingId = row.dataset.ssid || _makeSubSegId();
        newSegs.push({ id: existingId, from, to, color });
      }
    });
    _saveSegmentColors(segId, { 매달기구간: newSegs });
    modal.style.display = 'none';
    renderAllPipes();
  });

  ['cm-cancel', 'cm-x'].forEach(id => {
    document.getElementById(id).addEventListener('click', () => {
      modal.style.display = 'none';
    });
  });

  // 모달 배경 클릭 시 닫기
  modal.onclick = (e) => { if (e.target === modal) modal.style.display = 'none'; };
}

// ── 설정 읽기/쓰기 (localStorage 캐시 + Supabase 동기화) ──────
function _getSegmentColors(segId) {
  try {
    return JSON.parse(localStorage.getItem(PIPE_SETTINGS_KEY) || '{}')[segId] || {};
  } catch { return {}; }
}

function _saveSegmentColors(segId, data) {
  try {
    const all = JSON.parse(localStorage.getItem(PIPE_SETTINGS_KEY) || '{}');
    all[segId] = data;
    localStorage.setItem(PIPE_SETTINGS_KEY, JSON.stringify(all));
  } catch {}
  upsertPipeSettings(segId, { colors: data }).catch(() => {});
}

// 앱 시작 시 Supabase에서 설정 로드 → localStorage 덮어쓰기
async function _syncSettingsFromSupabase() {
  try {
    const rows = await fetchAllPipeSettings();
    const colorsAll = {}, photosAll = {};
    Object.values(rows).forEach(row => {
      if (row.colors)    colorsAll[row.seg_id] = row.colors;
      if (row.rep_photo) photosAll[row.seg_id] = row.rep_photo; // { [subSegId]: {url,path} }
    });
    if (rows['_zone']?.colors)
      localStorage.setItem(ZONE_KEY, JSON.stringify(rows['_zone'].colors));
    delete colorsAll['_zone'];
    if (Object.keys(colorsAll).length)
      localStorage.setItem(PIPE_SETTINGS_KEY, JSON.stringify(colorsAll));
    if (Object.keys(photosAll).length)
      localStorage.setItem(PIPE_PHOTO_KEY, JSON.stringify(photosAll));
    renderAllPipes();
  } catch(e) {
    console.warn('Supabase 동기화 실패, 로컬 캐시 사용:', e);
  }
}

// ── 경로 보간 ─────────────────────────────────────────────────
function _pxSubpath(points, t0, t1) {
  const segLens = [];
  for (let i = 1; i < points.length; i++) {
    segLens.push(Math.hypot(points[i][0] - points[i-1][0], points[i][1] - points[i-1][1]));
  }
  const total = segLens.reduce((a, b) => a + b, 0);
  if (total === 0) return [[...points[0]], [...points[0]]];

  const interpAt = (t) => {
    let target = t * total, cum = 0;
    for (let i = 0; i < segLens.length; i++) {
      if (target <= cum + segLens[i] + 1e-9) {
        const f = segLens[i] > 0 ? (target - cum) / segLens[i] : 0;
        return [
          points[i][0] + (points[i+1][0] - points[i][0]) * f,
          points[i][1] + (points[i+1][1] - points[i][1]) * f
        ];
      }
      cum += segLens[i];
    }
    return [...points[points.length - 1]];
  };

  const result = [interpAt(t0)];
  let cum = 0;
  for (let i = 0; i < segLens.length; i++) {
    cum += segLens[i];
    const t = cum / total;
    if (t > t0 + 1e-9 && t < t1 - 1e-9) result.push([...points[i + 1]]);
  }
  result.push(interpAt(t1));
  return result;
}

// ── 사진 관리 ─────────────────────────────────────────────────
const PIPE_PHOTO_KEY = 'sg2_pipe_rep_photo';

function _makeSubSegId() {
  return 'ss' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
}

// rep photo: { [segId]: { [subSegId]: {url, path} } }
function _getRepPhoto(segId, subSegId) {
  try {
    return (JSON.parse(localStorage.getItem(PIPE_PHOTO_KEY) || '{}')[segId] || {})[subSegId] || null;
  } catch { return null; }
}
function _setRepPhoto(segId, subSegId, url, path) {
  try {
    const all = JSON.parse(localStorage.getItem(PIPE_PHOTO_KEY) || '{}');
    if (!all[segId]) all[segId] = {};
    all[segId][subSegId] = { url, path };
    localStorage.setItem(PIPE_PHOTO_KEY, JSON.stringify(all));
  } catch {}
  // Supabase: rep_photo 전체 업데이트
  try {
    const all = JSON.parse(localStorage.getItem(PIPE_PHOTO_KEY) || '{}');
    upsertPipeSettings(segId, { rep_photo: all[segId] || {} }).catch(() => {});
  } catch {}
}
function _clearRepPhoto(segId, subSegId, path) {
  try {
    const all = JSON.parse(localStorage.getItem(PIPE_PHOTO_KEY) || '{}');
    if (all[segId]?.[subSegId]?.path === path) delete all[segId][subSegId];
    localStorage.setItem(PIPE_PHOTO_KEY, JSON.stringify(all));
    upsertPipeSettings(segId, { rep_photo: all[segId] || {} }).catch(() => {});
  } catch {}
}

let _photoModalSegId  = null;
let _photoModalSubId  = null;

function openPhotoModal(segId, subSegId) {
  _photoModalSegId = segId;
  _photoModalSubId = subSegId || '_pipe';
  const seg = PIPELINE_SEGMENTS.find(s => s.id === segId);
  const saved = _getSegmentColors(segId);
  const segs  = saved.매달기구간 ?? [];
  const sub   = segs.find(s => s.id === _photoModalSubId);
  let title = seg ? seg.name : segId;
  if (sub) title += ` (${sub.from}m~${sub.to}m)`;
  document.getElementById('pm-title').textContent = title + ' 사진';
  document.getElementById('photo-modal').style.display = 'flex';
  _renderPhotoGrid(segId, _photoModalSubId);
}

function openLightbox(encodedUrl) {
  const lb = document.getElementById('lightbox');
  document.getElementById('lightbox-img').src = decodeURIComponent(encodedUrl);
  lb.style.display = 'flex';
}
function closeLightbox() {
  document.getElementById('lightbox').style.display = 'none';
  document.getElementById('lightbox-img').src = '';
}

function closePhotoModal() {
  document.getElementById('photo-modal').style.display = 'none';
  _photoModalSegId = null;
}

async function _renderPhotoGrid(segId, subSegId) {
  const body = document.getElementById('pm-body');
  body.innerHTML = '<div class="pm-empty">불러오는 중...</div>';
  try {
    const photos = await listPipePhotos(segId, subSegId);
    const rep    = _getRepPhoto(segId, subSegId);
    if (!photos.length) {
      body.innerHTML = '<div class="pm-empty">📷 첨부된 사진이 없습니다<br><small>아래 버튼으로 추가하세요</small></div>';
      return;
    }
    body.innerHTML = `<div class="pm-grid">${photos.map(p => {
      const isRep = rep && rep.path === p.path;
      const ep    = encodeURIComponent(p.path);
      const ess   = encodeURIComponent(subSegId);
      const eu    = encodeURIComponent(p.url);
      return `
        <div class="pm-photo-item ${isRep ? 'pm-rep' : ''}">
          <img src="${p.url}" onclick="openLightbox('${eu}')" style="cursor:zoom-in">
          <div class="pm-photo-actions">
            <button class="${isRep ? 'pm-btn-rep-active' : 'pm-btn-rep'}" title="대표사진"
              onclick="setRepPhoto('${segId}','${ess}','${p.url}','${ep}')">★</button>
            <button class="pm-btn-del" title="삭제"
              onclick="deletePhoto('${segId}','${ess}','${ep}')">✕</button>
          </div>
        </div>`;
    }).join('')}</div>`;
  } catch(e) {
    body.innerHTML = `<div class="pm-empty" style="color:#ef4444">⚠️ ${e.message}<br><small>Supabase Storage 'pipe-photos' 버킷(Public)이 있는지 확인하세요</small></div>`;
  }
}

function setRepPhoto(segId, encodedSubId, url, encodedPath) {
  const subSegId = decodeURIComponent(encodedSubId);
  const path     = decodeURIComponent(encodedPath);
  _setRepPhoto(segId, subSegId, url, path);
  _renderPhotoGrid(segId, subSegId);
  // 팝업 썸네일 즉시 교체
  _refreshPopupPhoto(segId, subSegId, url);
}

async function deletePhoto(segId, encodedSubId, encodedPath) {
  if (!confirm('이 사진을 삭제할까요?')) return;
  const subSegId = decodeURIComponent(encodedSubId);
  const path     = decodeURIComponent(encodedPath);
  try {
    await deletePipePhotoStorage(path);
    _clearRepPhoto(segId, subSegId, path);
    _renderPhotoGrid(segId, subSegId);
    if (!_getRepPhoto(segId, subSegId)) _refreshPopupPhoto(segId, subSegId, null);
  } catch(e) { alert('삭제 오류: ' + e.message); }
}

async function handlePhotoUpload(input) {
  const segId    = _photoModalSegId;
  const subSegId = _photoModalSubId;
  if (!segId || !input.files.length) return;
  const body = document.getElementById('pm-body');
  body.innerHTML = '<div class="pm-empty">업로드 중...</div>';
  try {
    const existing = await listPipePhotos(segId, subSegId);
    let firstUrl, firstPath;
    for (const file of input.files) {
      const { path, url } = await uploadPipePhoto(segId, file, subSegId);
      if (!existing.length && !firstUrl) { firstUrl = url; firstPath = path; }
    }
    if (firstUrl && !_getRepPhoto(segId, subSegId)) {
      _setRepPhoto(segId, subSegId, firstUrl, firstPath);
      _refreshPopupPhoto(segId, subSegId, firstUrl);
    }
    input.value = '';
    _renderPhotoGrid(segId, subSegId);
  } catch(e) {
    alert('업로드 오류: ' + e.message);
    _renderPhotoGrid(segId, subSegId);
  }
}

function _refreshPopupPhoto(segId, subSegId, url) {
  if (subSegId === '_pipe') {
    const area = document.querySelector('.pp-photo-area');
    if (!area) return;
    area.innerHTML = url
      ? `<img src="${url}" class="pp-photo-img">`
      : `<div class="pp-photo-placeholder">📷 사진 없음 — 탭하여 추가</div>`;
  } else {
    // 구간별 썸네일 업데이트
    const items = document.querySelectorAll('.pp-subseg-item');
    const saved = _getSegmentColors(segId);
    const segs  = saved.매달기구간 ?? [];
    items.forEach((el, i) => {
      if (segs[i]?.id === subSegId) {
        const prev = el.querySelector('.pp-photo-img-sm, .pp-photo-placeholder-sm');
        if (prev) prev.outerHTML = url
          ? `<img src="${url}" class="pp-photo-img-sm">`
          : `<div class="pp-photo-placeholder-sm">탭하여 사진 추가</div>`;
        const hint = el.querySelector('.pp-subseg-photo-hint');
        if (hint) hint.textContent = url ? '📷' : '📷 없음';
      }
    });
  }
}

// ── 유틸 ──────────────────────────────────────────────────────
function _hexAlpha(hex, alpha) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

function _pointAtFraction(points, t) {
  const segLens = [];
  for (let i = 1; i < points.length; i++)
    segLens.push(Math.hypot(points[i][0]-points[i-1][0], points[i][1]-points[i-1][1]));
  const total = segLens.reduce((a, b) => a + b, 0);
  if (total === 0) return [...points[0]];
  let target = Math.max(0, Math.min(1, t)) * total, cum = 0;
  for (let i = 0; i < segLens.length; i++) {
    if (target <= cum + segLens[i] + 1e-9) {
      const f = segLens[i] > 0 ? (target - cum) / segLens[i] : 0;
      return [points[i][0]+(points[i+1][0]-points[i][0])*f, points[i][1]+(points[i+1][1]-points[i][1])*f];
    }
    cum += segLens[i];
  }
  return [...points[points.length-1]];
}

function _closestFractionOnPolyline(points, px, py) {
  const segLens = [];
  for (let i = 1; i < points.length; i++)
    segLens.push(Math.hypot(points[i][0]-points[i-1][0], points[i][1]-points[i-1][1]));
  const total = segLens.reduce((a, b) => a + b, 0);
  if (total === 0) return 0;
  let bestDist = Infinity, bestT = 0, cum = 0;
  for (let i = 0; i < segLens.length; i++) {
    const dx = points[i+1][0]-points[i][0], dy = points[i+1][1]-points[i][1];
    const len2 = dx*dx + dy*dy;
    const tSeg = len2 > 0
      ? Math.max(0, Math.min(1, ((px-points[i][0])*dx + (py-points[i][1])*dy) / len2))
      : 0;
    const cx = points[i][0]+dx*tSeg, cy = points[i][1]+dy*tSeg;
    const dist = Math.hypot(cx-px, cy-py);
    if (dist < bestDist) { bestDist = dist; bestT = (cum + tSeg*segLens[i]) / total; }
    cum += segLens[i];
  }
  return bestT;
}

function _renderExposedLabels() {
  const svg = document.getElementById('map-svg');
  if (!svg) return;
  const fs  = Math.max(14, _mapNatW / 90);
  const pad = fs * 0.5;
  const arr = fs * 0.9;

  PIPELINE_SEGMENTS.forEach(seg => {
    if (!seg.노출길이) return;
    const saved = _getSegmentColors(seg.id);
    const segs  = saved.매달기구간 ?? seg.매달기구간;
    if (!segs.length) return;

    const valveTs = _valveFractionsOnPipe(seg);
    segs.forEach(s => {
      const L = seg.노출길이;
      let toClipped = s.to / L;
      for (const vt of valveTs) {
        if (vt > s.from / L && vt < toClipped) toClipped = vt;
      }
      const midFrac = (s.from / L + toClipped) / 2;
      const [px, py] = _pointAtFraction(seg.points, midFrac);
      const labelText = `노출중(${parseFloat((s.to - s.from).toFixed(1))}m)`;
      const tw = labelText.length * fs * 0.68 + pad * 2;
      const th = fs + pad * 1.2;

      // 근처 밸브 확인 → 겹치면 배지 수평 이동
      let offsetX = 0;
      if (typeof VALVE_POSITIONS !== 'undefined') {
        VALVE_POSITIONS.forEach(v => {
          if (Math.abs(v.x - px) < tw * 1.8 && Math.abs(v.y - py) < fs * 8) {
            offsetX = v.x <= px ? tw * 0.9 : -tw * 0.9;
          }
        });
      }
      const cx = px + offsetX; // 배지 중심 x
      const bx = cx - tw / 2;
      const by = py - th - arr - fs * 0.6;

      // 화살표: 배지 바닥 양쪽 → 배관 실제 위치(px,py)를 정확히 가리킴
      const tri = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
      tri.setAttribute('points',
        `${px},${py} ${cx - arr * 0.55},${by + th} ${cx + arr * 0.55},${by + th}`);
      tri.setAttribute('fill', s.color);
      svg.appendChild(tri);

      // 배경 rect
      const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
      rect.setAttribute('x', bx); rect.setAttribute('y', by);
      rect.setAttribute('width', tw); rect.setAttribute('height', th);
      rect.setAttribute('rx', fs * 0.35);
      rect.setAttribute('fill', s.color);
      rect.setAttribute('fill-opacity', '0.92');
      svg.appendChild(rect);

      // 텍스트
      const txt = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      txt.setAttribute('x', cx); txt.setAttribute('y', by + th * 0.73);
      txt.setAttribute('text-anchor', 'middle');
      txt.setAttribute('fill', '#1a1a1a');
      txt.setAttribute('font-size', fs);
      txt.setAttribute('font-weight', '800');
      txt.textContent = labelText;
      svg.appendChild(txt);
    });
  });
}

// ── 공사구역 ──────────────────────────────────────────────────
function _loadZoneData() {
  try { return JSON.parse(localStorage.getItem(ZONE_KEY) || '{"points":[],"visible":false}'); }
  catch { return { points: [], visible: false }; }
}
function _saveZoneData(data) {
  localStorage.setItem(ZONE_KEY, JSON.stringify(data));
  upsertPipeSettings('_zone', { colors: data }).catch(() => {});
}

function toggleZoneVisible() {
  const d = _loadZoneData();
  d.visible = !d.visible;
  _saveZoneData(d);
  renderAllPipes();
  _updateZoneBtn();
}
function _updateZoneBtn() {
  const d = _loadZoneData();
  const btn = document.getElementById('zone-toggle-btn');
  if (btn) btn.textContent = d.visible ? '🚧 공사구역 숨기기' : '🚧 공사구역 표시';
}

function toggleCtrlGroup(id) {
  const el = document.getElementById(id);
  const isOpen = el.style.display !== 'none';
  el.style.display = isOpen ? 'none' : 'flex';
  const arrowId = id === 'onoff-group' ? 'onoff-arrow' : 'edit-arrow';
  const arrow = document.getElementById(arrowId);
  if (arrow) arrow.textContent = isOpen ? '▸' : '▾';
}

function toggleDirBadges() {
  const els = document.querySelectorAll('.map-dir');
  const isVisible = els[0] && els[0].style.display !== 'none';
  const next = isVisible ? 'none' : '';
  els.forEach(el => el.style.display = next);
  const btn = document.getElementById('dir-toggle-btn');
  if (btn) btn.textContent = isVisible ? '◀▶ 방향 표시' : '◀▶ 방향 숨기기';
}

function startZoneEdit() {
  const d = _loadZoneData();
  _zoneEditPts = [...d.points];
  _zoneEdit = true;
  document.getElementById('zone-toggle-bar').style.display = 'none';
  document.getElementById('zone-edit-bar').style.display  = 'flex';
  document.getElementById('zone-click-overlay').style.display = 'block';
  renderAllPipes();
}
function cancelZoneEdit() {
  _zoneEdit = false;
  _zoneEditPts = [];
  document.getElementById('zone-toggle-bar').style.display = 'flex';
  document.getElementById('zone-edit-bar').style.display  = 'none';
  document.getElementById('zone-click-overlay').style.display = 'none';
  renderAllPipes();
}
function saveZone() {
  const d = _loadZoneData();
  if (_zoneEdit) d.points = _zoneEditPts;
  d.visible = true;
  _saveZoneData(d);
  if (_zoneEdit) cancelZoneEdit();
  if (_entranceEdit) cancelEntranceEdit();
  _updateZoneBtn();
}
function clearZonePoints() {
  _zoneEditPts = [];
  renderAllPipes();
}
function undoZonePoint() {
  _zoneEditPts.pop();
  renderAllPipes();
}

function _onZoneOverlayClick(e) {
  const img  = document.getElementById('map-img');
  const rect = img.getBoundingClientRect();
  const x = Math.round((e.clientX - rect.left) * (_mapNatW / img.clientWidth));
  const y = Math.round((e.clientY - rect.top)  * (_mapNatH / img.clientHeight));

  if (_entranceEdit) {
    // 기존 마커 근처 클릭 → 삭제
    const d = _loadZoneData();
    const threshold = Math.max(20, _mapNatW / 80);
    const idx = (d.entrances || []).findIndex(e => Math.hypot(e.x - x, e.y - y) < threshold);
    if (idx >= 0) {
      d.entrances.splice(idx, 1);
    } else {
      if (!d.entrances) d.entrances = [];
      d.entrances.push({ x, y });
    }
    localStorage.setItem(ZONE_KEY, JSON.stringify(d));
  } else {
    _zoneEditPts.push([x, y]);
  }
  renderAllPipes();
}

function startEntranceEdit() {
  _entranceEdit = true;
  document.getElementById('zone-toggle-bar').style.display    = 'none';
  document.getElementById('entrance-edit-bar').style.display  = 'flex';
  document.getElementById('zone-click-overlay').style.display = 'block';
  const d = _loadZoneData();
  d.visible = true;
  localStorage.setItem(ZONE_KEY, JSON.stringify(d));
  _updateZoneBtn();
  renderAllPipes();
}
function cancelEntranceEdit() {
  _entranceEdit = false;
  document.getElementById('zone-toggle-bar').style.display    = 'flex';
  document.getElementById('entrance-edit-bar').style.display  = 'none';
  document.getElementById('zone-click-overlay').style.display = 'none';
  renderAllPipes();
}

function _renderConstructionZone() {
  const svg = document.getElementById('map-svg');
  if (!svg) return;
  const sw = Math.max(3, _mapNatW / 350);

  if (_zoneEdit) {
    const pts = _zoneEditPts;
    // 편집 중 폴리곤 (점선)
    if (pts.length >= 2) {
      const poly = document.createElementNS('http://www.w3.org/2000/svg', 'polyline');
      poly.setAttribute('points', [...pts, pts[0]].map(p => p.join(',')).join(' '));
      poly.setAttribute('fill', 'rgba(251,146,60,0.12)');
      poly.setAttribute('stroke', '#f97316');
      poly.setAttribute('stroke-width', sw);
      poly.setAttribute('stroke-dasharray', `${_mapNatW / 80} ${_mapNatW / 120}`);
      poly.setAttribute('stroke-linejoin', 'round');
      svg.appendChild(poly);
    }
    // 꼭짓점 원
    const r = Math.max(8, _mapNatW / 180);
    pts.forEach((p, i) => {
      const c = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      c.setAttribute('cx', p[0]); c.setAttribute('cy', p[1]); c.setAttribute('r', r);
      c.setAttribute('fill', i === 0 ? '#f97316' : '#fff');
      c.setAttribute('stroke', '#f97316'); c.setAttribute('stroke-width', sw);
      svg.appendChild(c);
      const n = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      n.setAttribute('x', p[0]); n.setAttribute('y', p[1] - r * 1.4);
      n.setAttribute('text-anchor', 'middle');
      n.setAttribute('fill', '#f97316'); n.setAttribute('font-size', r * 1.3);
      n.setAttribute('font-weight', '700');
      n.setAttribute('paint-order', 'stroke');
      n.setAttribute('stroke', '#000'); n.setAttribute('stroke-width', r * 0.3);
      n.textContent = i + 1;
      svg.appendChild(n);
    });
    return;
  }

  const d = _loadZoneData();
  if (!d.visible || d.points.length < 3) return;

  const poly = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
  poly.setAttribute('points', d.points.map(p => p.join(',')).join(' '));
  poly.setAttribute('fill', 'rgba(251,146,60,0.18)');
  poly.setAttribute('stroke', '#f97316');
  poly.setAttribute('stroke-width', sw * 1.5);
  poly.setAttribute('stroke-dasharray', `${_mapNatW / 80} ${_mapNatW / 120}`);
  poly.setAttribute('stroke-linejoin', 'round');
  svg.appendChild(poly);

  // 중앙 라벨
  const cx = d.points.reduce((s, p) => s + p[0], 0) / d.points.length;
  const cy = d.points.reduce((s, p) => s + p[1], 0) / d.points.length;
  const fs = Math.max(18, _mapNatW / 100);
  const lbl = document.createElementNS('http://www.w3.org/2000/svg', 'text');
  lbl.setAttribute('x', cx); lbl.setAttribute('y', cy + fs * 0.35);
  lbl.setAttribute('text-anchor', 'middle');
  lbl.setAttribute('fill', '#ea580c'); lbl.setAttribute('font-size', fs);
  lbl.setAttribute('font-weight', '800');
  lbl.setAttribute('paint-order', 'stroke');
  lbl.setAttribute('stroke', '#fff'); lbl.setAttribute('stroke-width', fs * 0.3);
  lbl.textContent = '🚧 현재공사구역';
  svg.appendChild(lbl);

  // 입구 마커 (깃발 스타일)
  const entrances = d.entrances || [];
  const er = Math.max(10, _mapNatW / 140);
  const eColor = _entranceEdit ? '#16a34a' : '#22c55e';
  entrances.forEach(en => {
    // 깃대
    const pole = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    pole.setAttribute('x1', en.x); pole.setAttribute('y1', en.y);
    pole.setAttribute('x2', en.x); pole.setAttribute('y2', en.y - er * 3.5);
    pole.setAttribute('stroke', eColor); pole.setAttribute('stroke-width', sw);
    svg.appendChild(pole);
    // 깃발 삼각형
    const flag = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
    flag.setAttribute('points',
      `${en.x},${en.y - er * 3.5} ${en.x + er * 2},${en.y - er * 2.7} ${en.x},${en.y - er * 1.9}`);
    flag.setAttribute('fill', eColor); flag.setAttribute('stroke', 'none');
    svg.appendChild(flag);
    // "입구" 텍스트
    const et = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    et.setAttribute('x', en.x + er * 2.2); et.setAttribute('y', en.y - er * 2.5);
    et.setAttribute('fill', eColor); et.setAttribute('font-size', er * 1.2);
    et.setAttribute('font-weight', '800');
    et.setAttribute('paint-order', 'stroke');
    et.setAttribute('stroke', '#fff'); et.setAttribute('stroke-width', er * 0.4);
    et.textContent = '입구';
    svg.appendChild(et);
    // 편집 중엔 삭제 안내 원
    if (_entranceEdit) {
      const hint = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      hint.setAttribute('cx', en.x); hint.setAttribute('cy', en.y);
      hint.setAttribute('r', er * 0.8);
      hint.setAttribute('fill', '#fff'); hint.setAttribute('fill-opacity', '0.5');
      hint.setAttribute('stroke', eColor); hint.setAttribute('stroke-width', sw);
      svg.appendChild(hint);
    }
  });
}

function _renderValves() {
  if (typeof VALVE_POSITIONS === 'undefined' || !VALVE_POSITIONS.length) return;
  const svg = document.getElementById('map-svg');
  if (!svg) return;
  const r = Math.max(6, _mapNatW / 160);
  VALVE_POSITIONS.forEach(v => _drawValveSymbol(svg, v.x, v.y, r, v.name));
}

function _drawValveSymbol(svg, x, y, r, name) {
  const mk = (tag, attrs) => {
    const el = document.createElementNS('http://www.w3.org/2000/svg', tag);
    Object.entries(attrs).forEach(([k, val]) => el.setAttribute(k, val));
    svg.appendChild(el);
    return el;
  };
  // 왼쪽 삼각형
  mk('polygon', { points: `${x-r},${y-r} ${x},${y} ${x-r},${y+r}`,
    fill: '#ef4444', stroke: '#fff', 'stroke-width': r * 0.18, 'stroke-linejoin': 'round' });
  // 오른쪽 삼각형
  mk('polygon', { points: `${x+r},${y-r} ${x},${y} ${x+r},${y+r}`,
    fill: '#ef4444', stroke: '#fff', 'stroke-width': r * 0.18, 'stroke-linejoin': 'round' });
  // 가운데 수평선 (배관 연결)
  mk('line', { x1: x - r, y1: y, x2: x + r, y2: y,
    stroke: '#fff', 'stroke-width': r * 0.22 });
  // 스템 (위 수직선)
  mk('line', { x1: x, y1: y - r, x2: x, y2: y - r * 1.9,
    stroke: '#ef4444', 'stroke-width': r * 0.28 });
  // 핸드휠 (원)
  mk('circle', { cx: x, cy: y - r * 2.3, r: r * 0.5,
    fill: 'none', stroke: '#ef4444', 'stroke-width': r * 0.28 });
  // 이름 레이블
  const lbl = mk('text', { x, y: y + r * 2.2,
    'text-anchor': 'middle', fill: '#ef4444',
    'font-size': r * 1.1, 'font-weight': '700',
    'paint-order': 'stroke', stroke: '#000', 'stroke-width': r * 0.35 });
  lbl.textContent = name;
}

function _renderLabels() {
  const svg = document.getElementById('map-svg');
  if (!svg || typeof MAP_LABELS === 'undefined' || !MAP_LABELS.length) return;
  const fontSize = Math.max(20, _mapNatW / 55);
  const pad = fontSize * 0.55;
  MAP_LABELS.forEach(lb => {
    const tw = lb.text.length * fontSize * 0.62 + pad * 2;
    const th = fontSize + pad * 2;
    const rx = lb.x - tw / 2, ry = lb.y - th / 2;
    const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    rect.setAttribute('x', rx); rect.setAttribute('y', ry);
    rect.setAttribute('width', tw); rect.setAttribute('height', th);
    rect.setAttribute('rx', fontSize * 0.3);
    rect.setAttribute('fill', lb.color || '#fef3c7');
    rect.setAttribute('fill-opacity', '0.88');
    rect.setAttribute('stroke', '#92400e');
    rect.setAttribute('stroke-width', Math.max(1, fontSize * 0.08));
    svg.appendChild(rect);
    const txt = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    txt.setAttribute('x', lb.x); txt.setAttribute('y', lb.y + fontSize * 0.35);
    txt.setAttribute('text-anchor', 'middle');
    txt.setAttribute('fill', '#1a1a2e');
    txt.setAttribute('font-size', fontSize);
    txt.setAttribute('font-weight', '700');
    txt.textContent = lb.text;
    svg.appendChild(txt);
  });
}

function _mkCircle(cx, cy, r, fill) {
  const el = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
  el.setAttribute('cx', cx); el.setAttribute('cy', cy); el.setAttribute('r', r);
  el.setAttribute('fill', fill);
  el.setAttribute('stroke', '#000'); el.setAttribute('stroke-width', r * 0.35);
  el.setAttribute('class', 'pick-marker-el');
  return el;
}

// ── 지도에서 구간 선택 ────────────────────────────────────────
function startSectionPick(segId) {
  _sectionPick = { segId, step: 'start', startM: null, startT: null, color: '#f59e0b' };
  const seg = PIPELINE_SEGMENTS.find(s => s.id === segId);
  _enterPickModePopup(seg);
  renderAllPipes();
}

function cancelSectionPick() {
  _sectionPick = null;
  renderAllPipes();
  hidePipePopup();
}

function confirmSectionPick() {
  if (!_sectionPick || _sectionPick.step !== 'confirm') return;
  const { segId, fromM, toM, color } = _sectionPick;
  const saved = _getSegmentColors(segId);
  const newSegs = [...(saved.매달기구간 || []), { id: _makeSubSegId(), from: fromM, to: toM, color }];
  _saveSegmentColors(segId, { 매달기구간: newSegs });
  _sectionPick = null;
  renderAllPipes();
  hidePipePopup();
}

function _handleSectionPick(segId, e) {
  const seg = PIPELINE_SEGMENTS.find(s => s.id === segId);
  if (!seg || seg.노출길이 === 0) return;

  const img = document.getElementById('map-img');
  const rect = img.getBoundingClientRect();
  const sx = _mapNatW / img.clientWidth, sy = _mapNatH / img.clientHeight;
  const nx = (e.clientX - rect.left) * sx;
  const ny = (e.clientY - rect.top)  * sy;
  const t  = _closestFractionOnPolyline(seg.points, nx, ny);
  const m  = parseFloat((t * seg.노출길이).toFixed(1));

  if (_sectionPick.step === 'start') {
    _sectionPick.startM = m;
    _sectionPick.startT = t;
    _sectionPick.step   = 'end';
  } else {
    let fromM = _sectionPick.startM, toM = m;
    if (toM < fromM) [fromM, toM] = [toM, fromM];
    if (toM - fromM < 0.1) toM = Math.min(seg.노출길이, fromM + 0.5);
    const fromT = fromM / seg.노출길이, toT = toM / seg.노출길이;
    Object.assign(_sectionPick, { fromM, toM, fromT, toT, step: 'confirm' });
  }
  _updatePickUI();
  renderAllPipes();
}

function _enterPickModePopup(seg) {
  const popup = document.getElementById('pipe-popup');
  popup.innerHTML = `
    <div class="pp-header">
      <div class="pp-dot" style="background:${seg.color}"></div>
      <div class="pp-name">${seg.name}</div>
      <button class="pp-close" onclick="cancelSectionPick()">✕</button>
    </div>
    <div class="pp-body">
      <div class="pick-step" id="pick-step">배관 위 시작점을 클릭하세요</div>
      <div class="pick-range">
        <div><span class="pick-dot-s"></span> 시작: <strong id="pick-sv">-</strong></div>
        <div><span class="pick-dot-e"></span> 끝: <strong id="pick-ev">-</strong></div>
      </div>
      <div class="pick-color-row" id="pick-color-row" style="display:none">
        <span style="font-size:11px;color:#6b7280">색상</span>
        <input type="color" id="pick-color" value="#f59e0b"
          oninput="_sectionPick&&(_sectionPick.color=this.value, renderAllPipes())">
      </div>
    </div>
    <div class="pp-footer pp-footer-two">
      <button class="pp-btn-mgr" onclick="cancelSectionPick()">취소</button>
      <button class="pp-btn-pick" id="pick-save" style="display:none"
        onclick="confirmSectionPick()">구간 저장</button>
    </div>
  `;
  popup.style.display = 'block';
}

function _updatePickUI() {
  const pick = _sectionPick;
  const stepEl     = document.getElementById('pick-step');
  const svEl       = document.getElementById('pick-sv');
  const evEl       = document.getElementById('pick-ev');
  const colorRow   = document.getElementById('pick-color-row');
  const saveBtn    = document.getElementById('pick-save');
  if (!stepEl) return;

  if (pick.step === 'end') {
    stepEl.textContent = `시작: ${pick.startM}m — 끝점을 클릭하세요`;
    svEl.textContent   = pick.startM + 'm';
    evEl.textContent   = '?';
  } else if (pick.step === 'confirm') {
    stepEl.textContent = `구간 확인 — 색상 선택 후 저장`;
    svEl.textContent   = pick.fromM + 'm';
    evEl.textContent   = pick.toM   + 'm';
    colorRow.style.display = 'flex';
    saveBtn.style.display  = 'block';
  }
}

function _drawPickMarkers() {
  const svg = document.getElementById('map-svg');
  if (!svg || !_sectionPick) return;
  const seg = PIPELINE_SEGMENTS.find(s => s.id === _sectionPick.segId);
  if (!seg) return;

  const r = Math.max(6, _mapNatW / 180);

  // 시작 마커 (초록)
  if (_sectionPick.startT !== null) {
    const p = _pointAtFraction(seg.points, _sectionPick.startT);
    svg.appendChild(_mkCircle(p[0], p[1], r, '#22c55e'));
  }

  if (_sectionPick.step === 'confirm') {
    // 끝 마커 (빨강)
    const ep = _pointAtFraction(seg.points, _sectionPick.toT);
    svg.appendChild(_mkCircle(ep[0], ep[1], r, '#ef4444'));

    // 미리보기 구간
    const color    = _sectionPick.color || '#f59e0b';
    const lineW    = Math.max(3, _mapNatW / 200) * 2.8;
    const prevPts  = _pxSubpath(seg.points, _sectionPick.fromT, _sectionPick.toT);
    const prevLine = _mkPolyline(prevPts, color, lineW, 'pick-marker-el');
    prevLine.setAttribute('stroke-opacity', '0.9');
    // defs 바로 다음에 삽입 (pipe group들 아래)
    const defs = svg.querySelector('defs');
    svg.insertBefore(prevLine, defs ? defs.nextSibling : svg.firstChild);
  }
}
