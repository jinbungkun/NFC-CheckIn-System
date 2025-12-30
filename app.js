// [상태 관리 변수]
let isAdmin = false;
let isUserTyping = false;
let isApiLoading = false;
let currentHeaders = [];
let quickMap = {}; // 학생 데이터를 담는 캐시
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
  // 로컬 스토리지에서 관리자 활성화 여부 확인
  const savedAdminStatus = localStorage.getItem('IS_ADMIN_ACTIVE');
  isAdmin = (savedAdminStatus === 'true');

  updateAdminUI(); 

  const url = localStorage.getItem('GAS_URL');
  if (!url) {
    showPage('settings'); 
  } else {
    // 초기 로딩: 스키마(헤더)와 학생 목록을 가져옴
    await refreshSchema();
    await initQuickMap();
  }

  initFocusGuard();
  updateFocusUI();
  focusNfc();
  setInterval(focusNfc, 2000);
};

// [2. 데이터 로드: handleGetQuickMap 매칭]
async function initQuickMap() {
  const res = await callApi({ action: 'getQuickMap' }, false);
  if (res && res.success) {
    quickMap = res.data;
    console.log("학생 데이터 동기화 완료");
    
    // 현재 활성화된 페이지가 조회 페이지라면 목록 리렌더링
    const activePage = document.querySelector('.page.active');
    if (activePage && (activePage.id === 'page-search' || activePage.id === 'page-point')) {
        const input = document.getElementById(PAGE_CONFIG[activePage.id.replace('page-','')]?.inputId);
        if (input && input.value) findStudent(activePage.id.replace('page-',''));
    }
  }
}

// [3. API 통신 공통 함수]
async function callApi(data, showLoader = true) {
  const url = localStorage.getItem('GAS_URL');
  const loader = document.getElementById('loader');
  
  if(!url && data.action !== 'getSchema') { showPage('settings'); return null; }
  
  if (showLoader) {
    isApiLoading = true;
    if (loader) loader.style.display = 'flex';
  }
  
  try {
    const res = await fetch(url, { method: 'POST', body: JSON.stringify(data) });
    const json = await res.json();
    return json;
  } catch (e) { 
    console.error("API Error:", e);
    return { success: false, message: "연결 오류가 발생했습니다." }; 
  } finally { 
    if (showLoader) {
      isApiLoading = false; 
      if (loader) loader.style.display = 'none'; 
      updateFocusUI(); 
      focusNfc(); 
    }
  }
}

// [4. 데이터 조회/검색: 로컬 캐시 활용]
function fetchData(query = '') {
  const q = query.toLowerCase();
  // 서버에 매번 묻지 않고 앱에 로드된 quickMap에서 즉시 필터링 (속도 극대화)
  return Object.entries(quickMap)
    .filter(([id, s]) => s.name.toLowerCase().includes(q) || id.includes(q))
    .map(([id, s]) => ({ 
        ID: id, 
        이름: s.name, 
        마지막출석: s.lastDate, 
        포인트: s.point || 0,
        상태: s.status,
        전화번호: s.phone,
        생년월일: s.birth
    }));
}

async function findStudent(pageType) {
  const config = PAGE_CONFIG[pageType];
  const query = document.getElementById(config.inputId).value.trim();
  const data = fetchData(query);
  renderResults(data, pageType);
}

function findByNfc(id, pageType) {
  const data = fetchData(''); 
  const found = data.filter(s => String(s.ID) === String(id));
  if (found.length > 0) renderResults(found, pageType);
  else alert(`명단에 등록되지 않은 카드입니다.`);
}

// [5. 출석 체크: handleCheckin 매칭]
async function doCheckin() {
  const input = document.getElementById(PAGE_CONFIG.checkin.inputId);
  const id = input.value.trim();
  if(!id) return;
  input.value = ""; 

  // 1. 로컬에서 먼저 확인 (반응성 최우선)
  const student = quickMap[id]; 
  const today = new Date().toLocaleDateString('sv-SE');
  
  if (student && student.lastDate === today) {
    renderCheckinUI(student.name, "이미 오늘 출석했습니다! ⚠️", "var(--accent)");
    return;
  }

  // 2. 서버 전송
  const res = await callApi({ action: 'checkin', id: id }, true);
  if (res && res.success) {
    renderCheckinUI(res.name, res.message || "출석 성공! ✅", "var(--success)");
    // 캐시 업데이트
    if (quickMap[id]) {
        quickMap[id].lastDate = today;
        quickMap[id].point = (Number(quickMap[id].point) || 0) + 10;
    } else {
        await initQuickMap(); // 신규라면 전체 로드
    }
  } else {
    renderCheckinUI(res?.name || "실패", res?.message || "미등록 카드", "var(--danger)");
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

// [6. 포인트 관리: handleUpdatePoint 매칭]
async function updatePt(id, amt, event) {
  const amount = Number(amt);
  const btn = event ? event.target : null;
  
  if (btn) {
    btn.disabled = true;
    btn.innerText = "⏳";
  }

  const res = await callApi({ action: 'updatePoint', id: id, amount: amount }, false);
  
  if (res && res.success) {
    if(quickMap[id]) quickMap[id].point = res.newTotal;
    if (btn) btn.innerText = "✅";
    setTimeout(() => { if(btn) { btn.innerText = `+${amt}`; btn.disabled = false; } }, 1000);
    findStudent('point'); // 화면 갱신
  }
}

function updatePtManual(id, event) {
  const input = document.getElementById(`pt-inp-${id}`);
  if (!input || !input.value) return alert("포인트를 입력하세요");
  updatePt(id, input.value, event);
  input.value = "";
}

// [7. 학생 등록: handleAddStudent 매칭]
async function registerStudent() {
    const fields = {};
    const skipHeaders = ['포인트', '상태', '마지막출석', '등록일'];

    currentHeaders.forEach(h => {
        if (!skipHeaders.includes(h)) {
            const el = document.getElementById(h === 'ID' ? PAGE_CONFIG.register.inputId : `field-${h}`);
            if (el) fields[h] = el.value.trim();
        }
    });

    if (!fields['ID'] || !fields['이름']) return alert("ID와 이름은 필수입니다.");

    const res = await callApi({ action: 'add', fields: fields }, true);
    
    if (res && res.success) {
        // 필드 초기화
        currentHeaders.forEach(h => {
            if (!skipHeaders.includes(h)) {
                const el = document.getElementById(h === 'ID' ? PAGE_CONFIG.register.inputId : `field-${h}`);
                if (el) el.value = ""; 
            }
        });
        alert("등록 완료!");
        await initQuickMap(); 
        document.getElementById(PAGE_CONFIG.register.inputId).focus();
    }
}

// [8. 카드 교체: handleUpdateId 매칭]
async function execCardChange(oldId, name) {
  const newIdInput = document.getElementById('new-card-input');
  const newId = newIdInput ? newIdInput.value.trim() : "";
  
  if(!newId) return alert("새 카드를 태그하세요.");
  if(confirm(`${name} 학생의 카드를 교체하시겠습니까?`)) {
      const res = await callApi({ action: 'updateId', oldId: oldId, newId: newId }, true);
      if(res && res.success) { 
          alert("교체 완료"); 
          await initQuickMap(); 
          showPage('checkin'); 
      } else {
          alert(res.message);
      }
  }
}

// [9. 페이지 관리]
function showPage(p) {
  document.querySelectorAll('.page').forEach(el => el.classList.remove('active'));
  const targetPage = document.getElementById('page-' + p);
  if (targetPage) targetPage.classList.add('active');

  document.querySelectorAll('.nav button').forEach(btn => {
    btn.classList.toggle('active', btn.id === 'nav-' + p);
  });

  // 입력창 및 결과 UI 초기화
  document.querySelectorAll('input').forEach(input => {
    if (!['nfc-bridge', 'cfg-url'].includes(input.id) && input.type !== 'button') {
      input.value = ""; 
    }
  });

  const resultContainers = ['checkin-result', 'search-results', 'point-target-area', 'card-target-area'];
  resultContainers.forEach(id => { const el = document.getElementById(id); if (el) el.innerHTML = ""; });

  if (p === 'settings') {
    document.getElementById('cfg-url').value = localStorage.getItem('GAS_URL') || "";
  }
  if (p === 'add') renderAddFields();

  isUserTyping = false;
  updateFocusUI();
  setTimeout(focusNfc, 300);
}

// [10. 관리자 모드 (비밀번호 제거 버전)]
function toggleAdmin() {
  if (!isAdmin) {
    isAdmin = true;
    localStorage.setItem('IS_ADMIN_ACTIVE', 'true');
    alert("관리자 모드 활성화");
  } else {
    if (confirm("관리자 모드를 종료하시겠습니까?")) {
      isAdmin = false;
      localStorage.setItem('IS_ADMIN_ACTIVE', 'false');
      showPage('checkin');
    }
  }
  updateAdminUI();
}

function updateAdminUI() {
  document.querySelectorAll('.admin-only-btn').forEach(el => {
    el.style.display = isAdmin ? 'inline-block' : 'none';
  });
  const status = document.getElementById('mode-status');
  if (status) {
    status.innerText = isAdmin ? "● 관리자 모드" : "● 학생 모드";
    status.className = isAdmin ? "admin-active" : "";
  }
  const lockBtn = document.querySelector('.admin-lock-btn');
  if (lockBtn) lockBtn.innerText = isAdmin ? "🔓" : "🔒";
}

// [11. 설정 및 스키마]
async function saveSettings() {
  const url = document.getElementById('cfg-url').value.trim();
  localStorage.setItem('GAS_URL', url);
  // 스키마를 가져오며 연결 테스트
  const res = await callApi({ action: 'getSchema' }, true);
  if(res && res.headers) { 
      alert("연결 성공!"); 
      currentHeaders = res.headers;
      await initQuickMap(); 
      showPage('checkin'); 
  } else {
      alert("URL을 확인해주세요.");
  }
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
  const skipHeaders = ['포인트', '상태', '마지막출석', '등록일'];

  currentHeaders.forEach(header => {
    if (skipHeaders.includes(header)) return;
    const label = document.createElement('label');
    label.innerText = header;
    label.className = "field-label";
    container.appendChild(label);

    const input = document.createElement('input');
    if (header === 'ID') { 
      input.id = PAGE_CONFIG.register.inputId; 
      input.readOnly = true; 
      input.placeholder = "카드를 태그하세요"; 
    } else { 
      input.id = `field-${header}`; 
      input.placeholder = `${header} 입력`;
    }
    container.appendChild(input);
  });
}

// [12. 결과 렌더링]
function renderResults(data, type) {
  const containerId = type === 'search' ? 'search-results' : (type === 'point' ? 'point-target-area' : 'card-target-area');
  const container = document.getElementById(containerId);
  if (!container) return;
  if (!data || data.length === 0) { container.innerHTML = `<p style="text-align:center; padding:20px; color:var(--muted);">결과가 없습니다.</p>`; return; }

  container.innerHTML = data.map(s => {
    let infoLines = type === 'point' ? `<div style="margin: 5px 0; color:var(--muted); font-size:0.9rem;">ID: ${s.ID}</div>` :
      currentHeaders.map(h => {
        let val = s[h] || "";
        return `<div class="detail-info"><b>${h}:</b> ${val}</div>`;
      }).join('');

    return `<div class="student-info-card">
      <div class="student-header">
        <span style="font-size:1.1rem; font-weight:bold; color:white;">${s['이름']}</span>
        <span style="color:var(--accent); font-weight:bold;">${s['포인트']} pt</span>
      </div>
      <div style="margin: 10px 0;">${infoLines}</div>
      ${type === 'point' ? `<div class="point-grid" style="grid-template-columns: repeat(3, 1fr); gap:5px; margin-bottom:8px;">
        ${[10, 50, 100].map(v => `<button class="btn btn-success" onclick="updatePt('${s.ID}', ${v}, event)">+${v}</button>`).join('')}
      </div><div style="display:flex; gap:5px;"><input type="number" id="pt-inp-${s.ID}" placeholder="직접 입력" style="flex:1; padding:8px; border-radius:4px;"><button class="btn btn-primary" onclick="updatePtManual('${s.ID}', event)">지급</button></div>` : ''}
      ${type === 'card' ? `<div style="display:flex; flex-direction:column; gap:10px;"><input type="text" id="new-card-input" placeholder="새 카드 태그" readonly style="background:rgba(255,255,255,0.1); color:white;"><button class="btn btn-danger" onclick="execCardChange('${s.ID}', '${s['이름']}')">이 카드로 교체</button></div>` : ''}
    </div>`;
  }).join('');
}

// [13. 포커스 및 NFC 리스너]
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