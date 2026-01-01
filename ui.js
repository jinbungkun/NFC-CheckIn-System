// [ui.js] - 모든 시각적 요소 생성을 담당
const UI = {
    // 1. 체크인 결과 표시
    renderCheckinUI(name, msg, color) {
        const target = document.getElementById('checkin-result');
        if (target) {
            target.innerHTML = `
                <div class="student-info-card" style="text-align:center; border: 2px solid ${color};">
                    <h3 style="color:${color}; margin: 5px 0;">${name}</h3>
                    <p style="margin: 5px 0; font-weight: bold;">${msg}</p>
                </div>`;
        }
    },

    // 2. 검색/조회 결과 대시보드 (기존 로직 유지)
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
                <div class="student-dashboard-card">
                    <div class="dash-info">
                        <div class="info-header">
                            <span class="student-name">${s.이름}</span>
                            <span class="status-badge" style="background:${statusColor}">${s.상태 || '재원'}</span>
                        </div>
                        <div class="info-body">
                            <div class="info-item">🎂 ${s.생년월일 || '-'}</div>
                            <div class="info-item">📱 ${s.전화번호 || '-'}</div>
                            <div class="info-item">💰 <span class="point-val">${s.포인트} pt</span></div>
                        </div>
                        <button class="btn-manual-checkin" onclick="doManualCheckin('${s.ID}')">이 학생 출석하기</button>
                    </div>
                    <div class="dash-calendar">
                        <div class="cal-nav">
                            <button class="cal-btn" onclick="changeMonthUI('${s.ID}', -1)">◀</button>
                            <span class="cal-label" id="cal-label-${s.ID}">0000년 00월</span>
                            <button class="cal-btn" onclick="changeMonthUI('${s.ID}', 1)">▶</button>
                        </div>
                        <div class="cal-grid" id="grid-${s.ID}">
                            <div style="grid-column: span 7; padding: 20px; color: var(--muted); font-size: 0.8rem;">데이터 로딩 중...</div>
                        </div>
                    </div>
                </div> `;
            }
            return this.renderSimpleCard(s, type, statusColor);
        }).join('');

        if (type === 'search') {
            data.forEach(s => {
                setTimeout(() => initCalendarUI(s.ID), 10);
            });
        }
    },

    // 3. 포인트/카드 교체용 심플 카드 (기존 로직 유지)
    renderSimpleCard(s, type, statusColor) {
        return `
        <div class="student-info-card">
            <div class="student-header">
                <div>
                    <span style="font-size:1.2rem; font-weight:bold; color:white;">${s.이름}</span>
                    <span class="status-badge" style="background:${statusColor}; font-size:0.7rem; padding:2px 6px; border-radius:10px; margin-left:5px; vertical-align:middle;">${s.상태 || '재원'}</span>
                </div>
                <span style="color:var(--accent); font-weight:bold;">${s.포인트} pt</span>
            </div>
            <div class="master-info-grid" style="display:grid; grid-template-columns: 1fr 1fr; gap:8px; margin: 12px 0; font-size:0.9rem; color:#ccc;">
                <div><b>🎂 생일:</b> ${s.생년월일 || '-'}</div>
                <div><b>📱 연락처:</b> ${s.전화번호 || '-'}</div>
                <div style="grid-column: span 2;"><b>📍 마지막 출석:</b> ${s.마지막출석 || '기록 없음'}</div>
            </div>
            ${type === 'point' ? this.renderPointActions(s.ID) : ''}
            ${type === 'card' ? this.renderCardActions(s.ID, s.이름) : ''}
        </div>`;
    },

    // --- [새로 추가된 현황판 렌더링 로직] ---
    
    // 4. 출석 현황판 렌더링
    renderStatusBoard(groupedData, summary) {
        const board = document.getElementById('status-board');
        const summaryDiv = document.getElementById('status-summary');
        if (!board || !summaryDiv) return;

        // 상단 요약 바 렌더링
        summaryDiv.innerHTML = `
            <div class="summary-item total">대상: <strong>${summary.total}</strong></div>
            <div class="summary-item present">출석: <strong>${summary.present}</strong></div>
            <div class="summary-item absent">미출석: <strong>${summary.absent}</strong></div>
        `;

        board.innerHTML = "";
        const sortedTimes = Object.keys(groupedData).sort();

        if (sortedTimes.length === 0) {
            board.innerHTML = "<div class='empty-msg' style='text-align:center; padding:50px; color:var(--muted);'>오늘 예정된 수업이 없습니다.</div>";
            return;
        }

        sortedTimes.forEach(time => {
            const section = document.createElement('div');
            section.className = 'time-section';
            
            const students = groupedData[time];
            section.innerHTML = `
                <div class="time-title" style="font-weight:bold; margin: 20px 0 10px 0; font-size: 1.1rem; border-left: 4px solid var(--primary); padding-left: 10px;">
                    ${time} 수업
                </div>
                <div class="status-grid" style="display:grid; grid-template-columns: repeat(auto-fill, minmax(110px, 1fr)); gap:10px;">
                    ${students.map(s => `
                        <div class="status-card ${s.isPresent ? 'is-present' : 'is-absent'}" 
                             style="padding:15px 10px; border-radius:8px; text-align:center; font-weight:bold; border:1px solid #dee2e6; 
                                    background-color: ${s.isPresent ? '#ebfbee' : '#fff5f5'}; 
                                    border-color: ${s.isPresent ? '#b2f2bb' : '#ffc9c9'}; 
                                    color: ${s.isPresent ? '#2b8a3e' : '#c92a2a'};">
                            <div style="margin-bottom:5px;">${s.name}</div>
                            <div style="font-size:1.2rem;">${s.isPresent ? '✅' : '❌'}</div>
                        </div>
                    `).join('')}
                </div>
            `;
            board.appendChild(section);
        });
    },

    renderPointActions(id) {
        return `
        <div class="point-action-area" style="border-top:1px solid #444; padding-top:10px; margin-top:10px;">
            <div class="point-grid" style="display:grid; grid-template-columns: repeat(3, 1fr); gap:5px; margin-bottom:8px;">
                ${[10, 50, 100].map(v => `<button class="btn btn-success" onclick="updatePt('${id}', ${v}, event)">+${v}</button>`).join('')}
            </div>
            <div style="display:flex; gap:5px;">
                <input type="number" id="pt-inp-${id}" placeholder="직접 입력" style="flex:1; padding:8px; border-radius:4px; background:#333; color:white; border:1px solid #555;">
                <button class="btn btn-primary" onclick="updatePtManual('${id}', event)">지급</button>
            </div>
        </div>`;
    },

    renderCardActions(id, name) {
        return `
        <div style="border-top:1px solid #444; padding-top:10px; margin-top:10px;">
            <input type="text" id="new-card-input" placeholder="새 카드 태그" readonly style="width:100%; background:rgba(255,255,255,0.1); color:white; margin-bottom:8px;">
            <button class="btn btn-danger" style="width:100%;" onclick="execCardChange('${id}', '${name}')">이 학생의 카드로 교체</button>
        </div>`;
    }
};