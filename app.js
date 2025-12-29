let isAdmin = false;
let isUserTyping = false;
let isApiLoading = false;
let currentHeaders = [];
let quickMap = {};
const nfcBridge = document.getElementById('nfc-bridge');

// [초기화] 데이터 로드
async function initQuickMap() {
  const res = await callApi({ action: 'getQuickMap' }, false);
  if (res && res.success) {
    quickMap = res.data;
    console.log("캐시 로드 완료");
  }
}

// [UI] 포커스 및 상태 관리
function updateFocusUI() {
  const indicator = document.getElementById('focus-indicator');
  if (!indicator) return;
  indicator.innerText = isUserTyping ? "⌨️ 입력 중" : "📡 리더기 대기";
  indicator.className = isUserTyping ? "focus-typing" : "focus-nfc";
}

function focusNfc() {
  if (isUserTyping || isApiLoading) return;
  if (document.activeElement.tagName !== 'INPUT') {
    nfcBridge.focus({ preventScroll: true });
  }
}

function initFocusGuard() {
  document.querySelectorAll('input').forEach(el => {
    if (el.id === 'nfc-bridge') return;
    el.addEventListener('focus', () => { isUserTyping = true; updateFocusUI(); });
    el.addEventListener('blur', () => { 
      setTimeout(() => { isUserTyping = false; updateFocusUI(); focusNfc(); }, 500); 
    });
  });
}

// [API] 통신 함수 (기능 유지 및 안정성 강화)
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
    const result = await res.json();
    return result;
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

// [기능] 출석 체크 (낙관적 UI 및 로컬 업데이트)
function doCheckin() {
  const input = document.getElementById('manual-id');
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
    // 낙관적 UI 적용
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

function renderCheckinUI(name, msg, color) {
  const target = document.getElementById('checkin-result');
  if (target) {
    target.innerHTML = `
      <div class="student-info-card" style="text-align:center; border: 2px solid ${color};">
        <h3 style="color:${color}; margin: 5px 0;">${name}</h3>
        <p style="margin: 5px 0; font-weight: bold;">${msg}</p>
      </div>`;
  }
}

// [검색] 공통 로직 통합 (최적화 핵심)
async function findStudent(type) {
  const inputId = type === 'search' ? 'search-input' : (type === 'point' ? 'point-search-input' : 'card-search-input');
  const query = document.getElementById(inputId).value.trim();
  if (!query) return;

  if (type === 'search') {
    const res = await callApi({ action: 'searchName', name: query }, true);
    renderResults(res && res.data ? res.data : [], type);
  } else {
    const results = Object.entries(quickMap)
      .filter(([id, s]) => s.name.includes(query) || id.includes(query))
      .map(([id, s]) => ({ ID: id, 이름: s.name, 마지막출석: s.lastDate, 포인트: s.point || 0 }));
    renderResults(results, type);
  }
}

async function findByNfc(id, type) {
  if (type === 'search') {
    const res = await callApi({ action: 'searchName', name: '' }, true); 
    const found = res && res.data ? res.data.find(s => String(s['ID']) === String(id)) : null;
    if (found) renderResults([found], type);
    else alert("명단에 없는 카드입니다.");
  } else {
    const s = quickMap[id];
    if (s) renderResults([{ ID: id, 이름: s.name, 마지막출석: s.lastDate, 포인트: s.point || 0 }], type);
    else alert("로컬 명단에 없습니다.");
  }
}

// [렌더링] 결과 화면 출력 (기능 유지)
function renderResults(data, type) {
  const containerId = type === 'search' ? 'search-results' : (type === 'point' ? 'point-target-area' : 'card-target-area');
  const container = document.getElementById(containerId);
  if (!container) return;

  if (!data || data.length === 0) {
    container.innerHTML = `<p style="text-align:center; padding:20px; color:var(--muted);">${type === 'search' ? '결과가 없습니다.' : '로컬 명단에 없습니다.'}</p>`;
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

// [포인트] 기능 유지
function updatePtManual(id, event) {
  const input = document.getElementById(`pt-inp-${id}`);
  if (!input || !input.value) return alert("포인트를 입력하세요");
  updatePt(id, input.value, event);
  input.value = "";
}

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

// [관리자] 기능 유지 (학생 추가, 카드 교체)
async function registerStudent() {
  const fields = {};
  currentHeaders.forEach(h => {
    const el = document.getElementById(`field-${h}`);
    if (el) fields[h] = el.value.trim();
  });

  if(!fields['ID'] || !fields['이름']) return alert("ID와 이름은 필수입니다.");

  const res = await callApi({ action: 'add', fields: fields }, true);
  if(res && res.success) { 
    alert("등록 완료!"); 
    await initQuickMap();
    showPage('checkin'); 
  } else alert("실패: " + (res ? res.message : "서버 오류"));
}

async function execCardChange(oldId, name) {
  const newId = document.getElementById('new-card-input').value;
  if(!newId) return alert("새 카드를 태그하세요.");
  const res = await callApi({ action: 'updateId', oldId: oldId, newId: newId });
  if(res && res.success) { alert("교체 완료"); initQuickMap(); showPage('checkin'); }
}

// [설정/관리자] 기능 유지
async function saveSettings() {
  const url = document.getElementById('cfg-url').value;
  localStorage.setItem('GAS_URL', url);
  const res = await callApi({ action: 'initSheet', pw: document.getElementById('cfg-pw').value });
  if(res) { alert("연결 성공!"); refreshSchema(true); initQuickMap(); }
}

async function toggleAdmin() {
  if (!isAdmin) {
    const pw = prompt("관리자 비밀번호");
    if (!pw) return;
    const res = await callApi({ action: 'verifyPw', pw: pw });
    if (res && res.success) {
      isAdmin = true;
      localStorage.setItem('IS_ADMIN_ACTIVE', 'true');
      updateAdminUI();
      await refreshSchema();
    } else alert("비밀번호 오류");
  } else {
    isAdmin = false;
    localStorage.setItem('IS_ADMIN_ACTIVE', 'false');
    updateAdminUI();
  }
}

function updateAdminUI() {
  document.querySelectorAll('.admin-only-btn').forEach(el => el.style.display = isAdmin ? 'block' : 'none');
  const status = document.getElementById('mode-status');
  if (status) {
    status.innerText = isAdmin ? "● 관리자 모드" : "● 학생 모드";
    status.className = isAdmin ? "admin-active" : "";
  }
  const lockBtn = document.querySelector('.admin-lock-btn');
  if (lockBtn) lockBtn.innerText = isAdmin ? "🔓" : "🔒";
}

async function refreshSchema(force = false) {
  if (!force && currentHeaders.length > 0) return renderAddFields();
  const res = await callApi({ action: 'getSchema' });
  if (res && res.headers) {
    currentHeaders = res.headers;
    renderAddFields();
  }
}

function renderAddFields() {
  const container = document.getElementById('dynamic-add-fields');
  if (!container) return;
  container.innerHTML = "";
  currentHeaders.forEach(header => {
    if (['포인트', '등록일', '마지막출석'].includes(header)) return;
    const input = document.createElement('input');
    input.placeholder = header;
    input.id = `field-${header}`;
    if (header === 'ID') { input.readOnly = true; input.placeholder = "ID (카드를 태그하세요)"; }
    container.appendChild(input);
  });
  initFocusGuard();
}

// [UI] 페이지 이동 및 데이터 완전 초기화 (유지)
function showPage(p) {
  document.querySelectorAll('.page').forEach(el => el.classList.remove('active'));
  const targetPage = document.getElementById('page-' + p);
  if (targetPage) targetPage.classList.add('active');

  document.querySelectorAll('.nav button').forEach(btn => {
    btn.classList.remove('active');
    if (btn.id === 'nav-' + p) btn.classList.add('active');
  });

  document.querySelectorAll('input').forEach(input => {
    if (!['nfc-bridge', 'cfg-url', 'cfg-pw'].includes(input.id) && input.type !== 'button') {
      input.value = "";
    }
  });

  if (p === 'settings') document.getElementById('cfg-url').value = localStorage.getItem('GAS_URL') || "";

  const resetMap = {
    'checkin': 'checkin-result',
    'search': 'search-results',
    'point': 'point-target-area',
    'card': 'card-target-area'
  };

  if (resetMap[p]) {
    const el = document.getElementById(resetMap[p]);
    if (el) {
      el.innerHTML = p === 'checkin' 
        ? '<div class="student-info-card" style="text-align:center; color:var(--muted); border:1px dashed var(--muted); padding:20px;">ID를 입력하거나 카드를 태그하세요.</div>'
        : (p === 'point' ? "<p style='text-align:center; padding:20px; color:var(--muted);'>학생을 검색하거나 카드를 태그하세요.</p>" : "");
    }
  }

  if (p === 'add') renderAddFields();

  isUserTyping = false;
  updateFocusUI();
  setTimeout(focusNfc, 300);
}

// [NFC] 입력 처리 (유지)
nfcBridge.addEventListener('keydown', (e) => {
  if(e.key === 'Enter') {
    const val = nfcBridge.value.trim();
    if(val) processNfc(val);
    nfcBridge.value = "";
  }
});

function processNfc(val) {
  const activePage = document.querySelector('.page.active').id;
  if (activePage === 'page-checkin') {
    document.getElementById('manual-id').value = val;
    doCheckin();
  } else if (isAdmin) {
    if (activePage === 'page-add') {
      const idInp = document.getElementById('field-ID');
      if (idInp) idInp.value = val;
    } else if (activePage === 'page-search') findByNfc(val, 'search');
    else if (activePage === 'page-point') findByNfc(val, 'point');
    else if (activePage === 'page-card') {
      const newInp = document.getElementById('new-card-input');
      if (newInp) newInp.value = val;
      else findByNfc(val, 'card');
    }
  }
}

window.onload = () => {
  const url = localStorage.getItem('GAS_URL');
  if(url) {
    document.getElementById('cfg-url').value = url;
    refreshSchema();
    initQuickMap();
  }
  isAdmin = localStorage.getItem('IS_ADMIN_ACTIVE') === 'true';
  updateAdminUI();
  initFocusGuard();
  updateFocusUI();
  focusNfc();
  setInterval(focusNfc, 2000);
};

document.body.onclick = (e) => {
  if(e.target.tagName !== 'INPUT') { isUserTyping = false; updateFocusUI(); focusNfc(); }
};