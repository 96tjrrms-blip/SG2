// ===== Supabase 초기화 =====
const SUPABASE_URL = 'https://iiefjednuxqgdizcgmzy.supabase.co';   // ← 교체
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlpZWZqZWRudXhxZ2RpemNnbXp5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzkzMjkyMTYsImV4cCI6MjA5NDkwNTIxNn0.bJrayDIgG-ABnWElK9urmpTjhekDzYw-mnEE1sXxcVQ';                       // ← 교체
const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// ===== 현장 목록 (sites 테이블 고정값과 동일) =====
const SITE_NAMES = ['115정거장', '15환기구', '16환기구'];

// ===== 공정입회 기본 항목 =====
const DEFAULT_PROCESS = [
  '줄파기 입회',
  '파일천공 입회',
  '굴착 참관',
  '차수공사 확인',
  '방호공사 확인',
  '되메우기 참관'
];

// ===== 안전조치 기본 항목 =====
const DEFAULT_SAFETY = [
  '배관보호커버 시공',
  '배관 매달기',
  '횡진방지 조치',
  '케이싱·코킹',
  '가스누출 경보기 설치',
  '가스차단밸브 확인',
  '침하관측공 설치',
  '지표침하계 설치',
  '변위측정기 설치',
  '외부손상 점검',
  '경계표지판 설치',
  '점검통로 설치'
];

// ===== 규정집 데이터 (regulations 테이블 미사용 시 로컬 fallback) =====
const REGULATIONS = [
  {
    id: 'r1', title: '줄파기 입회', category: '공정입회',
    ref: '3.1절', pages: '206~208p',
    summary: '배관 위치 확인을 위한 인력굴착. 삼천리 참관 의무.',
    items: [
      '배관 깊이 1.5m 이상 구간은 인력굴착 의무',
      '예상 위치 미발견 시 2.0m 이상 인력굴착 시행',
      '줄파기 전 배관탐지기 조사 필수',
      '삼천리 담당자 참관 의무 (사전 협의 필요)',
    ]
  },
  {
    id: 'r2', title: '파일천공 입회', category: '공정입회',
    ref: '3.2절', pages: '215~216p',
    summary: '가스배관 근접 천공 시 삼천리 참관 및 이격거리 기준 준수.',
    items: [
      '배관 수평거리 2m 이내 파일박기 시 삼천리 참관 하 시험굴착 후 실시',
      '배관과 수평거리 30cm 이내 파일박기 절대 금지',
      '가이드파이프 사용 시 배관에서 500mm(50cm) 이상 이격',
    ]
  },
  {
    id: 'r3', title: '굴착 참관', category: '공정입회',
    ref: '3.1절', pages: '206~208p',
    summary: '개착 굴착 시 최소 2일 전 사전 협의 및 삼천리 참관.',
    items: [
      '굴착 최소 2일 전 삼천리에 사전 참관 요청 의무',
      '굴착기계 작업 반경 내 가스배관 진입 금지',
      '배관 2m 이내 구간 중장비 가동 금지',
      '배관 주위 1m 이내는 반드시 인력굴착',
    ]
  },
  {
    id: 'r4', title: '차수공사 확인', category: '공정입회',
    ref: '3.3절', pages: '218~225p',
    summary: '토류판 후면 차수그라우팅 시 가스배관 근접 안전시공 기준.',
    items: [
      '도시가스관 양측 외관에서 50cm 이격하여 순차 차수벽 설치',
      '도시가스관 하단 이격된 부분은 철판 설치 후 방수처리',
    ]
  },
  {
    id: 'r5', title: '방호공사 확인', category: '공정입회',
    ref: '3.1절', pages: '208p',
    summary: '참관시기별 확인 내용 기준.',
    items: [
      '[파일·토류판 설치 시] 배관과의 거리, 항타기와 배관 위치 확인',
      '[노출배관 방호공사 시] 방호설비 재료·강도, 매달림 지지대 느슨해짐 확인',
      '[되메우기 직전] 배관·받침대 틈새, 가스누출, 배관손상 확인',
    ]
  },
  {
    id: 'r6', title: '되메우기 참관', category: '공정입회',
    ref: '6.4절', pages: '258~259p',
    summary: '삼천리 전담자 참관 필수. 시공 순서 준수.',
    items: [
      '삼천리 안전관리 전담자 참관검사 필수 (2일 전 사전 요청)',
      '시공 순서: 모래채우기 → 보호판 → 보호포 → 라인마크',
      '완료 후 3개월 이상 침하 여부 확인',
    ]
  },
  {
    id: 'r7', title: '배관보호커버 시공', category: '안전조치',
    ref: '5.3절', pages: '248p',
    summary: '노출 즉시 설치. 안쪽→바깥쪽 순서로 겹겹이 시공.',
    items: [
      '가스관 노출과 동시에 즉시 보호커버 설치',
      '시공 순서: ①고무판 10t ②마스테이프(방수비닐) ③THP관 ④불연재료 ⑤스틸밴드',
    ]
  },
  {
    id: 'r8', title: '배관 매달기', category: '안전조치',
    ref: '5.2절', pages: '243~246p',
    summary: '매달기 간격 2m 이내. 노출길이 기준 초과 시 의무 적용.',
    items: [
      '매달기 간격: 2m 이내',
      '용접접합 강관: 양끝 지지 시 6.0m, 기타 3.0m 초과 시 매달기 의무',
      '노출부 선단·종단부는 강관 케이싱 + 코킹 처리 필수',
    ]
  },
  {
    id: 'r9', title: '횡진방지 조치', category: '안전조치',
    ref: '5.4절', pages: '249p',
    summary: '노출 15m 이상 배관에 진동방지 목적으로 15m 이내 간격 설치.',
    items: [
      '적용 대상: 노출 연장 15m 이상인 매달기 방호 배관',
      '설치 간격: 15m 이내',
      '시점·중간부·종점부 반드시 설치',
    ]
  },
  {
    id: 'r10', title: '케이싱·코킹', category: '안전조치',
    ref: '5.2절', pages: '245p',
    summary: '매달기 노출부 선단·종단부 및 토류벽 관통 구간 필수 적용.',
    items: [
      '매달기 노출부 선단부·종단부에 강관 케이싱 설치',
      '케이싱 설치 후 코킹 처리 (방수·기밀 목적)',
      '토류벽 선단부·종단부 관통 구간 필수 적용',
    ]
  },
  {
    id: 'r11', title: '가스누출 경보기 설치', category: '안전조치',
    ref: '6.7절', pages: '262~263p',
    summary: '검지부 20m 이내 간격. 현장사무실·경비초소 경보부 설치.',
    items: [
      '검지부 설치 간격: 20m 이내',
      '플랜지·밸브·수취기 등 부속시설물 위치에 필히 추가 설치',
      '경보부 설치: 현장사무실 + 작업현장 + 경비초소',
    ]
  },
  {
    id: 'r12', title: '가스차단밸브 확인', category: '안전조치',
    ref: '6.8절', pages: '265p',
    summary: '노출부 양끝 300m 이내 차단장치 설치 의무.',
    items: [
      '노출부 양 끝단에서 300m 이내에 차단장치 설치',
      '비상 공구 상시 준비: 빠루 4개, 파이프 2개, 파이프렌치 2개',
    ]
  },
  {
    id: 'r13', title: '침하관측공 설치', category: '안전조치',
    ref: '6.3절', pages: '258p',
    summary: '줄파기 시 동시 설치. 10일 1회 측정 원칙.',
    items: [
      '설치 시기: 줄파기 공사 시 동시 설치',
      '설치 간격: 영향범위 내 20m 이하 간격',
      '측정 주기: 10일에 1회 이상',
    ]
  },
  {
    id: 'r14', title: '지표침하계 설치', category: '안전조치',
    ref: '6.9절', pages: '268~272p',
    summary: '영향범위 내 전 구간 공사 전 기간 설치·측정.',
    items: [
      '영향범위 내 지표침하계 설치 후 공사 전 기간 측정',
      '허용 기준치 초과 시 즉시 공사 중단 후 삼천리 협의',
    ]
  },
  {
    id: 'r15', title: '변위측정기 설치', category: '안전조치',
    ref: '6.3절', pages: '258p',
    summary: '수직·수평 변위 동시 측정.',
    items: [
      '수직·수평 변위 동시 측정',
      '공사 전 초기치 기록 후 매 측정 시 비교',
    ]
  },
  {
    id: 'r16', title: '외부손상 점검', category: '안전조치',
    ref: '6.2절', pages: '256~257p',
    summary: '노출 배관 전구간 일일 안전점검 실시.',
    items: [
      '일일 안전점검 실시 (노출 배관 전구간)',
      '가스누출 검사, 피복·외부커버 손상, 적재물, 이격거리 확인',
    ]
  },
  {
    id: 'r17', title: '경계표지판 설치', category: '안전조치',
    ref: '6.5절', pages: '259~261p',
    summary: '"위험 도시가스" 경계표지판을 배관에 직접 부착.',
    items: [
      '경계표지판: 배관에 직접 부착',
      '삼천리 연락처: 080-3002-119 명시',
    ]
  },
  {
    id: 'r18', title: '점검통로 설치', category: '안전조치',
    ref: '6.5절', pages: '259~261p',
    summary: '노출구간 전체 L=250m. 폭 80cm 이상.',
    items: [
      '노출구간 전체 L=250m 설치',
      '폭: 80cm 이상, 높이: 200cm 내외',
      '가드레일 1m 높이 + 안전그물 설치',
    ]
  },
  {
    id: 'r19', title: '허용진동 기준', category: '기타',
    ref: '3.1절', pages: '210~211p',
    summary: '발파·항타 등 진동 작업 시 배관별 허용 기준.',
    items: [
      '노출가스관: 0.4cm/s 이하',
      '매설가스관: 1.0cm/s 이하',
    ]
  },
  {
    id: 'r20', title: '이상상황 대응 절차', category: '기타',
    ref: '6.2절', pages: '256p',
    summary: '가스냄새·누출 감지 시 즉시 공사 중단 및 삼천리 연락.',
    items: [
      '가스냄새 감지 시 즉시 공사 중단',
      '비상연락: 080-3002-119 (삼천리 24시간)',
    ]
  },
];

// ===== Supabase Storage (pipe-photos 버킷) =====
const PIPE_PHOTO_BUCKET = 'pipe-photo';

async function uploadPipePhoto(segId, file, subSegId) {
  const ext    = file.name.split('.').pop().toLowerCase() || 'jpg';
  const folder = subSegId ? `${segId}/${subSegId}` : segId;
  const path   = `${folder}/${Date.now()}.${ext}`;
  const { error } = await sb.storage.from(PIPE_PHOTO_BUCKET).upload(path, file, {
    cacheControl: '3600', upsert: false
  });
  if (error) throw error;
  return { path, url: getPipePhotoUrl(path) };
}

function getPipePhotoUrl(path) {
  const { data } = sb.storage.from(PIPE_PHOTO_BUCKET).getPublicUrl(path);
  return data.publicUrl;
}

async function listPipePhotos(segId, subSegId) {
  const folder = subSegId ? `${segId}/${subSegId}` : segId;
  const { data, error } = await sb.storage.from(PIPE_PHOTO_BUCKET).list(folder, {
    sortBy: { column: 'name', order: 'desc' }
  });
  if (error || !data) return [];
  return data
    .filter(f => f.name && f.name !== '.emptyFolderPlaceholder')
    .map(f => ({
      path: `${folder}/${f.name}`,
      url: getPipePhotoUrl(`${folder}/${f.name}`)
    }));
}

async function deletePipePhotoStorage(path) {
  const { error } = await sb.storage.from(PIPE_PHOTO_BUCKET).remove([path]);
  if (error) throw error;
}

// ===== 드론사진 (pipe-photo 버킷 / drone/ 폴더) =====
window.listDronePhotos = async function() {
  const { data, error } = await sb.storage.from(PIPE_PHOTO_BUCKET).list('drone', {
    sortBy: { column: 'name', order: 'asc' }
  });
  if (error || !data) return [];
  return data
    .filter(f => f.name && f.name !== '.emptyFolderPlaceholder')
    .map(f => {
      const path = `drone/${f.name}`;
      const { data: urlData } = sb.storage.from(PIPE_PHOTO_BUCKET).getPublicUrl(path);
      return { path, url: urlData.publicUrl };
    });
};

window.uploadDronePhoto = async function(file) {
  const ext  = file.name.split('.').pop().toLowerCase() || 'jpg';
  const path = `drone/${Date.now()}_${file.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
  const { error } = await sb.storage.from(PIPE_PHOTO_BUCKET).upload(path, file, {
    cacheControl: '3600', upsert: false
  });
  if (error) throw error;
  const { data } = sb.storage.from(PIPE_PHOTO_BUCKET).getPublicUrl(path);
  return { path, url: data.publicUrl };
};

window.deleteDronePhotoStorage = async function(path) {
  const { error } = await sb.storage.from(PIPE_PHOTO_BUCKET).remove([path]);
  if (error) throw error;
};

// ── pipe_settings 테이블 (크로스디바이스 동기화) ──────────────
async function fetchAllPipeSettings() {
  const { data, error } = await sb.from('pipe_settings').select('*');
  if (error || !data) return {};
  const result = {};
  data.forEach(row => { result[row.seg_id] = row; });
  return result;
}

async function upsertPipeSettings(segId, patch) {
  await sb.from('pipe_settings').upsert(
    { seg_id: segId, ...patch, updated_at: new Date().toISOString() },
    { onConflict: 'seg_id' }
  );
}

// ===== DB API 함수 =====

/** sites 테이블에서 { name → id } 맵 반환 */
async function getSiteMap() {
  const { data, error } = await sb.from('sites').select('id, name');
  if (error) throw error;
  return Object.fromEntries(data.map(s => [s.name, s.id]));
}

/** 현장별 field_items 전체 조회 (checklist_items 포함) */
async function fetchFieldItems(siteId) {
  const { data, error } = await sb
    .from('field_items')
    .select(`*, checklist_items(*)`)
    .eq('site_id', siteId)
    .order('id');
  if (error) throw error;
  return data;
}

/** field_item 단건 조회 */
async function fetchFieldItem(fieldItemId) {
  const { data, error } = await sb
    .from('field_items')
    .select(`*, checklist_items(*)`)
    .eq('id', fieldItemId)
    .single();
  if (error) throw error;
  return data;
}

/** field_item upsert (due_date, memo, status, process_checked, safety_checked) */
async function upsertFieldItem(payload) {
  const { id, ...updateFields } = payload;
  const { data, error } = await sb
    .from('field_items')
    .update(updateFields)
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return data;
}

/** checklist_item 체크 토글 */
async function updateChecklistItem(id, checked) {
  const { error } = await sb
    .from('checklist_items')
    .update({ checked })
    .eq('id', id);
  if (error) throw error;
}

/** custom checklist_item 추가 */
async function insertChecklistItem(fieldItemId, type, content) {
  const { data, error } = await sb
    .from('checklist_items')
    .insert({ field_item_id: fieldItemId, type, content, checked: false })
    .select()
    .single();
  if (error) throw error;
  return data;
}

/** checklist_item 삭제 (custom 항목) */
async function deleteChecklistItem(id) {
  const { error } = await sb.from('checklist_items').delete().eq('id', id);
  if (error) throw error;
}

/** field_item에 기본 checklist_items 초기 삽입 (신규 항목일 때만) */
async function seedChecklistItems(fieldItemId) {
  const rows = [
    ...DEFAULT_PROCESS.map(c => ({ field_item_id: fieldItemId, type: 'process', content: c, checked: false })),
    ...DEFAULT_SAFETY.map(c => ({ field_item_id: fieldItemId, type: 'safety', content: c, checked: false })),
  ];
  const { error } = await sb.from('checklist_items').insert(rows);
  if (error) throw error;
}

/** SMS 로그 삽입 */
async function insertSmsLog(fieldItemId, phone, message) {
  const { error } = await sb
    .from('sms_logs')
    .insert({ field_item_id: fieldItemId, phone, message });
  if (error) throw error;
}

/** SMS 로그 최신 N건 조회 */
async function fetchSmsLogs(limit = 3) {
  const { data, error } = await sb
    .from('sms_logs')
    .select(`*, field_items(item_name)`)
    .order('sent_at', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data;
}

// ===== 천공 마커 사진 (pipe-photo 버킷 재사용, 경로: boring/{id}/) =====
async function uploadBoringPhoto(boringId, file) {
  const ext  = file.name.split('.').pop().toLowerCase() || 'jpg';
  const path = `boring/${boringId}/${Date.now()}.${ext}`;
  const { error } = await sb.storage.from(PIPE_PHOTO_BUCKET).upload(path, file, {
    cacheControl: '3600', upsert: false
  });
  if (error) throw error;
  return { path, url: getPipePhotoUrl(path) };
}

async function listBoringPhotos(boringId) {
  const folder = `boring/${boringId}`;
  const { data, error } = await sb.storage.from(PIPE_PHOTO_BUCKET).list(folder, {
    sortBy: { column: 'name', order: 'desc' }
  });
  if (error || !data) return [];
  return data
    .filter(f => f.name && f.name !== '.emptyFolderPlaceholder')
    .map(f => ({ path: `${folder}/${f.name}`, url: getPipePhotoUrl(`${folder}/${f.name}`) }));
}

async function deleteBoringPhoto(path) {
  const { error } = await sb.storage.from(PIPE_PHOTO_BUCKET).remove([path]);
  if (error) throw error;
}
