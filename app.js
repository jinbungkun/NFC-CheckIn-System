// [상태 관리 변수]
let isAdmin = false;
let isUserTyping = false;
let isApiLoading = false;
let currentHeaders = [];
let quickMap = {};
const nfcBridge = document.getElementById('nfc-bridge');

const PAGE_CONFIG = {
  checkin:  { inputId: 'CheckIn' },
  search:   { inputId: 'Search' },
  point:    { inputId: 'Point' },
  card:     { inputId: 'Card' },
  register: { inputId: 'Register' } 
};

// [1. 초기화]
window.onload = async () => {
  // 1. 로컬 스토리지에서 즉시 관리자 여부 확인
  const savedAdminStatus = localStorage.getItem('IS_ADMIN_ACTIVE');
  isAdmin = (savedAdminStatus === 'true'); // 불리언 타입으로 확실히 변환

  // 2. 서버 통신(await) 전에 UI부터 관리자 상태로 강제 고정
  // 이 코드가 서버 응답을 기다리기 전에 실행되어야 '학생용'으로 안 보입니다.
  updateAdminUI(); 

  const url = localStorage.getItem('GAS_URL');
  if (!url) {
    showPage('settings'); 
  } else {
    // UI 고정 후 백그라운드에서 데이터 로드
    await refreshSchema();
    await initQuickMap();
  }

  initFocusGuard();
  updateFocusUI();
  focusNfc();
  setInterval(focusNfc, 2000);
};

async function initQuickMap() {
  const res = await callApi({ action: 'getQuickMap' }, false);
  if (res && res.success) {
    quickMap = res.data;
    console.log("캐시 로드 완료");
  }
}

// [2. API 통신]
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

// [3. 데이터 조회/검색]
async function fetchData(query = '', source = 'LOCAL') {
  if (source === 'SERVER') {
    const res = await callApi({ action: 'searchName', name: query }, true);
    return res?.data || [];
  }
  const q = query.toLowerCase();
  return Object.entries(quickMap)
    .filter(([id, s]) => s.name.toLowerCase().includes(q) || id.includes(q))
    .map(([id, s]) => ({ ID: id, 이름: s.name, 마지막출석: s.lastDate, 포인트: s.point || 0 }));
}

async function findStudent(pageType) {
  const config = PAGE_CONFIG[pageType];
  const query = document.getElementById(config.inputId).value.trim();
  if (!query) return;
  const source = (pageType === 'search' || pageType === 'card') ? 'SERVER' : 'LOCAL';
  const data = await fetchData(query, source);
  renderResults(data, pageType);
}

async function findByNfc(id, pageType) {
  const source = (pageType === 'search' || pageType === 'card') ? 'SERVER' : 'LOCAL';
  const data = await fetchData('', source); 
  const found = data.filter(s => String(s.ID) === String(id));
  if (found.length > 0) renderResults(found, pageType);
  else alert(`명단에 없습니다.`);
}

// [4. 출석 체크]
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
      } else renderCheckinUI("실패", res.message || "미등록 정보", "var(--danger)");
    });
  }
}

function renderCheckinUI(name, msg, color) {
  const target = document.getElementById('checkin-result');
  if (target) {
    target.innerHTML = `<div class="student-info-card" style="text-align:center; border: 2px solid ${color};">
      <h3 style="color:${color}; margin: 5px 0;">${name}</h3>
      <p style="margin: 5px 0; font-weight: bold;">${msg}</p></div>`;
  }
}

// [5. 포인트 관리]
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

function updatePtManual(id, event) {
  const input = document.getElementById(`pt-inp-${id}`);
  if (!input || !input.value) return alert("포인트를 입력하세요");
  updatePt(id, input.value, event);
  input.value = "";
}

// [6. 학생 등록 및 카드 교체]
async function registerStudent() {
  const fields = {};
  currentHeaders.forEach(h => {
    const el = document.getElementById(h === 'ID' ? PAGE_CONFIG.register.inputId : `field-${h}`);
    if (el) fields[h] = el.value.trim();
  });
  if(!fields['ID'] || !fields['이름']) return alert("ID와 이름은 필수입니다.");
  const res = await callApi({ action: 'add', fields: fields }, true);
  if(res && res.success) { alert("등록 완료!"); await initQuickMap(); showPage('checkin'); }
}

async function execCardChange(oldId, name) {
  const newId = document.getElementById('new-card-input').value;
  if(!newId) return alert("새 카드를 태그하세요.");
  const res = await callApi({ action: 'updateId', oldId: oldId, newId: newId });
  if(res && res.success) { alert("교체 완료"); await initQuickMap(); showPage('checkin'); }
}

// [7. 페이지 관리 및 관리자 모드]
function showPage(p) {
  // [1] 모든 페이지 섹션 숨기기
  document.querySelectorAll('.page').forEach(el => el.classList.remove('active'));
  
  // [2] 선택한 페이지만 활성화
  const targetPage = document.getElementById('page-' + p);
  if (targetPage) targetPage.classList.add('active');

  // [3] 네비게이션 버튼 강조 상태 업데이트
  document.querySelectorAll('.nav button').forEach(btn => {
    btn.classList.toggle('active', btn.id === 'nav-' + p);
  });

  // [4] ★ 핵심: 모든 입력창(Input) 데이터 즉시 초기화 ★
  // 설정(URL, 비번)과 NFC 브릿지만 제외하고 전부 비움
  document.querySelectorAll('input').forEach(input => {
    const skipIds = ['nfc-bridge', 'cfg-url', 'cfg-pw'];
    if (!skipIds.includes(input.id) && input.type !== 'button') {
      input.value = ""; 
    }
  });

  // [5] ★ 핵심: 화면에 표시된 모든 조회 결과(UI) 초기화 ★
  const resultContainers = [
    'checkin-result',     // 출석 결과 창
    'search-results',     // 조회 리스트
    'point-target-area',  // 포인트 대상 창
    'card-target-area'    // 카드 교체 대상 창
  ];
  resultContainers.forEach(id => {
    const el = document.getElementById(id);
    if (el) el.innerHTML = ""; // 이전 페이지의 결과물을 싹 지움
  });

  // [6] 페이지별 특수 설정 (관리자 등록 필드 재생성 등)
  if (p === 'settings') {
    document.getElementById('cfg-url').value = localStorage.getItem('GAS_URL') || "";
  }
  if (p === 'add') renderAddFields();

  // 포커스 복구
  isUserTyping = false;
  updateFocusUI();
  setTimeout(focusNfc, 300);
}

// [7. 페이지 관리 및 관리자 모드] - 이 부분 아래에 붙여넣으세요.

/**
 * 관리자 모드 토글 함수
 * 비밀번호를 입력받아 관리자 권한을 활성화/비활성화합니다.
 */
async function toggleAdmin() {
  if (!isAdmin) {
    // 포커스 탈취 방지
    isUserTyping = true;
    updateFocusUI();

    // 모바일 브라우저 안정성을 위해 약간의 지연 후 prompt 실행
    setTimeout(async () => {
      const pw = prompt("관리자 비밀번호를 입력하세요.");
      
      if (!pw) {
        isUserTyping = false;
        focusNfc();
        return;
      }

      const res = await callApi({ action: 'verifyPw', pw: pw.trim() });
      
      if (res && res.success) {
        isAdmin = true;
        localStorage.setItem('IS_ADMIN_ACTIVE', 'true');
        updateAdminUI();
        await refreshSchema(true);
        alert("관리자 모드가 활성화되었습니다.");
      } else {
        alert("비밀번호 오류: [" + pw + "]");
      }
      
      isUserTyping = false;
      updateFocusUI();
      focusNfc();
    }, 100);

  } else {
    // 관리자 모드 해제
    if (confirm("관리자 모드를 종료하시겠습니까?")) {
      isAdmin = false;
      localStorage.setItem('IS_ADMIN_ACTIVE', 'false');
      updateAdminUI();
      showPage('checkin'); // 해제 시 출석 페이지로 이동
    }
  }
}

/**
 * 관리자 상태에 따른 UI 업데이트 (중복 정의 제거 및 통합 버전)
 */
function updateAdminUI() {
  // 1. 관리자 전용 요소 표시/숨김
  document.querySelectorAll('.admin-only-btn').forEach(el => {
    el.style.display = isAdmin ? 'inline-block' : 'none';
  });

  // 2. 상태 바 텍스트 및 스타일 업데이트
  const status = document.getElementById('mode-status');
  if (status) {
    status.innerText = isAdmin ? "● 관리자 모드" : "● 학생 모드";
    status.className = isAdmin ? "admin-active" : "";
  }

  // 3. 자물쇠 아이콘 업데이트
  const lockBtn = document.querySelector('.admin-lock-btn');
  if (lockBtn) {
    lockBtn.innerText = isAdmin ? "🔓" : "🔒";
  }

  // 4. 권한 체크: 관리자가 아닌데 관리자 페이지에 있으면 강제 퇴거
  const activePage = document.querySelector('.page.active');
  const adminPages = ['page-search', 'page-point', 'page-card', 'page-add'];
  
  if (!isAdmin && activePage && adminPages.includes(activePage.id)) {
    showPage('checkin');
  }
}

// [8. 설정 및 스키마]
async function saveSettings() {
  const url = document.getElementById('cfg-url').value.trim();
  localStorage.setItem('GAS_URL', url);
  const res = await callApi({ action: 'initSheet', pw: document.getElementById('cfg-pw').value });
  if(res) { alert("연결 성공!"); await refreshSchema(true); await initQuickMap(); showPage('checkin'); }
}

async function refreshSchema(force = false) {
  if (!force && currentHeaders.length > 0) return renderAddFields();
  const res = await callApi({ action: 'getSchema' });
  if (res?.headers) { currentHeaders = res.headers; renderAddFields(); }
}

function renderAddFields() {
  const container = document.getElementById('dynamic-add-fields');
  if (!container) return;
  container.innerHTML = "";
  currentHeaders.forEach(header => {
    if (['포인트', '등록일', '마지막출석'].includes(header)) return;
    const input = document.createElement('input');
    input.placeholder = header;
    if (header === 'ID') { input.id = PAGE_CONFIG.register.inputId; input.readOnly = true; input.placeholder = "ID (카드를 태그하세요)"; }
    else { input.id = `field-${header}`; }
    container.appendChild(input);
  });
  initFocusGuard();
}

// [9. 결과 렌더링]
function renderResults(data, type) {
  const containerId = type === 'search' ? 'search-results' : (type === 'point' ? 'point-target-area' : 'card-target-area');
  const container = document.getElementById(containerId);
  if (!container) return;
  if (!data || data.length === 0) { container.innerHTML = `<p style="text-align:center; padding:20px; color:var(--muted);">결과가 없습니다.</p>`; return; }

  container.innerHTML = data.map(s => {
    let infoLines = type === 'point' ? `<div style="margin: 5px 0; color:var(--muted); font-size:0.9rem;">ID: ${s['ID']}</div>` :
      currentHeaders.map(h => {
        let val = s[h] || "";
        if ((h === "마지막출석" || h === "등록일") && val) val = String(val).substring(0, 10);
        return `<div class="detail-info"><b>${h}:</b> ${val}</div>`;
      }).join('');

    return `<div class="student-info-card">
      <div class="student-header"><span style="font-size:1.1rem; font-weight:bold; color:white;">${s['이름'] || '미기입'}</span><span style="color:var(--accent); font-weight:bold;">${s['포인트'] || 0} pt</span></div>
      <div style="margin: 10px 0;">${infoLines}</div>
      ${type === 'point' ? `<div class="point-grid" style="grid-template-columns: repeat(3, 1fr); gap:5px; margin-bottom:8px;">
        ${[100, 300, 500].map(v => `<button class="btn btn-success" onclick="updatePt('${s['ID']}', ${v}, event)">+${v}</button>`).join('')}
      </div><div style="display:flex; gap:5px;"><input type="number" id="pt-inp-${s['ID']}" placeholder="지급" style="flex:1; padding:8px; border-radius:4px;"><button class="btn btn-primary" onclick="updatePtManual('${s['ID']}', event)">지급</button></div>` : ''}
      ${type === 'card' ? `<input type="text" id="new-card-input" placeholder="새 카드 태그" readonly><button class="btn btn-danger" onclick="execCardChange('${s['ID']}', '${s['이름']}')">교체 확정</button>` : ''}
    </div>`;
  }).join('');
}

// [10. 포커스 및 NFC 리스너]
function updateFocusUI() {
  const indicator = document.getElementById('focus-indicator');
  if (indicator) indicator.innerText = isUserTyping ? "⌨️ 입력 중" : "📡 리더기 대기";
}

function focusNfc() {
  if (isUserTyping || isApiLoading) return;
  if (document.activeElement.tagName !== 'INPUT') nfcBridge.focus({ preventScroll: true });
}

function initFocusGuard() {
  document.querySelectorAll('input').forEach(el => {
    if (el.id === 'nfc-bridge') return;
    el.addEventListener('focus', () => { isUserTyping = true; updateFocusUI(); });
    el.addEventListener('blur', () => { setTimeout(() => { isUserTyping = false; updateFocusUI(); focusNfc(); }, 500); });
  });
}

nfcBridge.addEventListener('keydown', (e) => {
  if(e.key === 'Enter') {
    const val = nfcBridge.value.trim();
    if(val) processNfc(val);
    nfcBridge.value = "";
  }
});

function processNfc(val) {
  const activePage = document.querySelector('.page.active');
  if (!activePage) return;
  const pageType = activePage.id.replace('page-', '');
  if (pageType === 'add') {
    const idInp = document.getElementById(PAGE_CONFIG.register.inputId);
    if (idInp) idInp.value = val;
  } else if (pageType === 'checkin') {
    document.getElementById(PAGE_CONFIG.checkin.inputId).value = val;
    doCheckin();
  } else if (pageType === 'card' && document.getElementById('new-card-input')) {
    document.getElementById('new-card-input').value = val;
  } else if (PAGE_CONFIG[pageType]) {
    findByNfc(val, pageType);
  }
}

document.body.onclick = (e) => { if(e.target.tagName !== 'INPUT') { isUserTyping = false; updateFocusUI(); focusNfc(); } };