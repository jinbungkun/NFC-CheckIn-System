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

// [UI] 포커스 상태 표시
function updateFocusUI() {
  const indicator = document.getElementById('focus-indicator');
  if (isUserTyping) {
    indicator.innerText = "⌨️ 입력 중";
    indicator.className = "focus-typing";
  } else {
    indicator.innerText = "📡 리더기 대기";
    indicator.className = "focus-nfc";
  }
}

// [UI] NFC 포커스 강제
function focusNfc() {
  if (isUserTyping || isApiLoading) return;
  if (document.activeElement.tagName !== 'INPUT') {
    nfcBridge.focus({ preventScroll: true });
  }
}

// [UI] 입력 감지 가드
function initFocusGuard() {
  document.querySelectorAll('input').forEach(el => {
    if (el.id === 'nfc-bridge') return;
    el.addEventListener('focus', () => { isUserTyping = true; updateFocusUI(); });
    el.addEventListener('blur', () => { 
      setTimeout(() => { isUserTyping = false; updateFocusUI(); focusNfc(); }, 500); 
    });
  });
}

// [API] 통신 함수
async function callApi(data, showLoader = true) {
  const url = localStorage.getItem('GAS_URL');
  if(!url && data.action !== 'initSheet') { showPage('settings'); return null; }
  if (showLoader) {
    isApiLoading = true;
    document.getElementById('loader').style.display = 'flex';
  }
  try {
    const res = await fetch(url, { method: 'POST', body: JSON.stringify(data) });
    return await res.json();
  } catch (e) { return null; }
  finally { 
    if (showLoader) {
      isApiLoading = false; 
      document.getElementById('loader').style.display = 'none'; 
      updateFocusUI(); 
      focusNfc(); 
    }
  }
}

// [기능] 출석 체크 로직 (낙관적 UI)
function doCheckin() {
  const input = document.getElementById('manual-id');
  const id = input.value.trim();
  if(!id) return;

  input.value = ""; 

  const student = quickMap[id]; 
  
  if (student) {
    const today = new Date().toLocaleDateString('sv-SE');
    if (student.lastDate === today) {
      renderCheckinUI(student.name, "이미 오늘 출석했습니다! ⚠️", "var(--accent)");
      return;
    }

    renderCheckinUI(student.name, "출석 완료! ✅", "var(--success)");
    student.lastDate = today; 

    callApi({ action: 'checkin', id: id }, false).then(res => {
      if (!res || !res.success) {
        if (res && res.status !== "already") {
          student.lastDate = ""; 
          renderCheckinUI(student.name, "서버 저장 실패 ❌", "var(--danger)");
        }
      }
    });
  } else {
    renderCheckinUI("조회 중", "명단 확인 중...", "var(--muted)");
    callApi({ action: 'checkin', id: id }, true).then(res => {
      if (res && res.success) {
        renderCheckinUI(res.name, "출석 성공!", "var(--success)");
        quickMap[id] = { name: res.name, lastDate: new Date().toLocaleDateString('sv-SE') };
      } else {
        renderCheckinUI("실패", res.message || "미등록 정보", "var(--danger)");
      }
    });
  }
}

function renderCheckinUI(name, msg, color) {
  document.getElementById('checkin-result').innerHTML = `
    <div class="student-info-card" style="text-align:center; border: 2px solid ${color};">
      <h3 style="color:${color}; margin: 5px 0;">${name}</h3>
      <p style="margin: 5px 0; font-weight: bold;">${msg}</p>
    </div>`;
}

// [관리자] 모드 전환
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
    } else { alert("비밀번호 오류"); }
  } else {
    isAdmin = false;
    localStorage.setItem('IS_ADMIN_ACTIVE', 'false');
    updateAdminUI();
  }
}

function updateAdminUI() {
  document.querySelectorAll('.admin-only-btn').forEach(el => el.style.display = isAdmin ? 'block' : 'none');
  const status = document.getElementById('mode-status');
  status.innerText = isAdmin ? "● 관리자 모드" : "● 학생 모드";
  status.className = isAdmin ? "admin-active" : "";
  document.querySelector('.admin-lock-btn').innerText = isAdmin ? "🔓" : "🔒";
}

// [UI] 페이지 이동
function showPage(p) {
  document.querySelectorAll('.page').forEach(el => el.classList.remove('active'));
  document.getElementById('page-' + p).classList.add('active');
  document.querySelectorAll('.nav button').forEach(el => el.classList.remove('active'));
  document.getElementById('nav-' + p).classList.add('active');
  isUserTyping = false;
  updateFocusUI();
  setTimeout(focusNfc, 300);
}

// [NFC] 리더기 입력 이벤트
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
    } else if (activePage === 'page-search') {
      findByNfc(val, 'search');
    } else if (activePage === 'page-point') {
      findByNfc(val, 'point');
    } else if (activePage === 'page-card') {
      const newInp = document.getElementById('new-card-input');
      if (newInp) newInp.value = val;
      else findByNfc(val, 'card');
    }
  }
}

// [관리자] 명단 조회 및 렌더링
async function refreshSchema(force = false) {
  if (!force && currentHeaders.length > 0) return renderAddFields();
  const res = await callApi({ action: 'getSchema' });
  if (!res || !res.headers) return;
  currentHeaders = res.headers;
  renderAddFields();
}

function renderAddFields() {
  const container = document.getElementById('dynamic-add-fields');
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

// [개선] 학생 검색 (로컬 캐시 우선 검색으로 로더 방지)
function findStudent(type) {
  const inputId = type === 'search' ? 'search-input' : (type === 'point' ? 'point-search-input' : 'card-search-input');
  const query = document.getElementById(inputId).value.trim();
  if (!query) return;

  const results = [];
  // 서버에 물어보지 않고 메모리(quickMap)에서 즉시 필터링
  for (const id in quickMap) {
    const student = quickMap[id];
    if (student.name.includes(query) || id.includes(query)) {
      results.push({ 
        'ID': id, 
        '이름': student.name, 
        '마지막출석': student.lastDate, 
        '포인트': student.point || 0 // 초기 로드 시 포인트도 가져오도록 initQuickMap 수정 필요
      });
    }
  }

  // 즉시 화면 렌더링 (로더 자체가 필요 없음)
  renderResults(results, type);
  
  if (results.length === 0) {
    const containerId = type === 'search' ? 'search-results' : (type === 'point' ? 'point-target-area' : 'card-target-area');
    document.getElementById(containerId).innerHTML = "<p style='text-align:center; padding:20px; color:var(--muted);'>로컬 명단에 없습니다.</p>";
  }
}

// [개선] 카드 태그 조회 (100% 로컬 quickMap 사용)
function findByNfc(id, type) {
  const student = quickMap[id];
  if (student) {
    renderResults([{ 
      'ID': id, 
      '이름': student.name, 
      '마지막출석': student.lastDate, 
      '포인트': student.point || 0 
    }], type);
  } else {
    alert("로컬 명단에 없는 카드입니다. (새 학생 등록 필요)");
  }
}

async function findByNfc(id, type) {
  const res = await callApi({ action: 'searchName', name: '' }, true);
  if (res && res.data) {
    const student = res.data.find(s => String(s['ID']) === String(id));
    if (student) renderResults([student], type);
    else alert("등록되지 않은 카드입니다.");
  }
}

function renderResults(data, type) {
  const containerId = type === 'search' ? 'search-results' : (type === 'point' ? 'point-target-area' : 'card-target-area');
  const container = document.getElementById(containerId);
  if (!data || data.length === 0) {
    container.innerHTML = "<p style='text-align:center; padding:20px; color:var(--muted);'>결과가 없습니다.</p>";
    return;
  }
  container.innerHTML = data.map(s => {
    const infoLines = currentHeaders.map(header => {
        let val = s[header] !== undefined ? s[header] : "";
        if ((header === "마지막출석" || header === "등록일") && val) {
          const d = new Date(val);
          if (!isNaN(d.getTime())) {
            const Y = d.getFullYear();
            const M = String(d.getMonth() + 1).padStart(2, '0');
            const D = String(d.getDate()).padStart(2, '0');
            const h = String(d.getHours()).padStart(2, '0');
            const m = String(d.getMinutes()).padStart(2, '0');
            val = header === "마지막출석" ? `${Y}-${M}-${D} ${h}:${m}` : `${Y}-${M}-${D}`;
          }
        }
        return `<div class="detail-info"><b>${header}:</b> ${val}</div>`;
      }).join('');

    return `
      <div class="student-info-card">
        <div class="student-header">
          <span style="font-size:1.1rem; font-weight:bold; color:white;">${s['이름'] || '미기입'}</span>
          <span style="color:var(--accent); font-weight:bold;">${s['포인트'] || 0} pt</span>
        </div>
        <div style="margin: 10px 0;">${infoLines}</div>
        ${type === 'point' ? `
          <div class="point-grid">
            <button class="btn btn-success" onclick="updatePt('${s['ID']}', 100, event)">+100</button>
            <button class="btn btn-success" onclick="updatePt('${s['ID']}', 500, event)">+500</button>
            <button class="btn btn-primary" onclick="updatePt('${s['ID']}', prompt('금액 입력'), event)">직접</button>
          </div>` : ''}
        ${type === 'card' ? `
          <input type="text" id="new-card-input" placeholder="새 카드 태그" readonly>
          <button class="btn btn-danger" onclick="execCardChange('${s['ID']}', '${s['이름']}')">교체 확정</button>` : ''}
      </div>`;
  }).join('');
}

// [관리자] 학생 추가 / 포인트 수정 / 카드 교체
async function registerStudent() {
  const idVal = document.getElementById('field-ID').value;
  const nameVal = document.getElementById('field-이름').value;
  if(!idVal) return alert("카드를 태그하여 ID를 먼저 입력하세요.");
  if(!nameVal) return alert("학생 이름을 입력하세요.");
  const fields = {};
  currentHeaders.forEach(h => {
    const el = document.getElementById(`field-${h}`);
    if(el) fields[h] = el.value;
  });
  const res = await callApi({ action: 'add', fields: fields });
  if(res && res.success) { alert("등록 완료"); initQuickMap(); showPage('checkin'); }
}

// [개선] 포인트 지급 (버튼 피드백 즉시 제공 + 백그라운드 전송)
async function updatePt(id, amt, event) {
  if (!amt || isNaN(amt)) return;
  const amount = Number(amt);
  
  const btn = event ? event.target : null;
  const originalText = btn ? btn.innerText : "";

  if (btn) {
    btn.innerText = "전송됨 ✅";
    btn.style.opacity = "0.5";
    btn.disabled = true;
    setTimeout(() => {
      btn.innerText = originalText;
      btn.style.opacity = "1";
      btn.disabled = false;
    }, 2000);
  }

  callApi({ action: 'updatePoint', id: id, amount: amount }, false).then(res => {
    if (!res || !res.success) {
      console.error("포인트 지급 실패:", id);
      if (btn) btn.innerText = "재시도 ❌";
    } else {
      console.log("포인트 지급 완료:", id, amount);
    }
  });
}

async function execCardChange(oldId, name) {
  const newId = document.getElementById('new-card-input').value;
  if(!newId) return alert("새 카드를 태그하세요.");
  const res = await callApi({ action: 'updateId', oldId: oldId, newId: newId });
  if(res.success) { alert("교체 완료"); initQuickMap(); showPage('checkin'); }
}

// [설정] 저장
async function saveSettings() {
  const url = document.getElementById('cfg-url').value;
  localStorage.setItem('GAS_URL', url);
  const res = await callApi({ action: 'initSheet', pw: document.getElementById('cfg-pw').value });
  if(res) { alert("연결 성공!"); refreshSchema(true); initQuickMap(); }
}

// [시작] 초기 실행
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

// [UI] 빈곳 클릭 시 포커스 복구
document.body.onclick = (e) => {
  if(e.target.tagName !== 'INPUT') { isUserTyping = false; updateFocusUI(); focusNfc(); }
};