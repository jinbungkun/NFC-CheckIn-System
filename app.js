let isAdmin = false;
let isUserTyping = false;
let isApiLoading = false;
let currentHeaders = [];
let quickMap = {};
const nfcBridge = document.getElementById('nfc-bridge');

// [초기화] 데이터 로드 (앱 켤 때 캐시 저장)
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
  } catch (e) { 
    console.error(e);
    return null; 
  } finally { 
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
    callApi({ action: 'checkin', id: id }, false);
  } else {
    renderCheckinUI("조회 중", "명단 확인 중...", "var(--muted)");
    callApi({ action: 'checkin', id: id }, true).then(res => {
      if (res && res.success) {
        renderCheckinUI(res.name, "출석 성공!", "var(--success)");
        quickMap[id] = { name: res.name, lastDate: new Date().toLocaleDateString('sv-SE'), point: res.point || 0 };
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

// [검색] 이름/ID 입력 검색 (서버 vs 로컬 분기 처리)
async function findStudent(type) {
  const inputId = type === 'search' ? 'search-input' : (type === 'point' ? 'point-search-input' : 'card-search-input');
  const query = document.getElementById(inputId).value.trim();
  if (!query) return;

  // 1. [일반 조회]는 무조건 서버에서 최신 데이터 가져오기
  if (type === 'search') {
    const res = await callApi({ action: 'searchName', name: query }, true); // 로딩창 ON
    if (res && res.data) {
      renderResults(res.data, type);
    } else {
      document.getElementById('search-results').innerHTML = "<p style='text-align:center; padding:20px; color:var(--muted);'>검색 결과가 없습니다.</p>";
    }
    return;
  }

  // 2. [포인트/카드]는 로컬 quickMap 사용 (속도 최우선)
  const results = [];
  for (const id in quickMap) {
    const student = quickMap[id];
    if (student.name.includes(query) || id.includes(query)) {
      results.push({ 
        'ID': id, 
        '이름': student.name, 
        '마지막출석': student.lastDate, 
        '포인트': student.point || 0 
      });
    }
  }
  renderResults(results, type);
  
  if (results.length === 0) {
    const containerId = type === 'point' ? 'point-target-area' : 'card-target-area';
    document.getElementById(containerId).innerHTML = "<p style='text-align:center; padding:20px; color:var(--muted);'>로컬 명단에 없습니다.</p>";
  }
}

// [검색] NFC 태그 (서버 vs 로컬 분기 처리)
async function findByNfc(id, type) {
  // 1. [일반 조회]는 서버에서 최신 데이터 확인
  if (type === 'search') {
    // 이름 없이 호출하면 전체 혹은 ID 검색 로직이 서버에 있다고 가정
    const res = await callApi({ action: 'searchName', name: '' }, true); 
    if (res && res.data) {
      // 서버 결과에서 ID 매칭
      const found = res.data.find(s => String(s['ID']) === String(id));
      if (found) renderResults([found], type);
      else alert("서버 명단에 없는 카드입니다.");
    }
    return;
  }

  // 2. [포인트/카드]는 로컬 데이터 사용
  const student = quickMap[id];
  if (student) {
    renderResults([{ 
      'ID': id, 
      '이름': student.name, 
      '마지막출석': student.lastDate, 
      '포인트': student.point || 0 
    }], type);
  } else {
    alert("로컬 명단에 없습니다. (새로고침 필요할 수 있음)");
  }
}

// [렌더링] 결과 화면 출력 (포인트 UI 간소화 및 버튼 변경 적용)
function renderResults(data, type) {
  const containerId = type === 'search' ? 'search-results' : (type === 'point' ? 'point-target-area' : 'card-target-area');
  const container = document.getElementById(containerId);
  if (!data || data.length === 0) {
    container.innerHTML = "<p style='text-align:center; padding:20px; color:var(--muted);'>결과가 없습니다.</p>";
    return;
  }

  container.innerHTML = data.map(s => {
    let infoLines = "";

    // [UI 분기] 포인트 페이지는 정보 간소화
    if (type === 'point') {
      infoLines = `<div style="margin: 5px 0; color:var(--muted); font-size:0.9rem;">ID: ${s['ID']}</div>`;
    } else {
      // 일반 조회 및 카드 교체는 상세 정보 표시
      infoLines = currentHeaders.map(header => {
        let val = s[header] !== undefined ? s[header] : "";
        if ((header === "마지막출석" || header === "등록일") && val) {
          val = val.substring(0, 10); // 날짜만 표시
        }
        return `<div class="detail-info"><b>${header}:</b> ${val}</div>`;
      }).join('');
    }

    return `
      <div class="student-info-card">
        <div class="student-header">
          <span style="font-size:1.1rem; font-weight:bold; color:white;">${s['이름'] || '미기입'}</span>
          <span style="color:var(--accent); font-weight:bold;">${s['포인트'] || 0} pt</span>
        </div>
        
        <div style="margin: 10px 0;">${infoLines}</div>

        ${type === 'point' ? `
          <div class="point-grid" style="grid-template-columns: repeat(3, 1fr); gap:5px; margin-bottom:8px;">
            <button class="btn btn-success" onclick="updatePt('${s['ID']}', 100, event)">+100</button>
            <button class="btn btn-success" onclick="updatePt('${s['ID']}', 300, event)">+300</button>
            <button class="btn btn-success" onclick="updatePt('${s['ID']}', 500, event)">+500</button>
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

// [기능] 수동 포인트 지급 (입력 필드 값 사용)
function updatePtManual(id, event) {
  const input = document.getElementById(`pt-inp-${id}`);
  const val = input.value;
  if (!val) return alert("포인트를 입력하세요");
  updatePt(id, val, event);
  input.value = ""; // 입력창 비우기
}

// [기능] 포인트 지급 실행 (UI 즉시 반영 + 서버 전송)
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

  // 로컬 데이터 즉시 업데이트 (화면 갱신용)
  if(quickMap[id]) {
    quickMap[id].point = (Number(quickMap[id].point) || 0) + amount;
    // 포인트 페이지라면 현재 표시된 포인트 텍스트도 즉시 갱신 (선택사항, 재검색 시 반영됨)
    // 여기서는 간단히 재검색을 트리거하지 않고 로컬 값만 바꿈
  }

  callApi({ action: 'updatePoint', id: id, amount: amount }, false).then(res => {
    if (!res || !res.success) {
      console.error("포인트 지급 실패:", id);
      if (btn) btn.innerText = "실패 ❌";
    }
  });
}

// [관리자] 학생 추가
async function registerStudent() {
  const idEl = document.getElementById('field-ID');
  const nameEl = document.getElementById('field-이름');
  
  if(!idEl || !idEl.value) return alert("카드를 태그하여 ID를 입력하세요.");
  if(!nameEl || !nameEl.value) return alert("학생 이름을 입력하세요.");

  const fields = {};
  // 현재 로드된 모든 헤더에 대해 입력값이 있는지 확인하여 수집
  currentHeaders.forEach(h => {
    const el = document.getElementById(`field-${h}`);
    if (el) {
      fields[h] = el.value.trim();
    }
  });

  console.log("등록 시도 데이터:", fields); // 디버깅용

  const res = await callApi({ action: 'add', fields: fields }, true);
  
  if(res && res.success) { 
    alert("등록 완료!"); 
    await initQuickMap(); // 캐시 갱신
    showPage('checkin'); 
    // 입력창 초기화
    currentHeaders.forEach(h => {
      const el = document.getElementById(`field-${h}`);
      if(el) el.value = "";
    });
  } else {
    alert("등록 실패: " + (res ? res.message : "서버 응답 없음"));
  }
}

// [관리자] 카드 교체
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

// [관리자] 스키마(헤더) 갱신
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

// [UI] 페이지 이동 (초기화 로직 통합)
function showPage(p) {
  // 1. 페이지 및 네비게이션 활성화 상태 변경
  document.querySelectorAll('.page').forEach(el => el.classList.remove('active'));
  document.getElementById('page-' + p).classList.add('active');
  document.querySelectorAll('.nav button').forEach(el => el.classList.remove('active'));
  const navBtn = document.getElementById('nav-' + p);
  if (navBtn) navBtn.classList.add('active');

  // 2. 입력 데이터 및 UI 초기화
  resetPageData(p);

  // 3. 포커스 관리
  isUserTyping = false;
  updateFocusUI();
  setTimeout(focusNfc, 300);
}

// [추가] 페이지 전환 시 데이터 초기화 상세 로직
function resetPageData(activePage) {
  // 1) 모든 일반 입력창 비우기 (NFC 브릿지 제외)
  document.querySelectorAll('input').forEach(input => {
    if (input.id !== 'nfc-bridge' && input.type !== 'button') {
      input.value = "";
    }
  });

  // 2) 출석 체크 페이지 초기화
  if (document.getElementById('checkin-result')) {
    document.getElementById('checkin-result').innerHTML = `
      <div class="student-info-card" style="text-align:center; color:var(--muted); border:1px dashed var(--muted);">
        ID를 입력하거나 카드를 태그하세요.
      </div>`;
  }

  // 3) 정보 조회 페이지 결과 비우기
  if (document.getElementById('search-results')) {
    document.getElementById('search-results').innerHTML = "";
  }

  // 4) 포인트/카드 관리 페이지 타겟 영역 비우기
  const pointTarget = document.getElementById('point-target-area');
  if (pointTarget) pointTarget.innerHTML = "<p style='text-align:center; padding:20px; color:var(--muted);'>학생을 검색하거나 카드를 태그하세요.</p>";
  
  const cardTarget = document.getElementById('card-target-area');
  if (cardTarget) cardTarget.innerHTML = "";

  // 5) 신규 등록 페이지 (필드 재구성)
  if (activePage === 'add') {
    renderAddFields(); // 폼을 깨끗하게 새로 그림
  }
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