// ===== 노면복공 공종별 점검 =====
// 복공 데이터(_deck_{siteId})에 함께 저장:
//   stage.pipes  = [{ id, name, src? }]  ← 단계 안을 지나는 도시가스 배관 (배관마다 4공종을 모두 거침)
//   stage.checks = { [pipeId]: { [step 1~4]: { values:{...}, date, inspector } } }   ← ① 배관별 공종 점검
//   data.points  = [{ id, x, y, step(1|4), pipe, sep, casing, date, inspector, memo, sid }]  ← ② 지도 점검 포인트
// 배관을 등록하지 않은 단계는 '_'(배관 미지정) 하나로 취급한다. 예전 형식 checks[step]도 '_'로 읽는다.
// 점검 기록은 복공 편집의 저장 버튼과 별개로 바로 DB에 반영된다.

// 공종별 점검 항목. type: num(숫자+단위) | yn(예/아니오) | ok(확인/불량)
const DECK_CHECKS = {
  1: [
    { key: 'sep',    label: '가스배관 이격거리', type: 'num', unit: 'cm' },
    { key: 'casing', label: '케이싱 매설',       type: 'yn' },
  ],
  2: [
    { key: 'survey',    label: '측량 위치대로 천공',          type: 'ok' },
    { key: 'casingPos', label: '케이싱 위치에 맞춰 천공',     type: 'ok', needCasing: true },
  ],
  3: [
    { key: 'beam', label: '가스배관 상단 매달기전용빔 설치', type: 'ok' },
  ],
  4: [
    { key: 'sep',   label: '차수공 이격거리 (최소 50cm)', type: 'num', unit: 'cm' },
    { key: 'depth', label: '약액 주입심도 (GL-4m)',       type: 'num', unit: 'm' },
    { key: 'press', label: '주입압력 (2~3)',              type: 'num', unit: 'kg/cm²' },
    { key: 'heave', label: '히빙 발생',                   type: 'yn' },
  ],
};
const DECK_LV_RANK  = { none: 0, ok: 1, warn: 2, bad: 3 };
const DECK_LV_COLOR = { none: '#64748b', ok: '#16a34a', warn: '#f59e0b', bad: '#dc2626' };
const DECK_LV_ICON  = { none: '', ok: '🟢', warn: '⚠️', bad: '🔴' };

function _deckWorst(levels) {
  return levels.reduce((a, b) => (DECK_LV_RANK[b] > DECK_LV_RANK[a] ? b : a), 'none');
}
function _deckToday() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
const DECK_NO_PIPE = '_';
function _deckPipes(st) {
  return st.pipes?.length ? st.pipes : [{ id: DECK_NO_PIPE, name: '배관 미지정' }];
}
function _deckRec(st, pid, step) {
  const c = st.checks || {};
  if (c[pid]?.[step]) return c[pid][step];
  if (pid === DECK_NO_PIPE && c[step]?.values) return c[step]; // 예전 형식
  return null;
}
function _deckHasCasing(st, pid) { return _deckRec(st, pid, 1)?.values?.casing === 'yes'; }

// 항목 하나 판정 → { lv, msg }
function _deckJudge(step, key, v, values) {
  const empty = v === '' || v == null;
  const n = +v;
  if (step === 1 && key === 'sep') {
    if (empty) return { lv: 'none', msg: '' };
    if (n <= 100) return values.casing === 'yes'
      ? { lv: 'ok', msg: '1m 이하 · 케이싱 매설됨' }
      : { lv: 'warn', msg: '1m 이하 · 케이싱 필요' };
    return { lv: 'ok', msg: '이격 충분' };
  }
  if (step === 1 && key === 'casing') {
    const need = values.sep !== '' && values.sep != null && +values.sep <= 100;
    if (empty) return need ? { lv: 'warn', msg: '케이싱 매설 확인 필요' } : { lv: 'none', msg: '' };
    if (need && v === 'no') return { lv: 'bad', msg: '이격 1m 이하인데 케이싱 미매설' };
    return { lv: 'ok', msg: v === 'yes' ? '매설' : '불필요' };
  }
  if (step === 4 && key === 'sep') {
    if (empty) return { lv: 'none', msg: '' };
    return n < 50 ? { lv: 'bad', msg: '최소 50cm 미달' } : { lv: 'ok', msg: '기준 충족' };
  }
  if (step === 4 && key === 'depth') {
    if (empty) return { lv: 'none', msg: '' };
    return n < 4 ? { lv: 'warn', msg: 'GL-4m 미달' } : { lv: 'ok', msg: '기준 충족' };
  }
  if (step === 4 && key === 'press') {
    if (empty) return { lv: 'none', msg: '' };
    return n >= 2 && n <= 3 ? { lv: 'ok', msg: '준저압 범위' } : { lv: 'bad', msg: '2~3 kg/cm² 벗어남' };
  }
  if (step === 4 && key === 'heave') {
    if (empty) return { lv: 'none', msg: '' };
    return v === 'yes' ? { lv: 'bad', msg: '히빙 발생' } : { lv: 'ok', msg: '이상 없음' };
  }
  // ok 타입 (확인/불량)
  if (empty) return { lv: 'none', msg: '' };
  return v === 'ng' ? { lv: 'bad', msg: '불량' } : { lv: 'ok', msg: '확인' };
}

function _deckCheckItems(step, st, pid) {
  return (DECK_CHECKS[step] || []).filter(it => !it.needCasing || _deckHasCasing(st, pid));
}

function _deckPointLevel(p) {
  const vals = { sep: p.sep ?? '', casing: p.casing ?? '' };
  if (p.step === 4) return _deckJudge(4, 'sep', vals.sep, vals).lv;
  return _deckWorst([_deckJudge(1, 'sep', vals.sep, vals).lv, _deckJudge(1, 'casing', vals.casing, vals).lv]);
}

// 배관 하나의 공종 점검 종합: { lv, complete }
function _deckPipeSummary(data, st, pid, step) {
  const values = _deckRec(st, pid, step)?.values || {};
  const items = _deckCheckItems(step, st, pid);
  const lvs = items.map(it => _deckJudge(step, it.key, values[it.key] ?? '', values).lv);
  const pts = (data.points || []).filter(p => p.sid === st.id && p.step === step && (p.pipe || DECK_NO_PIPE) === pid).map(_deckPointLevel);
  return { lv: _deckWorst([...lvs, ...pts]), complete: items.length > 0 && lvs.every(l => l !== 'none') };
}

// 단계 × 공종 점검 종합 (모든 배관): { lv, done, total, complete }
function _deckCheckSummary(data, st, step) {
  const per = _deckPipes(st).map(p => _deckPipeSummary(data, st, p.id, step));
  // 배관을 지정하지 않은 포인트도 단계 판정에 포함
  const loose = st.pipes?.length
    ? (data.points || []).filter(p => p.sid === st.id && p.step === step && !st.pipes.some(q => q.id === p.pipe)).map(_deckPointLevel)
    : [];
  const done = per.filter(x => x.complete).length;
  return { lv: _deckWorst([...per.map(x => x.lv), ...loose]), done, total: per.length, complete: done === per.length };
}

function _deckCheckBadge(data, st, step) {
  const { lv, complete } = _deckCheckSummary(data, st, step);
  if (lv === 'bad' || lv === 'warn') return DECK_LV_ICON[lv];
  return lv === 'ok' && complete ? DECK_LV_ICON.ok : '';
}

// 저장된 데이터(와 편집 중 사본)에 같은 변경을 적용하고 바로 DB에 반영
async function _deckCommit(mutate) {
  const siteId = _deckSite();
  const saved = JSON.parse(JSON.stringify(_getDeckData(siteId)));
  mutate(saved);
  if (_deckDraft) mutate(_deckDraft);
  try { await _saveDeckData(siteId, saved); }
  catch (e) { alert('점검 기록 저장 실패: ' + e.message); return false; }
  if (_deckEdit) _renderDeckEditBar();
  renderAllPipes();
  return true;
}

// ── 모달 ──────────────────────────────────────────────────────
function _deckModal(html) {
  let m = document.getElementById('deck-modal');
  if (!m) {
    m = document.createElement('div');
    m.id = 'deck-modal';
    m.className = 'deck-modal';
    m.addEventListener('click', e => { if (e.target === m) _deckCloseModal(); });
    document.body.appendChild(m);
  }
  m.innerHTML = `<div class="deck-modal-card">${html}</div>`;
  m.style.display = 'flex';
  return m;
}
window._deckCloseModal = function() {
  const m = document.getElementById('deck-modal');
  if (m) m.style.display = 'none';
};

function _deckField(it, v, can) {
  const dis = can ? '' : ' disabled';
  if (it.type === 'num') {
    return `<input type="number" step="any" data-key="${it.key}" value="${_deckEsc(v ?? '')}"${dis} class="deck-input" style="width:90px"> <span class="deck-unit">${it.unit}</span>`;
  }
  const opts = it.type === 'yn'
    ? [['', '-'], ['yes', '예'], ['no', '아니오']]
    : [['', '미확인'], ['ok', '확인(양호)'], ['ng', '불량']];
  return `<select data-key="${it.key}"${dis} class="deck-input">${opts.map(([val, lab]) =>
    `<option value="${val}"${(v ?? '') === val ? ' selected' : ''}>${lab}</option>`).join('')}</select>`;
}

function _deckJudgeHtml(j) {
  return j.lv === 'none' ? '<span class="deck-judge none">-</span>'
    : `<span class="deck-judge ${j.lv}">${DECK_LV_ICON[j.lv]} ${_deckEsc(j.msg)}</span>`;
}

// ① 공종별 점검 카드 (배관 탭)
window._deckOpenCheck = function(sid, step, pid) {
  const data = _getDeckData(_deckSite());
  const st = data.stages.find(s => s.id === sid);
  if (!st) return;
  const pipes = _deckPipes(st);
  if (!pid || !pipes.some(p => p.id === pid)) pid = pipes[0].id;
  const rec = _deckRec(st, pid, step) || {};
  const values = rec.values || {};
  const can = !!window._editMode;
  const items = _deckCheckItems(step, st, pid);
  const pts = (data.points || []).filter(p => p.sid === sid && p.step === step && (p.pipe || DECK_NO_PIPE) === pid);
  const sum = _deckCheckSummary(data, st, step);

  const chips = pipes.map(p => {
    const ps = _deckPipeSummary(data, st, p.id, step);
    const icon = ps.lv === 'bad' || ps.lv === 'warn' ? DECK_LV_ICON[ps.lv] : ps.complete ? '✓' : '';
    return `<span class="deck-pipe-chip${p.id === pid ? ' on' : ''}" onclick="_deckOpenCheck('${sid}', ${step}, '${p.id}')">` +
      `${_deckEsc(p.name)}${icon ? ` <b>${icon}</b>` : ''}` +
      (can && p.id !== DECK_NO_PIPE ? `<button title="배관 삭제" onclick="event.stopPropagation(); _deckRemovePipe('${sid}', '${p.id}', ${step})">✕</button>` : '') +
      `</span>`;
  }).join('');

  const ptsLine = step === 1 || step === 4
    ? `<div class="deck-check-points">📍 이 배관의 지도 점검 포인트 ${pts.length}개` +
      (pts.length ? ` · ${['ok', 'warn', 'bad'].map(l => `${DECK_LV_ICON[l]} ${pts.filter(p => _deckPointLevel(p) === l).length}`).join(' ')}` : '') +
      `<br><small>위치별 이격거리는 편집 → ③ 작업·점검루트 → 📍 점검포인트로 지도에 기록</small></div>`
    : '';

  _deckModal(`
    <div class="deck-modal-head">
      <div><b>${_deckEsc(st.name)} · ${DECK_CIRCLED[step - 1]} ${DECK_STEPS[step - 1].short}</b> 점검
        <span class="deck-modal-sub">배관 ${sum.done}/${sum.total} 완료</span></div>
      <button class="deck-modal-x" onclick="_deckCloseModal()">✕</button>
    </div>
    <div class="deck-modal-sub">${_deckEsc(DECK_STEPS[step - 1].full)} · 배관마다 따로 점검해요</div>
    <div class="deck-pipe-tabs">${chips}
      ${can ? `<button class="zone-btn" onclick="_deckAddPipe('${sid}', ${step})">+ 배관</button>
               <button class="zone-btn" onclick="_deckFindPipes('${sid}', ${step})">🔍 지도에서 배관 찾기</button>` : ''}
    </div>
    <table class="deck-check-table" id="deck-check-form">
      ${items.map(it => `<tr><td>${it.label}</td><td>${_deckField(it, values[it.key], can)}</td>
        <td data-judge="${it.key}">${_deckJudgeHtml(_deckJudge(step, it.key, values[it.key] ?? '', values))}</td></tr>`).join('')}
    </table>
    ${step === 2 && !_deckHasCasing(st, pid) ? '<div class="deck-modal-note">케이싱 관련 항목은 이 배관의 ① 줄파기에서 케이싱 매설 "예"일 때 표시돼요.</div>' : ''}
    ${ptsLine}
    <div class="deck-check-meta">
      <label>점검일 <input type="date" id="deck-check-date" value="${_deckEsc(rec.date || (can ? _deckToday() : ''))}"${can ? '' : ' disabled'} class="deck-input"></label>
      <label>점검자 <input type="text" id="deck-check-who" value="${_deckEsc(rec.inspector || '')}" placeholder="이름"${can ? '' : ' disabled'} class="deck-input" style="width:110px"></label>
    </div>
    <div class="deck-modal-foot">
      ${can ? `<button class="zone-btn zone-btn-save" onclick="_deckSaveCheck('${sid}', ${step}, '${pid}')">✓ 저장</button>`
            : '<span class="deck-modal-note">편집 잠금을 풀면 입력할 수 있어요.</span>'}
      <button class="zone-btn" onclick="_deckCloseModal()">닫기</button>
    </div>`);

  // 입력할 때마다 판정 갱신
  const form = document.getElementById('deck-check-form');
  form.addEventListener('input', () => {
    const vals = _deckReadForm(form);
    items.forEach(it => {
      const cell = form.querySelector(`[data-judge="${it.key}"]`);
      if (cell) cell.innerHTML = _deckJudgeHtml(_deckJudge(step, it.key, vals[it.key] ?? '', vals));
    });
  });
};

function _deckReadForm(root) {
  const vals = {};
  root.querySelectorAll('[data-key]').forEach(el => { vals[el.dataset.key] = el.value; });
  return vals;
}

window._deckSaveCheck = async function(sid, step, pid) {
  const values = _deckReadForm(document.getElementById('deck-check-form'));
  const date = document.getElementById('deck-check-date').value;
  const inspector = document.getElementById('deck-check-who').value.trim();
  const ok = await _deckCommit(d => {
    const s = d.stages.find(x => x.id === sid);
    if (!s) return;
    s.checks = s.checks || {};
    if (pid === DECK_NO_PIPE) delete s.checks[step]; // 예전 형식 정리
    s.checks[pid] = s.checks[pid] || {};
    s.checks[pid][step] = { values, date, inspector };
  });
  if (ok) _deckOpenCheck(sid, step, pid); // 저장 후 다른 배관 이어서 입력할 수 있게 창 유지
};

// 첫 실제 배관을 등록할 때, '배관 미지정'으로 넣어둔 기록을 그 배관으로 옮김
function _deckAdoptLoose(s, pid) {
  const c = s.checks || {};
  const loose = { ...(c[DECK_NO_PIPE] || {}) };
  [1, 2, 3, 4].forEach(k => { if (c[k]?.values && !loose[k]) loose[k] = c[k]; delete c[k]; });
  delete c[DECK_NO_PIPE];
  if (Object.keys(loose).length) c[pid] = { ...loose, ...(c[pid] || {}) };
  s.checks = c;
}

function _deckAddPipesTo(d, sid, list) {
  const s = d.stages.find(x => x.id === sid);
  if (!s) return;
  s.pipes = s.pipes || [];
  list.forEach(p => {
    if (s.pipes.some(q => (p.src && q.src === p.src) || q.name === p.name)) return;
    if (!s.pipes.length) _deckAdoptLoose(s, p.id);
    s.pipes.push(p);
  });
}

window._deckAddPipe = async function(sid, step) {
  const name = (prompt('배관 이름 (예: 메인관 150A)', '') || '').trim();
  if (!name) return;
  const id = 'gp' + Date.now();
  if (await _deckCommit(d => _deckAddPipesTo(d, sid, [{ id, name }]))) _deckOpenCheck(sid, step, id);
};

window._deckRemovePipe = async function(sid, pid, step) {
  const st = _getDeckData(_deckSite()).stages.find(s => s.id === sid);
  const p = st?.pipes?.find(q => q.id === pid);
  if (!p || !confirm(`'${p.name}' 배관과 이 배관의 점검 기록을 모두 삭제할까요?`)) return;
  const ok = await _deckCommit(d => {
    const s = d.stages.find(x => x.id === sid);
    if (!s) return;
    s.pipes = (s.pipes || []).filter(q => q.id !== pid);
    if (s.checks) delete s.checks[pid];
  });
  if (ok) _deckOpenCheck(sid, step);
};

// 선분 교차
function _deckSegCross(a, b, c, d) {
  const o = (p, q, r) => Math.sign((q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]));
  return o(a, b, c) !== o(a, b, d) && o(c, d, a) !== o(c, d, b);
}
function _deckLineInPoly(line, poly) {
  if (line.some(q => _deckPointIn(poly, q[0], q[1]))) return true;
  for (let i = 0; i < line.length - 1; i++)
    for (let j = 0; j < poly.length; j++)
      if (_deckSegCross(line[i], line[i + 1], poly[j], poly[(j + 1) % poly.length])) return true;
  return false;
}

// 지도에 그려진 배관 중 이 단계 구역을 지나는 것을 자동으로 등록
window._deckFindPipes = async function(sid, step) {
  const strip = _deckStrips(_getDeckData(_deckSite())).find(s => s.stage.id === sid);
  if (!strip) { alert('단계 구역을 찾을 수 없어요. 정거장 외곽을 먼저 그려주세요.'); return; }
  const segs = [
    ...(typeof PIPELINE_SEGMENTS !== 'undefined' && typeof _filterBySite === 'function' ? _filterBySite(PIPELINE_SEGMENTS) : []),
    ...(typeof _peData === 'function' ? _peData(_deckSite()).segments : []),
  ];
  const found = segs.filter(g => (g.points || []).length >= 2 && _deckLineInPoly(g.points, strip.pts))
    .map((g, i) => ({ id: 'gp' + Date.now() + i, src: g.id || g.name, name: [g.name, g.관경].filter(Boolean).join(' ') }));
  if (!found.length) { alert('이 단계 구역을 지나는 배관을 지도에서 찾지 못했어요. "+ 배관"으로 직접 추가해 주세요.'); return; }
  const before = (_getDeckData(_deckSite()).stages.find(s => s.id === sid)?.pipes || []).length;
  if (!(await _deckCommit(d => _deckAddPipesTo(d, sid, found)))) return;
  const after = (_getDeckData(_deckSite()).stages.find(s => s.id === sid)?.pipes || []).length;
  alert(`배관 ${found.length}개를 찾았어요 (새로 추가 ${after - before}개):\n` + found.map(f => '· ' + f.name).join('\n'));
  _deckOpenCheck(sid, step);
};

// ② 지도 점검 포인트
window._deckOpenPoint = function(id, x, y) {
  const data = _getDeckData(_deckSite());
  const p = id ? (data.points || []).find(q => q.id === id) : null;
  if (id && !p) return;
  const can = !!window._editMode;
  const cur = p || { step: 1, pipe: '', sep: '', casing: '', date: _deckToday(), inspector: '', memo: '' };
  const px = p ? p.x : x, py = p ? p.y : y;
  const hitSt = _deckStrips(data).find(s => _deckPointIn(s.pts, px, py))?.stage;
  const where = hitSt ? hitSt.name : '구역 밖';
  const stPipes = hitSt?.pipes || [];

  _deckModal(`
    <div class="deck-modal-head">
      <div><b>📍 점검 포인트</b> <span class="deck-modal-sub">${_deckEsc(where)}</span></div>
      <button class="deck-modal-x" onclick="_deckCloseModal()">✕</button>
    </div>
    <table class="deck-check-table" id="deck-point-form">
      <tr><td>공종</td><td><select id="deck-pt-step" class="deck-input"${can ? '' : ' disabled'}>
        <option value="1"${cur.step === 1 ? ' selected' : ''}>① 줄파기 (이격·케이싱)</option>
        <option value="4"${cur.step === 4 ? ' selected' : ''}>④ 차수공사 (차수공 이격)</option>
      </select></td></tr>
      ${stPipes.length ? `<tr><td>배관</td><td><select id="deck-pt-pipe" class="deck-input"${can ? '' : ' disabled'}>
        <option value="">-</option>${stPipes.map(q => `<option value="${q.id}"${cur.pipe === q.id ? ' selected' : ''}>${_deckEsc(q.name)}</option>`).join('')}
      </select></td></tr>` : ''}
      <tr><td>가스배관 이격거리</td><td><input type="number" step="any" id="deck-pt-sep" value="${_deckEsc(cur.sep ?? '')}" class="deck-input" style="width:90px"${can ? '' : ' disabled'}> <span class="deck-unit">cm</span></td></tr>
      <tr id="deck-pt-casing-row"><td>케이싱 매설</td><td><select id="deck-pt-casing" class="deck-input"${can ? '' : ' disabled'}>
        ${[['', '-'], ['yes', '예'], ['no', '아니오']].map(([v, l]) => `<option value="${v}"${(cur.casing ?? '') === v ? ' selected' : ''}>${l}</option>`).join('')}
      </select></td></tr>
      <tr><td>판정</td><td id="deck-pt-judge"></td></tr>
      <tr><td>점검일</td><td><input type="date" id="deck-pt-date" value="${_deckEsc(cur.date || '')}" class="deck-input"${can ? '' : ' disabled'}></td></tr>
      <tr><td>점검자</td><td><input type="text" id="deck-pt-who" value="${_deckEsc(cur.inspector || '')}" placeholder="이름" class="deck-input" style="width:110px"${can ? '' : ' disabled'}></td></tr>
      <tr><td>메모</td><td><input type="text" id="deck-pt-memo" value="${_deckEsc(cur.memo || '')}" class="deck-input" style="width:180px"${can ? '' : ' disabled'}></td></tr>
    </table>
    <div class="deck-modal-foot">
      ${can ? `<button class="zone-btn zone-btn-save" onclick="_deckSavePoint(${p ? `'${p.id}'` : 'null'}, ${p ? p.x : Math.round(x)}, ${p ? p.y : Math.round(y)})">✓ 저장</button>` : ''}
      ${can && p ? `<button class="zone-btn" style="color:#dc2626" onclick="_deckDeletePoint('${p.id}')">삭제</button>` : ''}
      ${can ? '' : '<span class="deck-modal-note">편집 잠금을 풀면 입력할 수 있어요.</span>'}
      <button class="zone-btn" onclick="_deckCloseModal()">닫기</button>
    </div>`);

  const refresh = () => {
    const step = +document.getElementById('deck-pt-step').value;
    document.getElementById('deck-pt-casing-row').style.display = step === 1 ? '' : 'none';
    const lv = _deckPointLevel({ step, sep: document.getElementById('deck-pt-sep').value, casing: step === 1 ? document.getElementById('deck-pt-casing').value : '' });
    const j = step === 4
      ? _deckJudge(4, 'sep', document.getElementById('deck-pt-sep').value, {})
      : (() => {
          const vals = { sep: document.getElementById('deck-pt-sep').value, casing: document.getElementById('deck-pt-casing').value };
          const a = _deckJudge(1, 'sep', vals.sep, vals), b = _deckJudge(1, 'casing', vals.casing, vals);
          return DECK_LV_RANK[b.lv] > DECK_LV_RANK[a.lv] ? b : a;
        })();
    document.getElementById('deck-pt-judge').innerHTML = _deckJudgeHtml({ lv, msg: j.msg });
  };
  document.getElementById('deck-point-form').addEventListener('input', refresh);
  refresh();
};

window._deckSavePoint = async function(id, x, y) {
  const step = +document.getElementById('deck-pt-step').value;
  const sepRaw = document.getElementById('deck-pt-sep').value;
  const rec = {
    id: id || 'p' + Date.now(), x, y, step,
    sep: sepRaw === '' ? '' : +sepRaw,
    casing: step === 1 ? document.getElementById('deck-pt-casing').value : '',
    pipe: document.getElementById('deck-pt-pipe')?.value || '',
    date: document.getElementById('deck-pt-date').value,
    inspector: document.getElementById('deck-pt-who').value.trim(),
    memo: document.getElementById('deck-pt-memo').value.trim(),
  };
  const hit = _deckStrips(_getDeckData(_deckSite())).find(s => _deckPointIn(s.pts, x, y));
  rec.sid = hit ? hit.stage.id : null;
  const ok = await _deckCommit(d => {
    d.points = d.points || [];
    const i = d.points.findIndex(q => q.id === rec.id);
    if (i >= 0) d.points[i] = rec; else d.points.push(rec);
  });
  if (ok) _deckCloseModal();
};

window._deckDeletePoint = async function(id) {
  if (!confirm('이 점검 포인트를 삭제할까요?')) return;
  const ok = await _deckCommit(d => { d.points = (d.points || []).filter(q => q.id !== id); });
  if (ok) _deckCloseModal();
};

// 지도에 점검 포인트 그리기 (svg는 지도 원본 좌표계)
function _deckDrawPoints(svg, data) {
  const r = Math.max(7, _mapNatW / 210);
  const fs = r * 1.6;
  (data.points || []).forEach(p => {
    const lv = _deckPointLevel(p);
    const g = _deckEl('g', { class: 'deck-point' });
    g.dataset.id = p.id;
    g.appendChild(_deckEl('circle', { cx: p.x, cy: p.y, r, fill: DECK_LV_COLOR[lv], stroke: '#fff', 'stroke-width': r * 0.35 }));
    const t = _deckEl('text', {
      x: p.x + r * 1.4, y: p.y + fs * 0.35, fill: DECK_LV_COLOR[lv], 'font-size': fs, 'font-weight': '800',
      'paint-order': 'stroke', stroke: '#fff', 'stroke-width': fs * 0.3,
    });
    t.textContent = `${DECK_CIRCLED[p.step - 1]}${p.sep !== '' && p.sep != null ? ` ${p.sep}cm` : ''}`;
    g.appendChild(t);
    svg.appendChild(g);
  });
}

function _deckNearPoint(x, y) {
  const thr = Math.max(14, _mapNatW / 110);
  let best = null, bestD = thr;
  (_getDeckData(_deckSite()).points || []).forEach(p => {
    const d = Math.hypot(p.x - x, p.y - y);
    if (d < bestD) { bestD = d; best = p; }
  });
  return best;
}

function _deckShowPointTooltip(p) {
  const tt = document.getElementById('map-pipe-tooltip');
  if (!tt) return;
  const lv = _deckPointLevel(p);
  const step = DECK_STEPS[p.step - 1];
  const pipeName = p.pipe ? _getDeckData(_deckSite()).stages.flatMap(s => s.pipes || []).find(q => q.id === p.pipe)?.name : '';
  const lines = [
    `<strong style="color:#fff">📍 ${DECK_CIRCLED[p.step - 1]} ${step.short} 점검</strong> <span style="color:${DECK_LV_COLOR[lv]}">${DECK_LV_ICON[lv]}</span>`,
    pipeName ? `<span style="color:#fde68a">${_deckEsc(pipeName)}</span>` : '',
    `이격 ${p.sep !== '' && p.sep != null ? `<b>${p.sep}cm</b>` : '-'}` + (p.step === 1 ? ` · 케이싱 ${p.casing === 'yes' ? '매설 ✓' : p.casing === 'no' ? '미매설' : '-'}` : ''),
    [p.date, p.inspector].filter(Boolean).map(_deckEsc).join(' · '),
    p.memo ? `<span style="color:#cbd5e1">${_deckEsc(p.memo)}</span>` : '',
  ].filter(Boolean);
  tt.innerHTML = lines.join('<br>');
  tt.style.display = 'block';
}
