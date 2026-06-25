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
  const svg = document.getElementById('map-svg');
  if (!svg) return;
  svg.querySelectorAll('.parking-marker').forEach(el => el.remove());

  const visible = localStorage.getItem('parking_visible') !== 'false';
  if (!visible) return;

  const W = svg.clientWidth  || svg.parentElement.clientWidth;
  const H = svg.clientHeight || svg.parentElement.clientHeight;

  _getParkingSpots().forEach(spot => {
    const cx = (spot.x / 100) * W;
    const cy = (spot.y / 100) * H;

    const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    g.classList.add('parking-marker');
    g.dataset.id = spot.id;
    g.setAttribute('transform', `translate(${cx},${cy})`);

    const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    circle.setAttribute('r', 14);
    circle.setAttribute('fill', '#16a34a');
    circle.setAttribute('fill-opacity', '0.88');
    circle.setAttribute('stroke', '#ffffff');
    circle.setAttribute('stroke-width', 2.5);

    const label = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    label.setAttribute('text-anchor', 'middle');
    label.setAttribute('dominant-baseline', 'middle');
    label.setAttribute('font-size', '14');
    label.setAttribute('font-weight', '900');
    label.setAttribute('fill', '#ffffff');
    label.setAttribute('font-family', 'sans-serif');
    label.textContent = 'P';

    g.append(circle, label);

    if (window._parkingEditMode) {
      g.style.cursor = 'pointer';
      g.title = '클릭하여 삭제';
      g.addEventListener('click', e => {
        e.stopPropagation();
        _removeParkingSpot(spot.id);
        renderParkingSpots();
      });
    }
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

document.addEventListener('DOMContentLoaded', () => {
  _updateParkingBtn();
  renderParkingSpots();
});
