/* ==========================================================================
   [Module 1] 설정 및 전역 상태 관리
   ========================================================================== */
const PAGE_CONFIG = {
    checkin:  { inputId: 'CheckIn' },
    search:   { inputId: 'Search' },
    point:    { inputId: 'Point' },
    card:     { inputId: 'Card' },
    register: { inputId: 'Register' },
    schedule: { inputId: 'page-schedule-status' }
};

// 상태 관리 변수
let isAdmin = false;
let isUserTyping = false;
let isApiLoading = false;
let currentHeaders = [];
let quickMap = {};     // 학생 전체 데이터 캐시 (row 정보 포함)
const calCache = {};   // 달력 데이터 캐시
const nfcBridge = document.getElementById('nfc-bridge');

/* ==========================================================================
   [Module 2] 초기화 (Initialization)
   ========================================================================== */
window.onload = async () => {
    // 1. 관리자 상태 복구
    const savedAdminStatus = localStorage.getItem('IS_ADMIN_ACTIVE');
    isAdmin = (savedAdminStatus === 'true');
    updateAdminUI();

    // 2. GAS URL 확인 및 초기 데이터 로드
    const url = localStorage.getItem('GAS_URL');
    if (!url) {
        showPage('settings');
    } else {
        await refreshSchema();
        await initQuickMap();
    }

    // 3. 포커스 가드 실행 (NFC 입력 유지)
    initFocusGuard();
    updateFocusUI();
    focusNfc();
    setInterval(focusNfc, 2000);
};

/* ==========================================================================
   [Module 3] API 통신 및 데이터 코어
   ========================================================================== */
// 공통 API 호출 함수
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

// 전체 학생 데이터 가져오기 (캐싱 - Row 정보 포함)
async function initQuickMap() {
    const res = await callApi({ action: 'getQuickMap' }, false);
    if (res && res.success) {
        quickMap = res.data;
        console.log("학생 데이터 동기화 완료 (Optimized)");

        const activePage = document.querySelector('.page.active');
        if (activePage && (activePage.id === 'page-search' || activePage.id === 'page-point')) {
            const pageType = activePage.id.replace('page-', '');
            const input = document.getElementById(PAGE_CONFIG[pageType]?.inputId);
            if (input && input.value) findStudent(pageType);
        }
    }
}

// 로컬 데이터 검색 필터링
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
            row: s.row // 서버 지시용 인덱스
        }));
}

// 검색창 입력 핸들러
async function findStudent(pageType) {
    const config = PAGE_CONFIG[pageType];
    const query = document.getElementById(config.inputId).value.trim();
    const data = fetchData(query);
    renderResults(data, pageType);
}

// NFC 태그로 학생 찾기
function findByNfc(id, pageType) {
    const data = fetchData('');
    const found = data.filter(s => String(s.ID) === String(id));
    if (found.length > 0) renderResults(found, pageType);
    else alert(`명단에 등록되지 않은 카드입니다.`);
}

/* ==========================================================================
   [Module 4] 주요 기능: 출석 체크 (Check-in)
   ========================================================================== */
async function doCheckin() {
    const input = document.getElementById(PAGE_CONFIG.checkin.inputId);
    const id = input.value.trim();
    if (!id) return;
    input.value = "";

    const student = quickMap[id];
    const today = new Date().toLocaleDateString('sv-SE');

    if (student && student.lastDate === today) {
        renderCheckinUI(student.name, "이미 오늘 출석했습니다! ⚠️", "var(--accent)");
        return;
    }

    if (student) {
        // 낙관적 UI 업데이트
        renderCheckinUI(student.name, "출석 성공! ✅", "var(--success)");
        student.lastDate = today;
        student.point = (Number(student.point) || 0) + 10;

        // Row 정보를 함께 보내 서버 루프 제거
        callApi({ action: 'checkin', id: id, row: student.row }, false).then(res => {
            if (!res || !res.success) {
                renderCheckinUI(student.name, "⚠️ 서버 저장 실패", "var(--danger)");
            }
        });
    } else {
        // 신규 카드의 경우만 서버에서 전체 검색
        const res = await callApi({ action: 'checkin', id: id }, true);
        if (res && res.success) {
            renderCheckinUI(res.name, "신규 출석 성공! ✅", "var(--success)");
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
    if (!scheduleStr || scheduleStr.trim() === "") return "시간 미정";
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
            grouped[classTime].push({
                name: student.name,
                isPresent: isPresent,
                phone: student.phone || ""
            });

            summary.total++;
            isPresent ? summary.present++ : summary.absent++;
        }
    });

    if (window.UI && UI.renderScheduleBoard) {
        UI.renderScheduleBoard(grouped, summary);
    }
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
        student.point = res.newTotal;
        if (btn) btn.innerText = "✅";
        setTimeout(() => { if (btn) { btn.innerText = `+${amt}`; btn.disabled = false; } }, 1000);
        findStudent('point');
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
        await initQuickMap(); // 새 row 정보 갱신
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
    grid.innerHTML = "<div style='grid-column: span 7; padding: 20px; color: var(--muted);'>데이터 불러오는 중...</div>";

    if (!state.history || state.historyYear !== state.year) {
        const res = await callApi({ action: 'getHistory', id: id, year: state.year }, false);
        state.history = (res && res.success) ? res.history : [];
        state.historyYear = state.year;
    }

    grid.innerHTML = "";
    const days = ['일', '월', '화', '수', '목', '금', '토'];
    days.forEach(d => {
        const dDiv = document.createElement('div');
        dDiv.className = 'day-header';
        dDiv.innerText = d;
        grid.appendChild(dDiv);
    });

    const attendanceSet = new Set(state.history);
    const firstDay = new Date(state.year, state.month, 1).getDay();
    const lastDate = new Date(state.year, state.month + 1, 0).getDate();
    const todayStr = new Date().toLocaleDateString('sv-SE');

    for (let i = 0; i < firstDay; i++) grid.appendChild(document.createElement('div'));

    for (let d = 1; d <= lastDate; d++) {
        const dDiv = document.createElement('div');
        dDiv.className = 'day-num';
        dDiv.innerText = d;
        const currentFullDate = `${state.year}-${String(state.month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
        if (currentFullDate === todayStr) dDiv.classList.add('is-today');
        if (attendanceSet.has(currentFullDate)) dDiv.classList.add('is-present');
        grid.appendChild(dDiv);
    }
}

function changeMonthUI(id, delta) {
    const state = calCache[id];
    state.month += delta;
    if (state.month > 11) { state.month = 0; state.year++; }
    if (state.month < 0) { state.month = 11; state.year--; }
    drawGrid(id);
}

/* ==========================================================================
   [Module 8] UI 브릿지 및 페이지 네비게이션
   ========================================================================== */
function renderResults(data, type) { if(window.UI) UI.renderResults(data, type); }
function renderCheckinUI(name, msg, color) { if(window.UI) UI.renderCheckinUI(name, msg, color); }

function showPage(p) {
    document.querySelectorAll('.page').forEach(el => {
        el.classList.remove('active');
        el.style.display = 'none';
    });
    
    const targetPage = document.getElementById('page-' + p);
    if (targetPage) {
        targetPage.classList.add('active');
        targetPage.style.display = 'block';
    }

    document.querySelectorAll('.nav button').forEach(btn => {
        btn.classList.toggle('active', btn.id === 'nav-' + p);
    });

    document.querySelectorAll('input').forEach(input => {
        if (!['nfc-bridge', 'cfg-url'].includes(input.id) && input.type !== 'button') {
            input.value = "";
        }
    });

    const resultContainers = ['checkin-result', 'search-results', 'point-target-area', 'card-target-area'];
    resultContainers.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.innerHTML = "";
    });

    if (p === 'settings') document.getElementById('cfg-url').value = localStorage.getItem('GAS_URL') || "";
    if (p === 'add') refreshSchema(false);
    if (p === 'schedule') updateScheduleDashboard();

    isUserTyping = false;
    updateFocusUI();
    
    if (PAGE_CONFIG[p] && PAGE_CONFIG[p].inputId) {
        const inputEl = document.getElementById(PAGE_CONFIG[p].inputId);
        if(inputEl) setTimeout(() => inputEl.focus(), 100);
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
    if (!force && currentHeaders && currentHeaders.length > 0) {
        renderAddFields();
        return;
    }
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
            input.placeholder = (header === '수업스케줄') ? "예: 월7:10, 수7:10" : `${header} 입력`;
        }
        container.appendChild(input);
    });
}

/* ==========================================================================
   [Module 9] 하드웨어 인터페이스 (NFC & Focus)
   ========================================================================== */
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

document.body.onclick = (e) => {
    if (e.target.tagName !== 'INPUT') {
        isUserTyping = false;
        updateFocusUI();
        focusNfc();
    }
};