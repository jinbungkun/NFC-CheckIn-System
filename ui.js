/* ==========================================================================
   [ui.js] - 전 기능 통합 최종본 (스케줄 빌더 버튼 방식 적용)
   ========================================================================== */

let checkinTimer = null;
window.tempSchedules = []; // 신규 등록 시 스케줄 임시 저장용
window.selectedDay = "월";  // 선택된 요일 저장용

const UI = {
    // 1. 체크인 결과 표시
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

    // 2. 검색/조회 결과 렌더링
    renderResults(data, type) {
        const containerId = type === 'search' ? 'search-results' : (type === 'point' ? 'point-target-area' : 'card-target-area');
        const container = document.getElementById(containerId);
        if (!container) return;
        
        if (!data || data.length === 0) { 
            container.innerHTML = `<p class="empty-msg" style="text-align:center; padding:40px; color:var(--muted);">검색 결과가 없습니다.</p>`; 
            return; 
        }

        container.innerHTML = data.map(s => {
            if (type === 'search') {
                const statusClass = s.상태 === '재원' ? 'badge-success' : 'badge-danger';
                return `
                <div class="student-dashboard-card">
                    <div class="dash-info">
                        <div class="info-header" style="display:flex; justify-content:space-between; align-items:flex-start;">
                            <div>
                                <span class="student-name">${s.이름}</span>
                                <div class="info-item" style="margin-top:5px;">🎂 <span class="info-value">${s.생년월일 || '-'}</span></div>
                            </div>
                            <span class="status-badge ${statusClass}" style="padding:4px 12px; border-radius:20px; font-size:0.8rem; border:1px solid currentColor;">${s.상태 || '재원'}</span>
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
                        <div class="cal-grid" id="grid-${s.ID}"></div>
                    </div>
                </div> `;
            }
            // 포인트/카드교체용 심플 카드
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
        const actionHtml = type === 'point' ? this.renderPointActions(s) : this.renderCardActions(s.ID, s.이름);
        
        // 카드교체 타입일 때만 상단에 '카드 교체 대상' 배지 추가
        const badgeHtml = type === 'card' ? 
            `<span style="background:rgba(255, 107, 107, 0.2); color:#ff6b6b; padding:4px 10px; border-radius:8px; font-size:0.75rem; font-weight:bold; margin-bottom:12px; display:inline-block; border:1px solid rgba(255,107,107,0.3);">CARD REPLACEMENT</span>` : "";

        return `
            <div class="student-simple-card" 
                 style="background: rgba(255, 255, 255, 0.07); 
                        border: 1px solid rgba(255, 255, 255, 0.1); 
                        border-radius: 20px; padding: 28px; margin-bottom: 24px; 
                        backdrop-filter: blur(15px); box-shadow: 0 10px 40px rgba(0,0,0,0.3);
                        transition: transform 0.2s ease;">
                ${badgeHtml}to
                <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 25px;">
                    <div>
                        <h3 style="font-size: 1.5rem; margin: 0 0 6px 0; color: #fff; letter-spacing: -0.5px;">${s.이름}</h3>
                        <div style="display:flex; gap:10px; align-items:center;">
                            <span style="font-size: 0.9rem; color: rgba(255,255,255,0.5);">${s.전화번호 || '연락처 없음'}</span>
                            <span style="width:1px; height:10px; background:rgba(255,255,255,0.2);"></span>
                            <span style="font-size: 0.9rem; color: var(--accent); font-weight: 600;">현재 ${Number(s.포인트).toLocaleString()} pt</span>
                        </div>
                    </div>
                    <div style="text-align: right;">
                         <div style="font-size: 0.7rem; color: rgba(255,255,255,0.4); text-transform: uppercase; margin-bottom: 4px;">Current ID</div>
                         <code style="background: rgba(0,0,0,0.3); padding: 4px 8px; border-radius: 6px; color: #888; font-size: 0.8rem;">${s.ID.substring(0, 8)}...</code>
                    </div>
                </div>
                ${actionHtml}
            </div>`;
    },

    renderCardActions(id, name) {
        return `
        <div style="background: rgba(0, 0, 0, 0.2); border-radius: 16px; padding: 20px; border: 1px solid rgba(255,255,255,0.05);">
            <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 15px;">
                <div style="width: 8px; height: 8px; background: #ff4757; border-radius: 50%; box-shadow: 0 0 10px #ff4757;"></div>
                <p style="font-size: 0.9rem; color: #eee; font-weight: 600; margin: 0;">새 카드 태그 대기 중...</p>
            </div>
            
            <div style="display: flex; flex-direction: column; gap: 12px;">
                <div style="position: relative;">
                    <input type="text" id="new-card-input" placeholder="카드를 리더기에 찍어주세요" readonly
                           style="width: 100%; padding: 18px; padding-left: 45px; background: rgba(255,255,255,0.05); 
                                  border: 2px dashed rgba(255,255,255,0.2); border-radius: 14px; color: #00ff88; 
                                  font-size: 1.1rem; font-family: monospace; outline: none; transition: all 0.3s;
                                  box-sizing: border-box;">
                    <span style="position: absolute; left: 18px; top: 50%; transform: translateY(-50%); opacity: 0.5;">🎴</span>
                </div>
                
                <button class="btn-change" 
                        style="width: 100%; padding: 16px; background: linear-gradient(135deg, #6c5ce7, #a29bfe); 
                               color: white; border: none; border-radius: 14px; font-weight: 800; font-size: 1rem; 
                               cursor: pointer; transition: all 0.3s; box-shadow: 0 4px 15px rgba(108, 92, 231, 0.3);"
                        onmouseover="this.style.transform='translateY(-2px)'; this.style.boxShadow='0 6px 20px rgba(108, 92, 231, 0.4)';"
                        onmouseout="this.style.transform='translateY(0)';"
                        onclick="execCardChange('${id}', '${name}')">
                    카드 정보 업데이트 승인
                </button>
            </div>
            <p style="font-size: 0.75rem; color: rgba(255,255,255,0.4); margin-top: 15px; text-align: center;">
                * 기존 카드는 즉시 무효화되며 새 카드로 모든 정보가 이전됩니다.
            </p>
        </div>`;
    },

    // 4. 신규 등록 폼 (스케줄 빌더 통합)
    renderRegisterForm() {
    window.tempSchedules = []; 
    window.selectedDay = "월"; 
    
    const skipHeaders = ['포인트', '상태', '마지막출석', '등록일'];
    let html = '';

    currentHeaders.forEach(header => {
        if (skipHeaders.includes(header)) return;

        html += `<div class="input-group">
                    <label class="input-label">${header}</label>`;

        if (header === 'ID') {
            html += `<input type="text" id="Register" class="modern-input" placeholder="카드를 찍으세요" readonly>`;
        } 
        // [추가] 생년월일 항목은 달력(date)으로 표시
        else if (header === '생년월일') {
            html += `
                <style>
                    /* 달력 아이콘도 시계처럼 하얗게 반전 */
                    #field-생년월일::-webkit-calendar-picker-indicator {
                        filter: invert(100%);
                        cursor: pointer;
                    }
                </style>
                <input type="date" id="field-${header}" class="modern-input" 
                       style="background: rgba(0,0,0,0.2); color: white; border: 1px solid rgba(255,255,255,0.2); width:100%;">`;
        }
        else if (header === '수업스케줄') {
            html += `
                <style>
                    #reg-time::-webkit-calendar-picker-indicator {
                        filter: invert(100%);
                        cursor: pointer;
                    }
                </style>
                <div id="day-selector-group" style="display:flex; gap:4px; margin-bottom:8px;">
                    ${['월','화','수','목','금','토','일'].map(d => `
                        <button type="button" class="day-btn ${d === '월' ? 'active' : ''}" 
                                onclick="UI.selectDay(this, '${d}')" 
                                style="flex:1; padding:10px 0; border:1px solid rgba(255,255,255,0.1); border-radius:6px; background:rgba(255,255,255,0.1); color:white; cursor:pointer; font-weight:bold;">
                            ${d}
                        </button>
                    `).join('')}
                </div>
                <div class="builder-controls" style="display:flex; gap:5px;">
                    <input type="time" id="reg-time" class="modern-input" 
                           style="flex:1; background: rgba(0,0,0,0.2); color: white; border: 1px solid rgba(255,255,255,0.2);">
                    <button type="button" onclick="addScheduleTag()" class="btn btn-primary" style="padding:0 20px; font-size:1.2rem;">+</button>
                </div>
                <div id="schedule-tags-container" style="margin-top:10px; border:2px dashed rgba(255,255,255,0.1); padding:12px; border-radius:8px; min-height:50px; display:flex; flex-wrap:wrap; gap:6px;">
                    <span style="color:var(--muted); font-size:0.85rem;">수업 시간을 추가해주세요.</span>
                </div>`;
        } 
        else {
            html += `<input type="text" id="field-${header}" class="modern-input" placeholder="${header} 입력">`;
        }
        html += `</div>`;
    });
    return html;
},

    // 요일 버튼 선택 함수
    selectDay(btn, day) {
        const group = btn.parentElement;
        group.querySelectorAll('.day-btn').forEach(b => {
            b.style.background = "white";
            b.style.color = "black";
            b.style.borderColor = "#ddd";
        });
        btn.style.background = "#007bff"; // 활성화 색상
        btn.style.color = "white";
        btn.style.borderColor = "#0056b3";
        window.selectedDay = day;
    },

    // 5. 출석 현황판
    renderScheduleBoard(groupedData, summary) {
    const board = document.getElementById('schedule-board'); 
    const summaryDiv = document.getElementById('schedule-summary');
    if (!board || !summaryDiv) return;

    // [추가] 오늘 날짜 구하기 (MM-DD 형식)
    const now = new Date();
    const todayStr = `${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

    summaryDiv.innerHTML = `
        <div class="summary-card total"><span class="label">대상</span><span class="value">${summary.total}</span></div>
        <div class="summary-card present"><span class="label">출석</span><span class="value">${summary.present}</span></div>
        <div class="summary-card absent"><span class="label">미출석</span><span class="value">${summary.absent}</span></div>`;

    board.innerHTML = "";
    const sortedTimes = Object.keys(groupedData).sort();

    if (sortedTimes.length === 0) {
        board.innerHTML = `<p style="text-align:center; padding:50px; color:var(--muted);">오늘 수업이 없습니다.</p>`;
        return;
    }

    sortedTimes.forEach(time => {
        const section = document.createElement('div');
        section.className = "time-section";
        const studentCards = groupedData[time].map(s => {
            
            // [추가] 생일 여부 확인 (s.birth에 "MM-DD"가 포함되어 있는지 체크)
            const isBirthday = s.birth && s.birth.includes(todayStr);
            
            return `
                <div class="student-status-card ${s.isPresent ? 'is-present' : 'is-absent'}" 
                     style="${isBirthday ? 'border: 2px solid #ff6b81; background: rgba(255,107,129,0.1); position:relative;' : ''}">
                    
                    ${isBirthday ? `
                        <div style="position:absolute; top:-2px; right:-2px; background:#ff6b81; color:white; padding:2px 6px; font-size:0.65rem; font-weight:bold; border-radius:0 0 0 8px;">
                            BIRTHDAY
                        </div>` : ''}
                    
                    <div class="name" style="${isBirthday ? 'color:#ff6b81; font-weight:bold;' : ''}">
                        ${s.name} ${isBirthday ? '🎂' : ''}
                    </div>
                    <div class="status-indicator">
                        ${isBirthday && !s.isPresent ? '<span style="font-size:0.7rem; display:block; color:#ff6b81;">오늘 생일!</span>' : ''}
                        ${s.isPresent ? '출석완료' : '미출석'}
                    </div>
                </div>`;
        }).join('');
        section.innerHTML = `<div class="time-header">🕒 ${time}</div><div class="student-grid">${studentCards}</div>`;
        board.appendChild(section);
    });
},

    // 6. 포인트/7. 카드교체 액션 (기존 유지)
  renderPointActions(s) {
        return `
        <div style="border-top: 1px solid rgba(255,255,255,0.1); padding-top: 20px; margin-top: 5px;">
            <p style="font-size: 0.85rem; color: var(--muted, #aaa); margin-bottom: 12px; font-weight: 600;">빠른 금액 지급</p>
            <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; margin-bottom: 20px;">
                ${[100, 300, 500].map(v => `
                    <button class="btn" 
                            style="background: rgba(255,255,255,0.08); color: #fff; border: 1px solid rgba(255,255,255,0.15); 
                                   padding: 14px 0; border-radius: 12px; font-weight: 800; font-size: 1rem; cursor: pointer; transition: all 0.2s;"
                            onmouseover="this.style.background='var(--primary)';" 
                            onmouseout="this.style.background='rgba(255,255,255,0.08)';"
                            onclick="updatePt('${s.ID}', ${v}, event)">+${v}</button>
                `).join('')}
            </div>
            
            <p style="font-size: 0.85rem; color: var(--muted, #aaa); margin-bottom: 12px; font-weight: 600;">직접 금액 입력</p>
            <div style="display: flex; align-items: stretch; gap: 8px; width: 100%;">
                <input type="number" id="pt-inp-${s.ID}" placeholder="지급할 포인트를 입력하세요" 
                       style="flex: 2; min-width: 0; padding: 16px; background: rgba(0,0,0,0.3); border: 1.5px solid rgba(255,255,255,0.1); 
                              border-radius: 12px; color: #fff; font-size: 1.1rem; outline: none; box-sizing: border-box;">
                
                <button class="btn btn-primary" 
                        style="width: 100px; background: var(--primary); color: white; border: none; 
                               border-radius: 12px; font-weight: bold; font-size: 1rem; cursor: pointer; flex-shrink: 0;"
                        onclick="updatePtManual('${s.ID}', event)">지급</button>
            </div>
        </div>`;
    }
};

/* --- 스케줄 태그 관리 함수 --- */
window.addScheduleTag = function() {
    const day = window.selectedDay;
    let time = document.getElementById('reg-time').value;
    if (!time) return alert("시간을 선택해주세요.");
    
    // 시간 형식 정리 (09:00 -> 9:00)
    if (time.startsWith('0')) time = time.substring(1);
    
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
        container.innerHTML = '<span style="color:var(--muted); font-size:0.85rem;">수업 시간을 추가해주세요.</span>';
        return;
    }
    container.innerHTML = window.tempSchedules.map((s, i) => `
        <div class="schedule-tag" style="background:#e7f3ff; color:#007bff; padding:5px 10px; border-radius:20px; font-size:0.85rem; border:1px solid #cce5ff;">
            ${s} <span onclick="removeScheduleTag(${i})" style="cursor:pointer; margin-left:5px; font-weight:bold;">×</span>
        </div>
    `).join('');
}

window.UI = UI;