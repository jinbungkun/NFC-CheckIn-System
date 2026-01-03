/* ==========================================================================
   [Module 1] 설정 및 전역 상태 관리
   ========================================================================== */
const PAGE_CONFIG = {
    // index.html의 input id와 대소문자까지 정확히 일치해야 합니다.
    checkin:  { inputId: 'CheckIn' }, 
    search:   { inputId: 'Search' },
    point:    { inputId: 'Point' },
    card:     { inputId: 'Card' },
    register: { inputId: 'Register' },
    schedule: { inputId: 'page-schedule-status' }
};

let isAdmin = false;
let isUserTyping = false;
let isApiLoading = false;
let currentHeaders = [];
let quickMap = {};     
const calCache = {};   
const nfcBridge = document.getElementById('nfc-bridge');

/* ==========================================================================
   [Module 2] 초기화 (Initialization)
   ========================================================================== */
window.onload = async () => {
    const savedAdminStatus = localStorage.getItem('IS_ADMIN_ACTIVE');
    isAdmin = (savedAdminStatus === 'true');
    updateAdminUI();

    const url = localStorage.getItem('GAS_URL');
    if (!url) {
        showPage('settings');
    } else {
        await refreshSchema();
        await initQuickMap();
    }

    initFocusGuard();
    updateFocusUI();
    // 초기 로딩 후 포커스 강제
    setTimeout(focusNfc, 500);
    setInterval(focusNfc, 2000);
};

/* ==========================================================================
   [Module 3] API 통신 및 데이터 코어
   ========================================================================== */
async function callApi(data, showLoader = true) {
    const url = localStorage.getItem('GAS_URL');
    const loader = document.getElementById('loader');

    if (!url && data.action !== 'getSchema') { showPage('settings'); return null; }

    if (showLoader) {
        isApiLoading = true;
        if (loader) loader.style.display = 'flex';
    }

    try {
        const res = await fetch(url, { method: 'POST', body: JSON.stringify(data) });
        return await res.json();
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

async function initQuickMap() {
    const res = await callApi({ action: 'getQuickMap' }, false);
    if (res && res.success) {
        quickMap = res.data;
        console.log("데이터 동기화 완료:", Object.keys(quickMap).length, "명");

        const activePage = document.querySelector('.page.active');
        if (activePage) {
            const pageType = activePage.id.replace('page-', '');
            const input = document.getElementById(PAGE_CONFIG[pageType]?.inputId);
            if (input && input.value) findStudent(pageType);
        }
    }
}

function fetchData(query = '') {
    const q = query.toLowerCase();
    return Object.entries(quickMap)
        .filter(([id, s]) => s.name.toLowerCase().includes(q) || id.includes(q))
        .map(([id, s]) => ({
            ID: id,
            이름: s.name,
            마지막출석: s.lastDate,
            포인트: s.point || 0,
            상태: s.status,
            전화번호: s.phone,
            생년월일: s.birth,
            수업스케줄: s.schedule || "",
            row: s.row 
        }));
}

async function findStudent(pageType) {
    const config = PAGE_CONFIG[pageType];
    const input = document.getElementById(config.inputId);
    if (!input) return;
    const query = input.value.trim();
    
    const data = fetchData(query); // fetchData는 이미 배열을 반환합니다.
    renderResults(data, pageType); 
}

function findByNfc(id, pageType) {
    const data = fetchData('');
    const found = data.filter(s => String(s.ID) === String(id));
    if (found.length > 0) {
        renderResults(found, pageType); // found 역시 배열입니다.
    } else {
        // [UI 개선] alert 대신 UI 함수 사용 가능
        renderCheckinUI("미등록", `미등록 카드: ${id}`, "var(--danger)");
    }
}

/* ==========================================================================
   [Module 4] 주요 기능: 출석 체크
   ========================================================================== */
async function doCheckin() {
    const input = document.getElementById(PAGE_CONFIG.checkin.inputId);
    if (!input) return;
    const id = input.value.trim();
    if (!id) return;
    input.value = "";

    const student = quickMap[id];
    const today = new Date().toLocaleDateString('sv-SE');

    // 1. 이미 출석한 경우
    if (student && student.lastDate === today) {
        // [중요] 4번째 인자로 student.point를 보냅니다.
        renderCheckinUI(student.name, "이미 오늘 출석했습니다! ⚠️", "var(--accent)", student.point);
        return;
    }

    // 2. 처음 출석하는 경우
    if (student) {
        // 여기도 4번째 인자로 현재 포인트를 보냅니다.
        renderCheckinUI(student.name, "출석 성공! ✅", "var(--success)", student.point);
        
        student.lastDate = today;
        callApi({ action: 'checkin', id: id, row: student.row }, false).then(res => {
            if (!res || !res.success) {
                renderCheckinUI(student.name, "⚠️ 서버 저장 실패", "var(--danger)");
            }
        });
    } 
    // 3. 신규 또는 미등록
    else {
        const res = await callApi({ action: 'checkin', id: id }, true);
        if (res && res.success) {
            // 서버에서 응답받은 포인트(res.point)를 보냅니다.
            renderCheckinUI(res.name, "신규 출석 성공! ✅", "var(--success)", res.point);
            await initQuickMap();
        } else {
            renderCheckinUI("미등록", "등록되지 않은 카드입니다.", "var(--danger)");
        }
    }
}

async function doManualCheckin(id) {
    const student = quickMap[id];
    if (!student) return;

    const today = new Date().toLocaleDateString('sv-SE');
    if (student.lastDate === today) {
        alert("이미 오늘 출석했습니다.");
        return;
    }

    renderCheckinUI(student.name, "출석 성공! ✅", "var(--success)");
    student.lastDate = today;
    student.point = (Number(student.point) || 0) + 10;

    await callApi({ action: 'checkin', id: id, row: student.row }, false);
    initQuickMap();
}

function getTodayClassTime(scheduleStr) {
    if (!scheduleStr) return "수업없음";
    const days = ['일', '월', '화', '수', '목', '금', '토'];
    const today = days[new Date().getDay()];
    const parts = scheduleStr.split(',').map(p => p.trim());
    const match = parts.find(p => p.startsWith(today));
    return match ? match.substring(1) : "수업없음";
}

/* ==========================================================================
   [Module 5] 주요 기능: 스케쥴 대시보드
   ========================================================================== */
function updateScheduleDashboard() {
    const today = new Date().toLocaleDateString('sv-SE');
    const grouped = {};
    const summary = { total: 0, present: 0, absent: 0 };

    Object.values(quickMap).forEach(student => {
        const classTime = getTodayClassTime(student.schedule);
        if (classTime !== "수업없음") {
            const isPresent = (student.lastDate === today);
            if (!grouped[classTime]) grouped[classTime] = [];
            grouped[classTime].push({ name: student.name, isPresent: isPresent, phone: student.phone || "" });
            summary.total++;
            isPresent ? summary.present++ : summary.absent++;
        }
    });

    if (window.UI && UI.renderScheduleBoard) UI.renderScheduleBoard(grouped, summary);
}

/* ==========================================================================
   [Module 6] 주요 기능: 포인트, 등록, 카드 관리
   ========================================================================== */
async function updatePt(id, amt, event) {
    const student = quickMap[id];
    if (!student) return;
    
    const amount = Number(amt);
    const btn = event ? event.target : null;
    if (btn) { btn.disabled = true; btn.innerText = "⏳"; }

    const res = await callApi({ action: 'updatePoint', id: id, row: student.row, amount: amount }, false);

    if (res && res.success) {
        student.point = res.newTotal; // 전역 데이터 업데이트
        
        // [UI 최적화] 화면의 포인트 숫자만 즉시 변경
        // ui.js의 renderSimpleCard 구조에 맞춰 querySelector 활용
        const cards = document.querySelectorAll('.page');
        cards.forEach(card => {
            if(card.innerHTML.includes(student.이름)) { // 이름으로 해당 카드 탐색
                const ptSpan = card.querySelector('span[style*="var(--accent)"]');
                if(ptSpan) ptSpan.innerText = `${Number(res.newTotal).toLocaleString()} pt`;
            }
        });

        if (btn) btn.innerText = "✅";
        setTimeout(() => { if (btn) { btn.innerText = `+${amt}`; btn.disabled = false; } }, 1000);
    }
}

function updatePtManual(id, event) {
    const input = document.getElementById(`pt-inp-${id}`);
    if (!input || !input.value) return alert("포인트를 입력하세요");
    updatePt(id, input.value, event);
    input.value = "";
}

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
        alert("등록 완료!");
        await initQuickMap();
        showPage('checkin');
    }
}

async function execCardChange(oldId, name) {
    const student = quickMap[oldId];
    const newIdInput = document.getElementById('new-card-input');
    const newId = newIdInput ? newIdInput.value.trim() : "";

    if (!newId) return alert("새 카드를 태그하세요.");
    if (confirm(`${name} 학생의 카드를 교체하시겠습니까?`)) {
        const res = await callApi({ action: 'updateId', oldId: oldId, newId: newId, row: student.row }, true);
        if (res && res.success) {
            alert("교체 완료");
            await initQuickMap();
            showPage('checkin');
        } else {
            alert(res.message);
        }
    }
}

/* ==========================================================================
   [Module 7] 달력/기록 (History)
   ========================================================================== */
function initCalendarUI(id) {
    const now = new Date();
    // 해당 학생의 달력 상태 초기화
    calCache[id] = { 
        year: now.getFullYear(), 
        month: now.getMonth(), 
        history: null, 
        historyYear: null 
    };
    drawGrid(id);
}

async function drawGrid(id) {
    const state = calCache[id];
    const grid = document.getElementById(`grid-${id}`);
    const label = document.getElementById(`cal-label-${id}`);
    if (!grid || !label) return;

    label.innerText = `${state.year}년 ${state.month + 1}월`;

    // 1. 서버 데이터 로딩 (GAS에서 이미 yyyy-MM-dd로 줌)
    if (!state.history || state.historyYear !== state.year) {
        const res = await callApi({ action: 'getHistory', id: id, year: state.year }, false);
        
        if (res && res.success && Array.isArray(res.history)) {
            // [중요 수정] 서버가 준 "2026-01-02"를 그대로 사용 (다시 Date객체로 만들지 말 것)
            state.history = res.history.map(dateStr => String(dateStr).trim());
            console.log(`[데이터로드] ${id} 학생 기록:`, state.history); 
        } else {
            state.history = [];
        }
        state.historyYear = state.year;
    }

    // 2. 캘린더 헤더(요일) 생성
    grid.innerHTML = "";
    ['일', '월', '화', '수', '목', '금', '토'].forEach(d => {
        const dDiv = document.createElement('div'); 
        dDiv.className = 'day-header'; 
        dDiv.innerText = d; 
        grid.appendChild(dDiv);
    });

    // 3. 매칭을 위한 준비
    const attendanceSet = new Set(state.history);
    const firstDay = new Date(state.year, state.month, 1).getDay();
    const lastDate = new Date(state.year, state.month + 1, 0).getDate();
    
    // 오늘 날짜 문자열 (sv-SE 포맷은 로컬 시간 기준 yyyy-mm-dd를 생성함)
    const todayStr = new Date().toLocaleDateString('sv-SE');

    // 4. 달력 칸 생성
    for (let i = 0; i < firstDay; i++) grid.appendChild(document.createElement('div'));

    for (let d = 1; d <= lastDate; d++) {
        const dDiv = document.createElement('div');
        dDiv.className = 'day-num';
        dDiv.innerText = d;

        // [비교용 핵심값] 달력 숫자로 "2026-01-02" 형식 생성
        const fullDate = `${state.year}-${String(state.month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;

        // 오늘 표시
        if (fullDate === todayStr) dDiv.classList.add('is-today');

        // [출석 체크 매칭]
        if (attendanceSet.has(fullDate)) {
            dDiv.classList.add('is-present');
            console.log(`[매칭성공] ${fullDate}`); 
        }

        grid.appendChild(dDiv);
    }
}

function changeMonthUI(id, delta) {
    const state = calCache[id];
    if(!state) return;
    state.month += delta;
    if (state.month > 11) { state.month = 0; state.year++; }
    else if (state.month < 0) { state.month = 11; state.year--; }
    drawGrid(id);
}

/* ==========================================================================
   [Module 8] UI 브릿지 및 페이지 네비게이션
   ========================================================================== */
function renderResults(data, type) { if(window.UI) UI.renderResults(data, type); }
function renderCheckinUI(name, msg, color) { if(window.UI) UI.renderCheckinUI(name, msg, color); }

function showPage(p) {
    document.querySelectorAll('.page').forEach(el => { el.classList.remove('active'); el.style.display = 'none'; });
    const targetPage = document.getElementById('page-' + p);
    if (targetPage) { targetPage.classList.add('active'); targetPage.style.display = 'block'; }

    document.querySelectorAll('.nav button').forEach(btn => { btn.classList.toggle('active', btn.id === 'nav-' + p); });
    
    // 입력창 초기화 (설정 페이지 제외)
    document.querySelectorAll('input').forEach(input => {
        if (!['nfc-bridge', 'cfg-url'].includes(input.id) && input.type !== 'button') input.value = "";
    });

    if (p === 'settings') document.getElementById('cfg-url').value = localStorage.getItem('GAS_URL') || "";
    if (p === 'add') refreshSchema(false);
    if (p === 'schedule') updateScheduleDashboard();

    isUserTyping = false;
    updateFocusUI();
    
    // 페이지 전환 후 포커스 타겟 설정
    if (PAGE_CONFIG[p] && PAGE_CONFIG[p].inputId) {
        const inputEl = document.getElementById(PAGE_CONFIG[p].inputId);
        if(inputEl) setTimeout(() => inputEl.focus(), 200);
    } else {
        setTimeout(focusNfc, 300);
    }
}

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
    document.querySelectorAll('.admin-only-btn').forEach(el => { el.style.display = isAdmin ? 'inline-block' : 'none'; });
    const status = document.getElementById('mode-status');
    if (status) {
        status.innerText = isAdmin ? "● 관리자 모드" : "● 학생 모드";
        status.className = isAdmin ? "admin-active" : "";
    }
}

async function saveSettings() {
    const url = document.getElementById('cfg-url').value.trim();
    localStorage.setItem('GAS_URL', url);
    const res = await callApi({ action: 'getSchema' }, true);
    if (res && res.headers) {
        alert("연결 성공!");
        currentHeaders = res.headers;
        await initQuickMap();
        showPage('checkin');
    } else {
        alert("URL을 확인해주세요.");
    }
}

async function refreshSchema(force = false) {
    if (!force && currentHeaders.length > 0) { renderAddFields(); return; }
    const res = await callApi({ action: 'getSchema' });
    if (res && res.headers) { currentHeaders = res.headers; renderAddFields(); }
}

function renderAddFields() {
    const container = document.getElementById('dynamic-add-fields');
    if (!container) return;
    container.innerHTML = "";
    const skipHeaders = ['포인트', '상태', '마지막출석', '등록일'];
    currentHeaders.forEach(header => {
        if (skipHeaders.includes(header)) return;
        const label = document.createElement('label'); label.innerText = header; label.className = "field-label";
        container.appendChild(label);
        const input = document.createElement('input');
        if (header === 'ID') {
            input.id = PAGE_CONFIG.register.inputId; input.readOnly = true; input.placeholder = "카드를 태그하세요";
        } else {
            input.id = `field-${header}`; input.placeholder = `${header} 입력`;
        }
        container.appendChild(input);
    });
}

/* ==========================================================================
   [Module 9] 하드웨어 인터페이스 (NFC & Focus) - 핵심 수정
   ========================================================================== */
function updateFocusUI() {
    const indicator = document.getElementById('focus-indicator');
    if (indicator) indicator.innerText = isUserTyping ? "⌨️ 입력 중" : "📡 리더기 대기";
}

function focusNfc() {
    // API 로딩 중이거나 사용자가 다른 입력창을 쓰고 있다면 포커스 뺏지 않음
    if (isUserTyping || isApiLoading) return;
    
    // 현재 포커스된 요소가 input이 아니면 nfc-bridge로 포커스 이동
    if (document.activeElement.tagName !== 'INPUT') {
        if (nfcBridge) nfcBridge.focus({ preventScroll: true });
    }
}

function initFocusGuard() {
    // 모든 입력창에 포커스 이벤트 감지 (NFC 입력 방해 금지)
    document.addEventListener('focusin', (e) => {
        if (e.target.id !== 'nfc-bridge') {
            isUserTyping = true;
            updateFocusUI();
        }
    });
    document.addEventListener('focusout', (e) => {
        if (e.target.id !== 'nfc-bridge') {
            setTimeout(() => {
                isUserTyping = false;
                updateFocusUI();
                focusNfc();
            }, 500);
        }
    });
}

nfcBridge.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
        const val = nfcBridge.value.trim();
        if (val) processNfc(val);
        nfcBridge.value = "";
    }
});

function processNfc(val) {
    const activePage = document.querySelector('.page.active');
    if (!activePage) return;
    
    const pageType = activePage.id.replace('page-', '');
    console.log("NFC 감지:", val, "페이지:", pageType);

    if (pageType === 'add' || pageType === 'register') {
        const idInp = document.getElementById(PAGE_CONFIG.register.inputId);
        if (idInp) idInp.value = val;
    } else if (pageType === 'checkin') {
        const input = document.getElementById(PAGE_CONFIG.checkin.inputId);
        if (input) {
            input.value = val;
            doCheckin();
        }
    } else if (pageType === 'card') {
        const cardInp = document.getElementById('new-card-input');
        if (cardInp) cardInp.value = val;
    } else if (PAGE_CONFIG[pageType]) {
        findByNfc(val, pageType);
    }
}

// 바탕 클릭 시 다시 NFC 리더기 대기 상태로
document.body.onclick = (e) => {
    if (e.target.tagName !== 'INPUT') {
        isUserTyping = false;
        updateFocusUI();
        focusNfc();
    }
};