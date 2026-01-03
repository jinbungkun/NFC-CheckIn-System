/* ==========================================================================
   [ui.js] - 모든 시각적 요소 생성을 담당
   ========================================================================== */
const UI = {
    // 1. 체크인 결과 표시
    renderCheckinUI(name, msg, color) {
        const target = document.getElementById('checkin-result');
        if (target) {
            target.innerHTML = `
                <div class="student-info-card" style="text-align:center; border: 2px solid ${color}; padding: 15px; border-radius: 12px; background: rgba(0,0,0,0.2); margin-bottom: 20px;">
                    <h3 style="color:${color}; margin: 5px 0; font-size: 1.5rem;">${name}</h3>
                    <p style="margin: 5px 0; font-weight: bold; color: white;">${msg}</p>
                </div>`;
        }
    },

    // 2. 검색/조회 결과 렌더링
    renderResults(data, type) {
        const containerId = type === 'search' ? 'search-results' : (type === 'point' ? 'point-target-area' : 'card-target-area');
        const container = document.getElementById(containerId);
        if (!container) return;
        
        if (!data || data.length === 0) { 
            container.innerHTML = `<p style="text-align:center; padding:20px; color:var(--muted);">결과가 없습니다.</p>`; 
            return; 
        }

        container.innerHTML = data.map(s => {
            const statusColor = s.상태 === '재원' ? '#4CAF50' : (s.상태 === '휴원' ? '#FF9800' : '#F44336');
            
            if (type === 'search') {
                return `
                <div class="student-dashboard-card" style="background:var(--card-bg); border-radius:12px; padding:20px; margin-bottom:20px; border:1px solid #444;">
                    <div class="dash-info">
                        <div class="info-header" style="display:flex; justify-content:space-between; align-items:center; margin-bottom:15px;">
                            <span class="student-name" style="font-size:1.4rem; font-weight:bold; color:white;">${s.이름}</span>
                            <span class="status-badge" style="background:${statusColor}; padding:4px 10px; border-radius:20px; font-size:0.8rem;">${s.상태 || '재원'}</span>
                        </div>
                        <div class="info-body" style="display:grid; grid-template-columns:1fr 1fr; gap:10px; color:#ccc; font-size:0.95rem;">
                            <div class="info-item">🎂 ${s.생년월일 || '-'}</div>
                            <div class="info-item">📱 ${s.전화번호 || '-'}</div>
                            <div class="info-item">💰 <span class="point-val" style="color:var(--accent); font-weight:bold;">${s.포인트} pt</span></div>
                            <div class="info-item" style="grid-column: span 2;">📅 수업: ${s.수업스케줄 || '정보 없음'}</div>
                        </div
                    </div>
                    <div class="dash-calendar" style="margin-top:20px; border-top: 1px solid #444; padding-top:20px;">
                        <div class="cal-nav" style="display:flex; justify-content:space-between; align-items:center; margin-bottom:15px;">
                            <button class="cal-btn" onclick="changeMonthUI('${s.ID}', -1)" style="background:none; border:none; color:white; cursor:pointer;">◀</button>
                            <span class="cal-label" id="cal-label-${s.ID}" style="font-weight:bold; color:white;">0000년 00월</span>
                            <button class="cal-btn" onclick="changeMonthUI('${s.ID}', 1)" style="background:none; border:none; color:white; cursor:pointer;">▶</button>
                        </div>
                        <div class="cal-grid" id="grid-${s.ID}" style="display:grid; grid-template-columns: repeat(7, 1fr); gap:4px; text-align:center;">
                            <div style="grid-column: span 7; padding: 20px; color: var(--muted); font-size: 0.8rem;">달력 로딩 중...</div>
                        </div>
                    </div>
                </div> `;
            }
            return this.renderSimpleCard(s, type, statusColor);
        }).join('');

        if (type === 'search') {
            data.forEach(s => {
                setTimeout(() => { if(typeof window.initCalendarUI === 'function') window.initCalendarUI(s.ID); }, 50);
            });
        }
    },

    // 3. 심플 카드 (포인트/카드 관리용)
    renderSimpleCard(s, type, statusColor) {
        return `
        <div class="student-info-card" style="margin-bottom:15px; background:var(--card-bg); padding:15px; border-radius:10px; border:1px solid #444;">
            <div class="student-header" style="display:flex; justify-content:space-between; align-items:center;">
                <div>
                    <span style="font-size:1.2rem; font-weight:bold; color:white;">${s.이름}</span>
                    <span class="status-badge" style="background:${statusColor}; font-size:0.7rem; padding:2px 8px; border-radius:10px; margin-left:5px;">${s.상태 || '재원'}</span>
                </div>
                <span style="color:var(--accent); font-weight:bold;">${s.포인트} pt</span>
            </div>
            <div style="display:grid; grid-template-columns: 1fr 1fr; gap:8px; margin: 12px 0; font-size:0.9rem; color:#ccc;">
                <div>🎂 ${s.생년월일 || '-'}</div>
                <div>📱 ${s.전화번호 || '-'}</div>
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

        summaryDiv.innerHTML = `
            <div class="summary-item total" style="background:#333; padding:10px 15px; border-radius:8px; color:white;">대상: <strong>${summary.total}</strong></div>
            <div class="summary-item present" style="background:#2b8a3e; padding:10px 15px; border-radius:8px; color:white;">출석: <strong>${summary.present}</strong></div>
            <div class="summary-item absent" style="background:#c92a2a; padding:10px 15px; border-radius:8px; color:white;">미출석: <strong>${summary.absent}</strong></div>
        `;

        board.innerHTML = "";
        const sortedTimes = Object.keys(groupedData).sort();

        if (sortedTimes.length === 0) {
            board.innerHTML = "<p style='text-align:center; padding:50px; color:var(--muted);'>오늘 예정된 수업이 없습니다.</p>";
            return;
        }

        sortedTimes.forEach(time => {
            const section = document.createElement('div');
            section.innerHTML = `
                <div style="font-weight:bold; margin: 25px 0 10px 0; font-size: 1.1rem; border-left: 4px solid var(--primary); padding-left: 10px; color:white;">${time} 수업</div>
                <div style="display:grid; grid-template-columns: repeat(auto-fill, minmax(100px, 1fr)); gap:10px;">
                    ${groupedData[time].map(s => `
                        <div style="padding:15px 5px; border-radius:8px; text-align:center; font-weight:bold; border:1px solid ${s.isPresent ? '#2b8a3e' : '#c92a2a'}; background:${s.isPresent ? 'rgba(43,138,62,0.1)' : 'rgba(201,42,42,0.1)'}; color:white;">
                            <div style="margin-bottom:5px; font-size:0.9rem;">${s.name}</div>
                            <div>${s.isPresent ? '✅' : '❌'}</div>
                        </div>
                    `).join('')}
                </div>`;
            board.appendChild(section);
        });
    },

    // 5. 포인트 액션
    renderPointActions(id) {
        return `
        <div style="border-top:1px solid #444; padding-top:10px; margin-top:10px;">
            <div style="display:grid; grid-template-columns: repeat(3, 1fr); gap:5px; margin-bottom:8px;">
                ${[10, 50, 100].map(v => `<button class="btn btn-success" onclick="updatePt('${id}', ${v}, event)">+${v}</button>`).join('')}
            </div>
            <div style="display:flex; gap:5px;">
                <input type="number" id="pt-inp-${id}" placeholder="직접 입력" style="flex:1; padding:8px; border-radius:4px; background:#333; color:white; border:1px solid #555;">
                <button class="btn btn-primary" onclick="updatePtManual('${id}', event)">지급</button>
            </div>
        </div>`;
    },

    // 6. 카드 교체
    renderCardActions(id, name) {
        return `
        <div style="border-top:1px solid #444; padding-top:10px; margin-top:10px;">
            <input type="text" id="new-card-input" placeholder="새 카드 태그" readonly style="width:100%; background:rgba(255,255,255,0.1); color:white; margin-bottom:8px; padding:10px; border-radius:4px; border:1px solid #555;">
            <button class="btn btn-danger" style="width:100%; padding:10px; background:#f03e3e; border:none; color:white; border-radius:4px; cursor:pointer;" onclick="execCardChange('${id}', '${name}')">이 학생의 카드로 교체</button>
        </div>`;
    }
};

// [중요] app.js에서 접근할 수 있도록 전역 객체로 등록
window.UI = UI;