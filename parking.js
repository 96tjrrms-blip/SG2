const PARKING_KEY = 'parking_spots';

function _getParkingSpots() {
  try { return JSON.parse(localStorage.getItem(PARKING_KEY) || '[]'); }
  catch { return []; }
}
function _saveParkingSpots(spots) {
  localStorage.setItem(PARKING_KEY, JSON.stringify(spots));
}
function _addParkingSpot(x, y) {
  const spots = _getParkingSpots();
  spots.push({ id: 'P' + Date.now(), x, y });
  _saveParkingSpots(spots);
}
function _removeParkingSpot(id) {
  _saveParkingSpots(_getParkingSpots().filter(s => s.id !== id));
}

function renderParkingSpots() {
  const svg = document.getElementById('overlay-svg');
  if (!svg) return;
  svg.querySelectorAll('.parking-marker').forEach(el => el.remove());

  const visible = localStorage.getItem('parking_visible') !== 'false';
  if (!visible) return;

  const container = document.getElementById('map-container');
  if (!container) return;
  const W = container.clientWidth;
  const H = container.clientHeight;
  if (!W || !H) return;

  const zoom = typeof getMapZoom === 'function' ? getMapZoom() : { scale:1, tx:0, ty:0 };

  _getParkingSpots().forEach(spot => {
    // 줌 적용 스크린 좌표
    const cx = (spot.x / 100) * W * zoom.scale + zoom.tx;
    const cy = (spot.y / 100) * H * zoom.scale + zoom.ty;

    const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    g.classList.add('parking-marker');
    g.dataset.id = spot.id;
    g.setAttribute('transform', `translate(${cx},${cy})`);
    g.style.cursor = 'pointer';
    g.style.pointerEvents = 'all';

    // 초록 원
    const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    circle.setAttribute('r', 16);
    circle.setAttribute('fill', '#16a34a');
    circle.setAttribute('fill-opacity', '0.9');
    circle.setAttribute('stroke', '#ffffff');
    circle.setAttribute('stroke-width', 2.5);

    // P 글자
    const pText = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    pText.setAttribute('text-anchor', 'middle');
    pText.setAttribute('dominant-baseline', 'middle');
    pText.setAttribute('font-size', '16');
    pText.setAttribute('font-weight', '900');
    pText.setAttribute('fill', '#ffffff');
    pText.setAttribute('font-family', 'sans-serif');
    pText.setAttribute('text-rendering', 'geometricPrecision');
    pText.textContent = 'P';

    // "주차위치" 텍스트 박스 (원 아래)
    const lblText  = '주차위치';
    const lblW     = 58;
    const lblH     = 22;
    const lblY     = 22;

    const labelBg = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    labelBg.setAttribute('x', -(lblW / 2));
    labelBg.setAttribute('y', lblY);
    labelBg.setAttribute('width', lblW);
    labelBg.setAttribute('height', lblH);
    labelBg.setAttribute('rx', 5);
    labelBg.setAttribute('fill', 'rgba(255,255,255,0.95)');
    labelBg.setAttribute('stroke', '#16a34a');
    labelBg.setAttribute('stroke-width', 1.5);

    const labelTxt = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    labelTxt.setAttribute('y', lblY + lblH * 0.73);
    labelTxt.setAttribute('text-anchor', 'middle');
    labelTxt.setAttribute('fill', '#15803d');
    labelTxt.setAttribute('font-size', '13');
    labelTxt.setAttribute('font-weight', '800');
    labelTxt.setAttribute('font-family', 'sans-serif');
    labelTxt.setAttribute('text-rendering', 'geometricPrecision');
    labelTxt.textContent = lblText;

    g.append(circle, pText, labelBg, labelTxt);

    // 클릭 → 삭제 (edit 모드 불필요, 항상 가능)
    g.addEventListener('click', e => {
      e.stopPropagation();
      if (confirm('이 주차위치를 삭제할까요?')) {
        _removeParkingSpot(spot.id);
        renderParkingSpots();
      }
    });

    svg.appendChild(g);
  });
}

function toggleParkingVisible() {
  const cur = localStorage.getItem('parking_visible') !== 'false';
  localStorage.setItem('parking_visible', cur ? 'false' : 'true');
  _updateParkingBtn();
  renderParkingSpots();
}

function _updateParkingBtn() {
  const visible = localStorage.getItem('parking_visible') !== 'false';
  const btn = document.getElementById('parking-toggle-btn');
  if (btn) btn.textContent = visible ? '🅿 주차위치 숨기기' : '🅿 주차위치 표시';
}

window._parkingEditMode = false;

function toggleParkingEdit() {
  window._parkingEditMode = !window._parkingEditMode;
  const btn     = document.getElementById('parking-edit-btn');
  const overlay = document.getElementById('parking-add-overlay');

  if (btn) {
    btn.textContent   = window._parkingEditMode ? '🅿 주차편집 ON' : '🅿 주차 편집';
    btn.style.background  = window._parkingEditMode ? '#dcfce7' : '';
    btn.style.color       = window._parkingEditMode ? '#15803d' : '';
    btn.style.borderColor = window._parkingEditMode ? '#16a34a' : '';
  }
  if (overlay) overlay.style.display = window._parkingEditMode ? 'block' : 'none';

  if (window._parkingEditMode && localStorage.getItem('parking_visible') === 'false') {
    localStorage.setItem('parking_visible', 'true');
    _updateParkingBtn();
  }
  renderParkingSpots();
}

window._onParkingAddClick = function(e) {
  const container = document.getElementById('map-container');
  if (!container) return;
  const rect = container.getBoundingClientRect();
  const zoom = typeof getMapZoom === 'function' ? getMapZoom() : { scale:1, tx:0, ty:0 };
  const rawX = (e.clientX - rect.left - zoom.tx) / zoom.scale;
  const rawY = (e.clientY - rect.top  - zoom.ty) / zoom.scale;
  _addParkingSpot(+(rawX / container.clientWidth  * 100).toFixed(2),
                  +(rawY / container.clientHeight * 100).toFixed(2));
  renderParkingSpots();
};

// 줌/리사이즈 이벤트 → 재렌더
document.addEventListener('map-zoom-changed', renderParkingSpots);
window.addEventListener('resize', function() {
  clearTimeout(window._parkingResizeT);
  window._parkingResizeT = setTimeout(renderParkingSpots, 150);
});

document.addEventListener('DOMContentLoaded', () => {
  _updateParkingBtn();
  renderParkingSpots();
});
