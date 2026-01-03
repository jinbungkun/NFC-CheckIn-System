/* ==========================================================================
   [ui.js] - 통합 CSS를 활용한 UI 최적화 버전
   ========================================================================== */

let checkinTimer = null;

const UI = {
    // 1. 체크인 결과 표시 (성공/실패 피드백)
renderCheckinUI(name, msg, color, point) {
        const target = document.getElementById('checkin-result');
        if (!target) return;

        // 2. [핵심] 만약 3.5초가 지나기 전이라면, 이전의 '삭제 예약'을 취소함
        if (checkinTimer) {
            clearTimeout(checkinTimer);
        }

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
        
        // 3. 다시 새롭게 3.5초 타이머를 맞춥니다.
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

        // 달력 초기화 실행
        if (type === 'search') {
            data.forEach(s => {
                setTimeout(() => { if(typeof window.initCalendarUI === 'function') window.initCalendarUI(s.ID); }, 50);
            });
        }
    },

    // 3. 심플 카드 (포인트/카드 관리용)
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
            ${type === 'point' ? this.renderPointActions(s.ID) : ''}
            ${type === 'card' ? this.renderCardActions(s.ID, s.이름) : ''}
        </div>`;
    },

    // 4. 출석 현황판 (스케줄 대시보드)
 renderScheduleBoard(groupedData, summary) {
    const board = document.getElementById('schedule-board'); 
    const summaryDiv = document.getElementById('schedule-summary');
    if (!board || !summaryDiv) return;

    // [핵심] 오늘 날짜 추출 (MM-DD 형식)
    const now = new Date();
    const todayMMDD = `${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

    // 상단 요약 바
    summaryDiv.innerHTML = `
        <div class="summary-card total">
            <span class="label">대상</span>
            <span class="value">${summary.total}</span>
        </div>
        <div class="summary-card present">
            <span class="label">출석</span>
            <span class="value">${summary.present}</span>
        </div>
        <div class="summary-card absent">
            <span class="label">미출석</span>
            <span class="value">${summary.absent}</span>
        </div>
    `;

    board.innerHTML = "";
    const sortedTimes = Object.keys(groupedData).sort();

    if (sortedTimes.length === 0) {
        board.innerHTML = `
            <div style="text-align:center; padding:80px 0; color:var(--muted);">
                <div style="font-size: 3rem; margin-bottom: 10px;">📅</div>
                <p>오늘 예정된 수업이 없습니다.</p>
            </div>`;
        return;
    }

    sortedTimes.forEach(time => {
        const section = document.createElement('div');
        section.className = "time-section";
        
        // 학생 카드 생성
     const studentCards = groupedData[time].map(s => {
    const isBirthday = s.birth && s.birth.includes(todayMMDD);
    
    return `
        <div class="student-status-card ${s.isPresent ? 'is-present' : 'is-absent'} ${isBirthday ? 'is-birthday' : ''}">
            ${isBirthday ? `
                <div class="birthday-badge">
                    <span class="cake-icon">🎂</span>
                </div>
            ` : ''}
            <div class="card-content">
                <div class="name">${s.name}</div>
                <div class="status-indicator">${s.isPresent ? '출석완료' : '미출석'}</div>
            </div>
        </div>
    `;
}).join('');

        section.innerHTML = `
            <div class="time-header">🕒 ${time} 수업</div>
            <div class="student-grid">
                ${studentCards}
            </div>`;
        board.appendChild(section);
    });
},

    // 5. 포인트 액션
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

    // 6. 카드 교체
    renderCardActions(id, name) {
        return `
        <div style="border-top:1px solid var(--border); padding-top:15px; margin-top:15px;">
            <input type="text" id="new-card-input" placeholder="새 카드를 리더기에 찍으세요" readonly style="text-align:center; border-style:dashed; margin-bottom:10px;">
            <button class="btn btn-danger" style="background:var(--danger);" onclick="execCardChange('${id}', '${name}')">이 학생의 카드로 정보 교체</button>
        </div>`;
    }
};

window.UI = UI;