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
        return `
            <div class="student-simple-card" 
                 style="background: var(--card-bg, rgba(255,255,255,0.05)); 
                        border: 1px solid var(--border, rgba(255,255,255,0.1)); 
                        border-radius: 16px; padding: 24px; margin-bottom: 20px; 
                        backdrop-filter: blur(10px); color: var(--text-main, #fff);
                        box-shadow: 0 8px 32px rgba(0,0,0,0.2);">
                <div style="display: flex; justify-content: space-between; align-items: flex-end; margin-bottom: 20px;">
                    <div>
                        <strong style="font-size: 1.3rem; display: block; margin-bottom: 4px;">${s.이름}</strong>
                        <span style="font-size: 1.0rem; color: var(--accent, #ffd700); font-weight: 700;">
                            💰 현재 잔액: ${Number(s.포인트).toLocaleString()} pt
                        </span>
                    </div>
                    <span style="font-size: 0.9rem; color: var(--muted, #aaa); opacity: 0.8;">${s.전화번호 || '연락처 없음'}</span>
                </div>
                ${actionHtml}
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
            else if (header === '수업스케줄') {
                html += `
                    <div id="day-selector-group" style="display:flex; gap:4px; margin-bottom:8px;">
                        ${['월','화','수','목','금','토','일'].map(d => `
                            <button type="button" class="day-btn ${d === '월' ? 'active' : ''}" 
                                    onclick="UI.selectDay(this, '${d}')" 
                                    style="flex:1; padding:10px 0; border:1px solid #ddd; border-radius:6px; background:white; cursor:pointer; font-weight:bold;">
                                ${d}
                            </button>
                        `).join('')}
                    </div>
                    <div class="builder-controls" style="display:flex; gap:5px;">
                        <input type="time" id="reg-time" class="modern-input" style="flex:1;">
                        <button type="button" onclick="addScheduleTag()" class="btn btn-primary" style="padding:0 20px; font-size:1.2rem;">+</button>
                    </div>
                    <div id="schedule-tags-container" style="margin-top:10px; border:2px dashed #eee; padding:12px; border-radius:8px; min-height:50px; display:flex; flex-wrap:wrap; gap:6px;">
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
            const studentCards = groupedData[time].map(s => `
                <div class="student-status-card ${s.isPresent ? 'is-present' : 'is-absent'}">
                    <div class="name">${s.name}</div>
                    <div class="status-indicator">${s.isPresent ? '출석완료' : '미출석'}</div>
                </div>`).join('');
            section.innerHTML = `<div class="time-header">🕒 ${time}</div><div class="student-grid">${studentCards}</div>`;
            board.appendChild(section);
        });
    },

    // 6. 포인트/7. 카드교체 액션 (기존 유지)
  renderPointActions(s) {
        return `
        <div style="border-top: 1px solid rgba(255,255,255,0.1); padding-top: 20px; margin-top: 5px;">
            <p style="font-size: 0.85rem; color: var(--muted, #aaa); margin-bottom: 12px; font-weight: 600;">빠른 금액 지급</p>
            <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; margin-bottom: 16px;">
                ${[100, 300, 500].map(v => `
                    <button class="btn" 
                            style="background: rgba(255,255,255,0.08); color: #fff; border: 1px solid rgba(255,255,255,0.15); 
                                   padding: 14px 0; border-radius: 12px; font-weight: 800; font-size: 1rem; cursor: pointer; transition: all 0.2s;"
                            onmouseover="this.style.background='var(--primary)'; this.style.borderColor='var(--primary)';" 
                            onmouseout="this.style.background='rgba(255,255,255,0.08)'; this.style.borderColor='rgba(255,255,255,0.15)';"
                            onclick="updatePt('${s.ID}', ${v}, event)">+${v}</button>
                `).join('')}
            </div>
            
            <p style="font-size: 0.85rem; color: var(--muted, #aaa); margin-bottom: 12px; font-weight: 600;">직접 금액 입력</p>
            <div style="display: flex; gap: 10px;">
                <input type="number" id="pt-inp-${s.ID}" placeholder="지급할 포인트를 입력하세요" 
                       style="flex: 1; padding: 16px; background: rgba(0,0,0,0.3); border: 1.5px solid rgba(255,255,255,0.1); 
                              border-radius: 12px; color: #fff; font-size: 1rem; outline: none; transition: border-color 0.2s;"
                       onfocus="this.style.borderColor='var(--primary)'"
                       onblur="this.style.borderColor='rgba(255,255,255,0.1)'">
                <button class="btn btn-primary" 
                        style="padding: 0 30px; background: var(--primary); color: white; border: none; 
                               border-radius: 12px; font-weight: bold; font-size: 1rem; cursor: pointer; transition: opacity 0.2s;"
                        onmousedown="this.style.opacity='0.8'"
                        onmouseup="this.style.opacity='1'"
                        onclick="updatePtManual('${s.ID}', event)">지급하기</button>
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