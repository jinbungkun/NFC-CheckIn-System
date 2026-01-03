/* ==========================================================================
   [ui.js] - 전 기능 통합 (기존 기능 유지 + 신규 등록 UI 추가)
   ========================================================================== */

let checkinTimer = null;
window.tempSchedules = []; // 신규 등록 시 스케줄 임시 저장용

const UI = {
    // 1. 체크인 결과 표시 (기존 유지: 3.5초 타이머 로직 포함)
    renderCheckinUI(name, msg, color, point) {
        const target = document.getElementById('checkin-result');
        if (!target) return;

        if (checkinTimer) clearTimeout(checkinTimer);

        const hasPoint = (point !== undefined && point !== null);
        const pointHtml = hasPoint 
            ? `<div class="result-point">현재 보유 포인트: <span>${Number(point).toLocaleString()}</span> pt</div>` 
            : "";

        target.innerHTML = `
            <div class="result-wrapper">
                <div class="result-card" style="border-color: ${color};">
                    <h3 class="result-name" style="color: ${color};">${name}</h3>
                    ${pointHtml}
                    <p class="result-msg">${msg}</p>
                </div>
            </div>`;
        
        checkinTimer = setTimeout(() => {
            target.innerHTML = "";
            checkinTimer = null;
        }, 3500);
    },

    // 2. 검색/조회 결과 렌더링 (대시보드 카드 스타일 유지)
    renderResults(data, type) {
        const containerId = type === 'search' ? 'search-results' : (type === 'point' ? 'point-target-area' : 'card-target-area');
        const container = document.getElementById(containerId);
        if (!container) return;
        
        if (!data || data.length === 0) { 
            container.innerHTML = `<p class="empty-msg" style="text-align:center; padding:40px; color:var(--muted);">검색 결과가 없습니다.</p>`; 
            return; 
        }

        container.innerHTML = data.map(s => {
            const statusClass = s.상태 === '재원' ? 'badge-success' : 'badge-danger';
            
            if (type === 'search') {
                return `
                <div class="student-dashboard-card">
                    <div class="dash-info">
                        <div class="info-header" style="display:flex; justify-content:space-between; align-items:flex-start;">
                            <div>
                                <span class="student-name">${s.이름}</span>
                                <div class="info-item" style="margin-top:5px;">🎂 <span class="info-value">${s.생년월일 || '-'}</span></div>
                            </div>
                            <span class="status-badge ${statusClass}" style="padding:4px 12px; border-radius:20px; font-size:0.8rem; background:rgba(255,255,255,0.1); border:1px solid currentColor;">${s.상태 || '재원'}</span>
                        </div>
                        <div class="info-body" style="margin-top:20px; display:grid; grid-template-columns:1fr; gap:12px;">
                            <div class="info-item">📱 연락처: <span class="info-value">${s.전화번호 || '-'}</span></div>
                            <div class="info-item">💰 포인트: <span class="info-value" style="color:var(--accent); font-weight:bold;">${Number(s.포인트).toLocaleString()} pt</span></div>
                            <div class="info-item">📅 수업: <span class="info-value">${s.수업스케줄 || '정보 없음'}</span></div>
                        </div>
                    </div>
                    <div class="dash-calendar">
                        <div class="cal-nav">
                            <button class="cal-btn" onclick="changeMonthUI('${s.ID}', -1)">◀</button>
                            <span class="cal-label" id="cal-label-${s.ID}">로딩 중...</span>
                            <button class="cal-btn" onclick="changeMonthUI('${s.ID}', 1)">▶</button>
                        </div>
                        <div class="cal-grid" id="grid-${s.ID}">
                            <div style="grid-column: span 7; padding: 40px; color: var(--muted);">달력 데이터를 가져오는 중...</div>
                        </div>
                    </div>
                </div> `;
            }
            return this.renderSimpleCard(s, type);
        }).join('');

        if (type === 'search') {
            data.forEach(s => {
                setTimeout(() => { if(typeof window.initCalendarUI === 'function') window.initCalendarUI(s.ID); }, 50);
            });
        }
    },

    // 3. 심플 카드 (포인트/카드 교체용)
    renderSimpleCard(s, type) {
        return `
        <div class="page" style="display:block; margin-bottom:15px; padding:20px;">
            <div style="display:flex; justify-content:space-between; align-items:center;">
                <div>
                    <strong style="font-size:1.2rem;">${s.이름}</strong>
                    <span style="color:var(--muted); font-size:0.8rem; margin-left:8px;">${s.생년월일}</span>
                </div>
                <span style="color:var(--accent); font-weight:bold;">${Number(s.포인트).toLocaleString()} pt</span>
            </div>
            ${type === 'point' ? this.renderPointActions(s.ID) : this.renderCardActions(s.ID, s.이름)}
        </div>`;
    },

    // 4. [신규 통합] 학생 등록 폼 (스케줄 빌더 포함)
    renderRegisterForm() {
        window.tempSchedules = []; // 배열 초기화
        return `
            <div class="form-container">
                <h2 class="form-section-title">👤 신규 학생 등록</h2>
                <div class="input-group">
                    <label class="input-label">카드 ID</label>
                    <input type="text" id="reg-id" class="modern-input" placeholder="카드를 찍으세요">
                </div>
                <div class="input-group">
                    <label class="input-label">이름</label>
                    <input type="text" id="reg-name" class="modern-input" placeholder="이름 입력">
                </div>
                <div class="input-group">
                    <label class="input-label">생년월일</label>
                    <input type="date" id="reg-birth" class="modern-input">
                </div>
                <div class="input-group">
                    <label class="input-label">연락처</label>
                    <input type="tel" id="reg-phone" class="modern-input" placeholder="010-0000-0000">
                </div>
                <div class="input-group">
                    <label class="input-label">수업 스케줄 설정</label>
                    <div class="builder-controls">
                        <select id="reg-day" class="modern-input" style="flex:1;">
                            <option value="월">월</option><option value="화">화</option><option value="수">수</option>
                            <option value="목">목</option><option value="금">금</option><option value="토">토</option><option value="일">일</option>
                        </select>
                        <input type="time" id="reg-time" class="modern-input" style="flex:1.5;">
                        <button type="button" onclick="addScheduleTag()" class="btn-build-add">+</button>
                    </div>
                    <div id="schedule-tags-container">
                        <span style="color:var(--muted); font-size:0.8rem;">수업 시간을 추가해주세요.</span>
                    </div>
                </div>
                <button onclick="registerStudent()" class="btn btn-success" style="margin-top:20px;">학생 등록 완료</button>
            </div>`;
    },

    // 5. 출석 현황판 (기존 생일 학생 강조 기능 유지)
    renderScheduleBoard(groupedData, summary) {
        const board = document.getElementById('schedule-board'); 
        const summaryDiv = document.getElementById('schedule-summary');
        if (!board || !summaryDiv) return;

        const now = new Date();
        const todayMMDD = `${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

        summaryDiv.innerHTML = `
            <div class="summary-card total"><span class="label">대상</span><span class="value">${summary.total}</span></div>
            <div class="summary-card present"><span class="label">출석</span><span class="value">${summary.present}</span></div>
            <div class="summary-card absent"><span class="label">미출석</span><span class="value">${summary.absent}</span></div>`;

        board.innerHTML = "";
        const sortedTimes = Object.keys(groupedData).sort();

        if (sortedTimes.length === 0) {
            board.innerHTML = `<div style="text-align:center; padding:80px 0; color:var(--muted);"><div style="font-size: 3rem; margin-bottom: 10px;">📅</div><p>오늘 예정된 수업이 없습니다.</p></div>`;
            return;
        }

        sortedTimes.forEach(time => {
            const section = document.createElement('div');
            section.className = "time-section";
            const studentCards = groupedData[time].map(s => {
                const isBirthday = s.birth && s.birth.includes(todayMMDD);
                return `
                    <div class="student-status-card ${s.isPresent ? 'is-present' : 'is-absent'} ${isBirthday ? 'is-birthday' : ''}">
                        ${isBirthday ? `<div class="birthday-badge"><span class="cake-icon">🎂</span></div>` : ''}
                        <div class="card-content">
                            <div class="name">${s.name}</div>
                            <div class="status-indicator">${s.isPresent ? '출석완료' : '미출석'}</div>
                        </div>
                    </div>`;
            }).join('');
            section.innerHTML = `<div class="time-header">🕒 ${time} 수업</div><div class="student-grid">${studentCards}</div>`;
            board.appendChild(section);
        });
    },

    // 6. 포인트 지급 액션 (기존 유지)
    renderPointActions(id) {
        return `
        <div style="border-top:1px solid var(--border); padding-top:15px; margin-top:15px;">
            <div style="display:grid; grid-template-columns: repeat(3, 1fr); gap:8px; margin-bottom:12px;">
                ${[10, 50, 100].map(v => `<button class="btn btn-success" style="padding:10px; font-size:0.85rem;" onclick="updatePt('${id}', ${v}, event)">+${v}</button>`).join('')}
            </div>
            <div style="display:flex; gap:8px;">
                <input type="number" id="pt-inp-${id}" placeholder="직접 입력" style="margin:0; flex:1;">
                <button class="btn btn-primary" style="width:80px; padding:0;" onclick="updatePtManual('${id}', event)">지급</button>
            </div>
        </div>`;
    },

    // 7. 카드 정보 교체 액션 (기존 유지)
    renderCardActions(id, name) {
        return `
        <div style="border-top:1px solid var(--border); padding-top:15px; margin-top:15px;">
            <input type="text" id="new-card-input" placeholder="새 카드를 리더기에 찍으세요" readonly style="text-align:center; border-style:dashed; margin-bottom:10px;">
            <button class="btn btn-danger" style="background:var(--danger);" onclick="execCardChange('${id}', '${name}')">이 학생의 카드로 정보 교체</button>
        </div>`;
    }
};

/* --- [추가] 스케줄 태그 관리 전역 함수 --- */
window.addScheduleTag = function() {
    const day = document.getElementById('reg-day').value;
    let time = document.getElementById('reg-time').value;
    if (!time) return alert("시간을 선택해주세요.");
    if (time.startsWith('0')) time = time.substring(1); // 09:00 -> 9:00
    const val = `${day}${time}`;
    if (!window.tempSchedules.includes(val)) {
        window.tempSchedules.push(val);
        updateTagUI();
    }
};

window.removeScheduleTag = function(index) {
    window.tempSchedules.splice(index, 1);
    updateTagUI();
};

function updateTagUI() {
    const container = document.getElementById('schedule-tags-container');
    if (!container) return;
    if (window.tempSchedules.length === 0) {
        container.innerHTML = '<span style="color:var(--muted); font-size:0.8rem;">수업 시간을 추가해주세요.</span>';
        return;
    }
    container.innerHTML = window.tempSchedules.map((s, i) => `
        <div class="schedule-tag">${s} <span class="tag-remove" onclick="removeScheduleTag(${i})">×</span></div>
    `).join('');
}

window.UI = UI;