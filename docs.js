// ===== 협의자료 =====
// pipe_settings key: '_consult_docs', colors column = array of doc records
// Storage: pipe-photo bucket, docs/{docId}/ folder

const _DOCS_KEY = '_consult_docs';
let _docs = [];
let _docsLoaded = false;
let _docsViewerDoc = null;
let _docsViewerFileIdx = 0;
let _docsEditDoc = null;
let _docsEditNewFiles = [];
let _docsEditNewCover = null;
let _docsEditKeepFiles = [];

// Record shape: { id, title, date, desc, coverPath, coverUrl, files:[{name,path,url,type}], createdAt }

async function initDocsPage() {
  if (_docsLoaded) { _renderDocsGrid(); return; }
  const wrap = document.getElementById('docs-grid');
  if (wrap) wrap.innerHTML = '<div style="text-align:center;color:#94a3b8;padding:40px;font-size:13px">불러오는 중...</div>';
  try {
    const rows = await fetchAllPipeSettings();
    const raw = rows[_DOCS_KEY]?.colors;
    _docs = Array.isArray(raw) ? raw : [];
  } catch (e) {
    console.error('협의자료 로드 오류:', e);
    _docs = [];
  }
  _docsLoaded = true;
  _renderDocsGrid();
}

async function _saveDocs() {
  await upsertPipeSettings(_DOCS_KEY, { colors: _docs });
}

function _docsEsc(s) {
  return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function _docsTypeIcon(type) {
  if (!type) return '📄';
  if (type === 'pdf') return '📕';
  if (type === 'docx' || type === 'doc') return '📘';
  if (type === 'pptx' || type === 'ppt') return '📙';
  if (['jpg','jpeg','png','gif','webp'].includes(type)) return '🖼️';
  return '📄';
}

function _docsTypeBg(type) {
  if (type === 'pdf') return '#dc2626';
  if (type === 'docx' || type === 'doc') return '#2563eb';
  if (type === 'pptx' || type === 'ppt') return '#ea580c';
  if (['jpg','jpeg','png','gif','webp'].includes(type)) return '#0891b2';
  return '#64748b';
}

// ─── 그리드 ───────────────────────────────────────────────────────────

function _renderDocsGrid() {
  const wrap = document.getElementById('docs-grid');
  if (!wrap) return;

  const addBtn = document.getElementById('docs-add-btn');
  if (addBtn) addBtn.style.display = window._editMode ? '' : 'none';

  const sorted = [..._docs].sort((a, b) => {
    const da = a.date || a.createdAt || '';
    const db = b.date || b.createdAt || '';
    return db.localeCompare(da);
  });

  if (sorted.length === 0) {
    wrap.innerHTML = `
      <div style="text-align:center;color:#94a3b8;padding:60px 0;font-size:14px;grid-column:1/-1">
        협의자료가 없습니다<br>
        <small style="font-size:12px">${window._editMode ? '위 + 버튼으로 추가하세요' : ''}</small>
      </div>`;
    return;
  }
  wrap.innerHTML = sorted.map(_docsCardHtml).join('');
}

function _docsCardHtml(doc) {
  const coverImg = doc.coverUrl
    ? `<img src="${_docsEsc(doc.coverUrl)}" style="width:100%;height:140px;object-fit:cover">`
    : `<div style="width:100%;height:140px;display:flex;align-items:center;justify-content:center;background:#f1f5f9;font-size:40px">${_docsTypeIcon(doc.files?.[0]?.type)}</div>`;

  const tags = (doc.files || []).map(f =>
    `<span style="font-size:10px;padding:2px 7px;border-radius:10px;background:${_docsTypeBg(f.type)};color:#fff;font-weight:600">${(f.type || '').toUpperCase()}</span>`
  ).join('');

  return `
    <div class="docs-card" onclick="openDocsViewer('${doc.id}')">
      <div style="border-radius:10px 10px 0 0;overflow:hidden;line-height:0">${coverImg}</div>
      <div style="padding:12px 14px">
        <div style="font-weight:700;font-size:13px;color:#1e293b;margin-bottom:3px;
          white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${_docsEsc(doc.title)}</div>
        <div style="font-size:11px;color:#94a3b8;margin-bottom:6px">${_docsEsc(doc.date || '')}</div>
        ${doc.desc ? `<div style="font-size:12px;color:#475569;line-height:1.45;overflow:hidden;
          display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;margin-bottom:8px">${_docsEsc(doc.desc)}</div>` : ''}
        <div style="display:flex;gap:4px;flex-wrap:wrap">${tags}</div>
      </div>
    </div>`;
}

// ─── 뷰어 모달 ────────────────────────────────────────────────────────

window.openDocsViewer = function(docId) {
  const doc = _docs.find(d => d.id === docId);
  if (!doc) return;
  _docsViewerDoc = doc;
  _docsViewerFileIdx = 0;
  _renderDocsViewer();
  document.getElementById('docs-viewer-modal').style.display = 'flex';
};

window.closeDocsViewer = function() {
  document.getElementById('docs-viewer-modal').style.display = 'none';
  _docsViewerDoc = null;
};

window.selectDocsFile = function(idx) {
  _docsViewerFileIdx = idx;
  _renderDocsViewerFile();
};

function _renderDocsViewer() {
  const doc = _docsViewerDoc;
  if (!doc) return;
  const files = doc.files || [];

  const tabsHtml = files.length > 1
    ? files.map((f, i) => `
        <button onclick="selectDocsFile(${i})" id="docs-vtab-${i}"
          style="padding:5px 14px;border-radius:20px;cursor:pointer;font-size:12px;font-weight:600;
            border:1px solid ${i === _docsViewerFileIdx ? '#0d2b5e' : '#e2e8f0'};
            background:${i === _docsViewerFileIdx ? '#0d2b5e' : '#fff'};
            color:${i === _docsViewerFileIdx ? '#fff' : '#475569'};white-space:nowrap">
          ${_docsTypeIcon(f.type)} ${_docsEsc(f.name)}
        </button>`).join('')
    : '';

  document.getElementById('docs-viewer-body').innerHTML = `
    <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:12px;margin-bottom:14px">
      <div style="flex:1;min-width:0">
        <div style="font-size:18px;font-weight:700;color:#0d2b5e;line-height:1.3">${_docsEsc(doc.title)}</div>
        <div style="font-size:12px;color:#94a3b8;margin-top:3px">${_docsEsc(doc.date || '')}</div>
        ${doc.desc ? `<div style="font-size:13px;color:#475569;margin-top:8px;line-height:1.5">${_docsEsc(doc.desc)}</div>` : ''}
      </div>
      <div style="display:flex;gap:6px;flex-shrink:0;flex-wrap:wrap;justify-content:flex-end">
        ${window._editMode ? `
          <button onclick="openDocsEdit('${doc.id}')"
            style="padding:6px 12px;border-radius:7px;border:1px solid #cbd5e1;background:#fff;color:#475569;font-size:12px;cursor:pointer">✏️ 편집</button>
          <button onclick="deleteDoc('${doc.id}')"
            style="padding:6px 12px;border-radius:7px;border:1px solid #fca5a5;background:#fff;color:#dc2626;font-size:12px;cursor:pointer">🗑 삭제</button>
        ` : ''}
        <button onclick="closeDocsViewer()"
          style="padding:6px 12px;border-radius:7px;border:1px solid #e2e8f0;background:#fff;color:#475569;font-size:12px;cursor:pointer">✕ 닫기</button>
      </div>
    </div>
    ${tabsHtml ? `<div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:12px;padding-bottom:12px;border-bottom:1px solid #e2e8f0">${tabsHtml}</div>` : ''}
    <div id="docs-file-viewer"></div>`;

  _renderDocsViewerFile();
}

function _renderDocsViewerFile() {
  const doc = _docsViewerDoc;
  const files = doc?.files || [];
  const f = files[_docsViewerFileIdx];
  const viewer = document.getElementById('docs-file-viewer');
  if (!viewer) return;

  // Update tab highlight
  files.forEach((_, i) => {
    const t = document.getElementById(`docs-vtab-${i}`);
    if (!t) return;
    t.style.background = i === _docsViewerFileIdx ? '#0d2b5e' : '#fff';
    t.style.color = i === _docsViewerFileIdx ? '#fff' : '#475569';
    t.style.borderColor = i === _docsViewerFileIdx ? '#0d2b5e' : '#e2e8f0';
  });

  if (!f) {
    viewer.innerHTML = '<div style="text-align:center;color:#94a3b8;padding:40px">파일 없음</div>';
    return;
  }

  const url = f.url;
  const type = f.type;

  if (type === 'pdf') {
    viewer.innerHTML = `<iframe src="${_docsEsc(url)}"
      style="width:100%;height:70vh;border:none;border-radius:8px;background:#f8fafc"></iframe>`;
    return;
  }

  if (['doc','docx','ppt','pptx','xls','xlsx'].includes(type)) {
    const enc = encodeURIComponent(url);
    viewer.innerHTML = `
      <div style="margin-bottom:8px;font-size:12px;color:#64748b">
        Google Docs 뷰어로 표시됩니다.
        <a href="${_docsEsc(url)}" target="_blank" style="color:#0d2b5e;font-weight:600">직접 다운로드 →</a>
      </div>
      <iframe src="https://docs.google.com/viewer?url=${enc}&embedded=true"
        style="width:100%;height:70vh;border:none;border-radius:8px;background:#f8fafc"></iframe>`;
    return;
  }

  if (['jpg','jpeg','png','gif','webp'].includes(type)) {
    viewer.innerHTML = `<img src="${_docsEsc(url)}"
      style="max-width:100%;border-radius:8px;display:block;margin:0 auto">`;
    return;
  }

  viewer.innerHTML = `
    <div style="text-align:center;padding:48px;color:#475569">
      <div style="font-size:52px;margin-bottom:14px">${_docsTypeIcon(type)}</div>
      <div style="font-size:14px;margin-bottom:18px;font-weight:600">${_docsEsc(f.name)}</div>
      <a href="${_docsEsc(url)}" target="_blank"
        style="padding:10px 28px;background:#0d2b5e;color:#fff;border-radius:8px;
          text-decoration:none;font-weight:600;font-size:13px">다운로드</a>
    </div>`;
}

// ─── 추가/편집 모달 ───────────────────────────────────────────────────

window.openDocsAdd = function() {
  if (!window._editMode) return;
  _docsEditDoc = null;
  _renderDocsEditModal();
  document.getElementById('docs-edit-modal').style.display = 'flex';
};

window.openDocsEdit = function(docId) {
  if (!window._editMode) return;
  _docsEditDoc = _docs.find(d => d.id === docId) || null;
  _renderDocsEditModal();
  document.getElementById('docs-viewer-modal').style.display = 'none';
  document.getElementById('docs-edit-modal').style.display = 'flex';
};

window.closeDocsEdit = function() {
  document.getElementById('docs-edit-modal').style.display = 'none';
};

function _renderDocsEditModal() {
  const doc = _docsEditDoc;
  _docsEditNewFiles = [];
  _docsEditNewCover = null;
  _docsEditKeepFiles = doc ? [...(doc.files || [])] : [];

  const coverHtml = doc?.coverUrl
    ? `<img src="${_docsEsc(doc.coverUrl)}" style="width:100%;height:120px;object-fit:cover;border-radius:8px">`
    : `<div style="text-align:center;color:#94a3b8;font-size:12px;padding:18px 0;background:#f8fafc;border-radius:8px">이미지 없음</div>`;

  document.getElementById('docs-edit-body').innerHTML = `
    <div style="font-size:16px;font-weight:700;color:#0d2b5e;margin-bottom:16px">${doc ? '문서 편집' : '협의자료 추가'}</div>
    <div style="display:flex;flex-direction:column;gap:12px">

      <label style="font-size:12px;font-weight:600;color:#475569">제목 *
        <input id="docs-edit-title" type="text" value="${_docsEsc(doc?.title || '')}"
          placeholder="예: 2024-08 협의요청 공문"
          style="display:block;width:100%;margin-top:4px;padding:8px 10px;border:1px solid #e2e8f0;
            border-radius:7px;font-size:13px;box-sizing:border-box;font-family:inherit">
      </label>

      <label style="font-size:12px;font-weight:600;color:#475569">날짜
        <input id="docs-edit-date" type="date" value="${_docsEsc(doc?.date || '')}"
          style="display:block;width:100%;margin-top:4px;padding:8px 10px;border:1px solid #e2e8f0;
            border-radius:7px;font-size:13px;box-sizing:border-box;font-family:inherit">
      </label>

      <label style="font-size:12px;font-weight:600;color:#475569">설명 (선택)
        <textarea id="docs-edit-desc" rows="2" placeholder="간략한 내용 메모"
          style="display:block;width:100%;margin-top:4px;padding:8px 10px;border:1px solid #e2e8f0;
            border-radius:7px;font-size:13px;box-sizing:border-box;resize:vertical;font-family:inherit">${_docsEsc(doc?.desc || '')}</textarea>
      </label>

      <div>
        <div style="font-size:12px;font-weight:600;color:#475569;margin-bottom:6px">커버 이미지 (선택)</div>
        <div id="docs-cover-preview" style="margin-bottom:8px">${coverHtml}</div>
        <button onclick="document.getElementById('docs-cover-input').click()"
          style="padding:5px 14px;border-radius:6px;border:1px solid #cbd5e1;background:#fff;color:#475569;font-size:12px;cursor:pointer">
          📷 이미지 선택
        </button>
        <input type="file" id="docs-cover-input" accept="image/*" style="display:none"
          onchange="_handleDocsCoverSelect(this)">
      </div>

      <div>
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px">
          <span style="font-size:12px;font-weight:600;color:#475569">첨부파일</span>
          <button onclick="document.getElementById('docs-files-input').click()"
            style="padding:5px 14px;border-radius:6px;border:1px solid #0d2b5e;background:#fff;
              color:#0d2b5e;font-size:12px;font-weight:700;cursor:pointer">+ 파일 추가</button>
        </div>
        <input type="file" id="docs-files-input" multiple style="display:none"
          accept=".pdf,.doc,.docx,.ppt,.pptx,.xls,.xlsx,.jpg,.jpeg,.png,.hwp"
          onchange="_handleDocsFilesSelect(this)">
        <div id="docs-files-list"></div>
      </div>
    </div>

    <div style="display:flex;gap:8px;margin-top:18px;justify-content:flex-end">
      <button onclick="closeDocsEdit()"
        style="padding:8px 18px;border-radius:7px;border:1px solid #e2e8f0;background:#fff;color:#475569;font-size:13px;cursor:pointer">취소</button>
      <button id="docs-save-btn" onclick="saveDocsEdit()"
        style="padding:8px 18px;border-radius:7px;border:none;background:#0d2b5e;color:#fff;font-size:13px;font-weight:700;cursor:pointer">저장</button>
    </div>`;

  _renderDocsFilesList();
}

function _renderDocsFilesList() {
  const list = document.getElementById('docs-files-list');
  if (!list) return;

  const keepHtml = _docsEditKeepFiles.map((f, i) => `
    <div style="display:flex;align-items:center;gap:8px;padding:7px 10px;
      background:#f8fafc;border:1px solid #e2e8f0;border-radius:7px;margin-bottom:4px">
      <span style="font-size:18px;line-height:1">${_docsTypeIcon(f.type)}</span>
      <span style="flex:1;font-size:12px;color:#374151;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${_docsEsc(f.name)}</span>
      <button onclick="_docsRemoveKeep(${i})"
        style="padding:2px 8px;border-radius:5px;border:1px solid #fca5a5;background:#fff;color:#dc2626;font-size:11px;cursor:pointer">✕</button>
    </div>`).join('');

  const newHtml = _docsEditNewFiles.map((f, i) => `
    <div style="display:flex;align-items:center;gap:8px;padding:7px 10px;
      background:#f0fdf4;border:1px solid #86efac;border-radius:7px;margin-bottom:4px">
      <span style="font-size:18px;line-height:1">${_docsTypeIcon(f.type)}</span>
      <span style="flex:1;font-size:12px;color:#374151;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">
        ${_docsEsc(f.name)} <span style="color:#16a34a;font-size:10px;font-weight:600">NEW</span>
      </span>
      <button onclick="_docsRemoveNew(${i})"
        style="padding:2px 8px;border-radius:5px;border:1px solid #fca5a5;background:#fff;color:#dc2626;font-size:11px;cursor:pointer">✕</button>
    </div>`).join('');

  list.innerHTML = keepHtml + newHtml ||
    '<div style="text-align:center;color:#94a3b8;font-size:12px;padding:12px 0">파일을 추가하세요 (PDF, Word, PPT, 이미지 등)</div>';
}

window._docsRemoveKeep = function(i) { _docsEditKeepFiles.splice(i, 1); _renderDocsFilesList(); };
window._docsRemoveNew  = function(i) { _docsEditNewFiles.splice(i, 1);  _renderDocsFilesList(); };

window._handleDocsCoverSelect = function(input) {
  const file = input.files?.[0];
  if (!file) return;
  _docsEditNewCover = file;
  const url = URL.createObjectURL(file);
  const p = document.getElementById('docs-cover-preview');
  if (p) p.innerHTML = `<img src="${url}" style="width:100%;height:120px;object-fit:cover;border-radius:8px">`;
  input.value = '';
};

window._handleDocsFilesSelect = function(input) {
  Array.from(input.files || []).forEach(file => {
    const ext = file.name.split('.').pop().toLowerCase();
    _docsEditNewFiles.push({ file, name: file.name, type: ext });
  });
  _renderDocsFilesList();
  input.value = '';
};

window.saveDocsEdit = async function() {
  const title = document.getElementById('docs-edit-title')?.value?.trim();
  if (!title) { alert('제목을 입력하세요'); return; }

  const date = document.getElementById('docs-edit-date')?.value || '';
  const desc = document.getElementById('docs-edit-desc')?.value?.trim() || '';

  const btn = document.getElementById('docs-save-btn');
  if (btn) { btn.disabled = true; btn.textContent = '저장 중...'; }

  try {
    const docId = _docsEditDoc?.id || ('doc_' + Date.now());
    const folder = `docs/${docId}`;

    // Cover upload
    let coverPath = _docsEditDoc?.coverPath || null;
    let coverUrl  = _docsEditDoc?.coverUrl  || null;
    if (_docsEditNewCover) {
      const ext  = _docsEditNewCover.name.split('.').pop().toLowerCase() || 'jpg';
      const path = `${folder}/cover.${ext}`;
      const { error } = await sb.storage.from(PIPE_PHOTO_BUCKET).upload(path, _docsEditNewCover, { upsert: true });
      if (error) throw error;
      coverPath = path;
      coverUrl  = sb.storage.from(PIPE_PHOTO_BUCKET).getPublicUrl(path).data.publicUrl;
    }

    // Attachment uploads
    const uploaded = [];
    for (const f of _docsEditNewFiles) {
      const ext  = f.name.split('.').pop().toLowerCase() || 'bin';
      const path = `${folder}/${Date.now()}.${ext}`;
      const { error } = await sb.storage.from(PIPE_PHOTO_BUCKET).upload(path, f.file, { upsert: false });
      if (error) throw error;
      uploaded.push({
        name: f.name,
        path,
        url: sb.storage.from(PIPE_PHOTO_BUCKET).getPublicUrl(path).data.publicUrl,
        type: f.type,
      });
    }

    const record = {
      id: docId,
      title,
      date,
      desc,
      coverPath,
      coverUrl,
      files: [..._docsEditKeepFiles, ...uploaded],
      createdAt: _docsEditDoc?.createdAt || new Date().toISOString(),
    };

    if (_docsEditDoc) {
      const idx = _docs.findIndex(d => d.id === docId);
      if (idx >= 0) _docs[idx] = record; else _docs.unshift(record);
    } else {
      _docs.unshift(record);
    }

    await _saveDocs();
    closeDocsEdit();
    _renderDocsGrid();
  } catch (e) {
    alert('저장 실패: ' + e.message);
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = '저장'; }
  }
};

window.deleteDoc = async function(docId) {
  if (!confirm('이 자료를 삭제할까요? 첨부파일도 함께 삭제됩니다.')) return;
  const doc = _docs.find(d => d.id === docId);
  if (!doc) return;
  try {
    const paths = [];
    if (doc.coverPath) paths.push(doc.coverPath);
    (doc.files || []).forEach(f => { if (f.path) paths.push(f.path); });
    if (paths.length) await sb.storage.from(PIPE_PHOTO_BUCKET).remove(paths);
    _docs = _docs.filter(d => d.id !== docId);
    await _saveDocs();
    closeDocsViewer();
    _renderDocsGrid();
  } catch (e) {
    alert('삭제 실패: ' + e.message);
  }
};
