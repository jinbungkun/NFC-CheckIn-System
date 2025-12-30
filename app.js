let isAdmin = false;
let isUserTyping = false;
let isApiLoading = false;
let currentHeaders = [];
let quickMap = {};
const nfcBridge = document.getElementById('nfc-bridge');

// [설정] 페이지별 입력창 ID 매핑 (직관적 대문자 네이밍)
const PAGE_CONFIG = {
  checkin:  { inputId: 'CheckIn' },
  search:   { inputId: 'Search' },
  point:    { inputId: 'Point' },
  card:     { inputId: 'Card' },
  register: { inputId: 'Register' } // 학생 추가(Register) 페이지의 ID 입력 필드용
};

// [초기화] 데이터 로드 (기능 유지)
async function initQuickMap() {
  const res = await callApi({ action: 'getQuickMap' }, false);
  if (res && res.success) {
    quickMap = res.data;
    console.log("캐시 로드 완료");
  }
}

// [API] 통신 함수 (기능 및 안정성 유지)
async function callApi(data, showLoader = true) {
  const url = localStorage.getItem('GAS_URL');
  const loader = document.getElementById('loader');
  if(!url && data.action !== 'initSheet') { showPage('settings'); return null; }
  
  if (showLoader) {
    isApiLoading = true;
    if (loader) loader.style.display = 'flex';
  }
  
  try {
    const res = await fetch(url, { method: 'POST', body: JSON.stringify(data) });
    return await res.json();
  } catch (e) { 
    console.error("API Error:", e);
    return null; 
  } finally { 
    if (showLoader) {
      isApiLoading = false; 
      if (loader) loader.style.display = 'none'; 
      updateFocusUI(); 
      focusNfc(); 
    }
  }
}

// [조회 핵심] 상황에 따라 서버/로컬 소스를 선택하여 데이터 반환
async function fetchData(query = '', source = 'LOCAL') {
  if (source === 'SERVER') {
    const res = await callApi({ action: 'searchName', name: query }, true);
    return res?.data || [];
  }
  
  // LOCAL 모드: quickMap 검색
  const q = query.toLowerCase();
  return Object.entries(quickMap)
    .filter(([id, s]) => s.name.toLowerCase().includes(q) || id.includes(q))
    .map(([id, s]) => ({
      ID: id, 이름: s.name, 마지막출석: s.lastDate, 포인트: s.point || 0
    }));
}

// [기능] 이름/ID 검색 (페이지 특성에 따라 소스 결정)
async function findStudent(pageType) {
  const config = PAGE_CONFIG[pageType];
  const query = document.getElementById(config.inputId).value.trim();
  if (!query) return;

  // Search와 Card 교체는 'SERVER'에서 최신 정보를, 나머지는 'LOCAL' 사용
  const source = (pageType === 'search' || pageType === 'card') ? 'SERVER' : 'LOCAL';
  const data = await fetchData(query, source);
  renderResults(data, pageType);
}

// [기능] NFC 태그 검색
async function findByNfc(id, pageType) {
  const source = (pageType === 'search' || pageType === 'card') ? 'SERVER' : 'LOCAL';
  const data = await fetchData('', source); 
  const found = data.filter(s => String(s.ID) === String(id));

  if (found.length > 0) {
    renderResults(found, pageType);
  } else {
    alert(`명단에 없습니다. (조회: ${source})`);
  }
}

// [기능] 출석 체크 (낙관적 UI 및 로컬 업데이트 유지)
function doCheckin() {
  const input = document.getElementById(PAGE_CONFIG.checkin.inputId);
  const id = input.value.trim();
  if(!id) return;
  input.value = ""; 

  const student = quickMap[id]; 
  const today = new Date().toLocaleDateString('sv-SE');
  
  if (student) {
    if (student.lastDate === today) {
      renderCheckinUI(student.name, "이미 오늘 출석했습니다! ⚠️", "var(--accent)");
      return;
    }
    renderCheckinUI(student.name, "출석 완료! ✅", "var(--success)");
    student.lastDate = today; 
    callApi({ action: 'checkin', id: id }, false);
  } else {
    renderCheckinUI("조회 중", "명단 확인 중...", "var(--muted)");
    callApi({ action: 'checkin', id: id }, true).then(res => {
      if (res && res.success) {
        renderCheckinUI(res.name, "출석 성공!", "var(--success)");
        quickMap[id] = { name: res.name, lastDate: today, point: (res.point || 0) };
      } else {
        renderCheckinUI("실패", res.message || "미등록 정보", "var(--danger)");
      }
    });
  }
}

// [포인트] 업데이트 (로컬 선반영 유지)
async function updatePt(id, amt, event) {
  const amount = Number(amt);
  if (isNaN(amount)) return;
  
  const btn = event ? event.target : null;
  const originalText = btn ? btn.innerText : "";
  if (btn) {
    btn.innerText = "전송됨 ✅";
    btn.disabled = true;
    setTimeout(() => { btn.innerText = originalText; btn.disabled = false; }, 2000);
  }

  if(quickMap[id]) quickMap[id].point = (Number(quickMap[id].point) || 0) + amount;
  callApi({ action: 'updatePoint', id: id, amount: amount }, false);
}

// [NFC] 입력 처리 브릿지
function processNfc(val) {
  const activePage = document.querySelector('.page.active');
  if (!activePage) return;
  const pageType = activePage.id.replace('page-', '');

  if (pageType === 'add') {
    // 학생 등록 시 ID 필드(Register)에 값 입력
    const idInp = document.getElementById(PAGE_CONFIG.register.inputId);
    if (idInp) idInp.value = val;
  } else if (pageType === 'checkin') {
    document.getElementById(PAGE_CONFIG.checkin.inputId).value = val;
    doCheckin();
  } else if (pageType === 'card' && document.getElementById('new-card-input')) {
    // 카드 교체 중 새 카드 입력 시
    document.getElementById('new-card-input').value = val;
  } else if (PAGE_CONFIG[pageType]) {
    findByNfc(val, pageType);
  }
}

// [UI] 화면 렌더링 및 보조 기능들 (기존 기능 100% 유지)
function renderResults(data, type) {
  const containerId = type === 'search' ? 'search-results' : (type === 'point' ? 'point-target-area' : 'card-target-area');
  const container = document.getElementById(containerId);
  if (!container) return;

  if (!data || data.length === 0) {
    container.innerHTML = `<p style="text-align:center; padding:20px; color:var(--muted);">결과가 없습니다.</p>`;
    return;
  }

  container.innerHTML = data.map(s => {
    let infoLines = type === 'point' 
      ? `<div style="margin: 5px 0; color:var(--muted); font-size:0.9rem;">ID: ${s['ID']}</div>`
      : currentHeaders.map(h => {
          let val = s[h] || "";
          if ((h === "마지막출석" || h === "등록일") && val) val = String(val).substring(0, 10);
          return `<div class="detail-info"><b>${h}:</b> ${val}</div>`;
        }).join('');

    return `
      <div class="student-info-card">
        <div class="student-header">
          <span style="font-size:1.1rem; font-weight:bold; color:white;">${s['이름'] || '미기입'}</span>
          <span style="color:var(--accent); font-weight:bold;">${s['포인트'] || 0} pt</span>
        </div>
        <div style="margin: 10px 0;">${infoLines}</div>
        ${type === 'point' ? `
          <div class="point-grid" style="grid-template-columns: repeat(3, 1fr); gap:5px; margin-bottom:8px;">
            ${[100, 300, 500].map(v => `<button class="btn btn-success" onclick="updatePt('${s['ID']}', ${v}, event)">+${v}</button>`).join('')}
          </div>
          <div style="display:flex; gap:5px;">
            <input type="number" id="pt-inp-${s['ID']}" placeholder="직접 입력" style="flex:1; padding:8px; border-radius:4px; border:none;">
            <button class="btn btn-primary" style="width:60px;" onclick="updatePtManual('${s['ID']}', event)">지급</button>
          </div>` : ''}
        ${type === 'card' ? `
          <input type="text" id="new-card-input" placeholder="새 카드 태그" readonly>
          <button class="btn btn-danger" onclick="execCardChange('${s['ID']}', '${s['이름']}')">교체 확정</button>` : ''}
      </div>`;
  }).join('');
}

/** * 기타 UI 보조 함수(updateFocusUI, focusNfc, initFocusGuard, toggleAdmin, showPage, 
 * renderAddFields, refreshSchema 등)는 기존 작성된 최신 기능을 그대로 유지합니다. 
 **/