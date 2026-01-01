/* ==========================================================================
   [ui.js] - 모든 시각적 요소 생성을 담당
   ========================================================================== */
const UI = {
    // 1. 체크인 결과 표시 (출석 시 상단에 뜨는 카드)
    renderCheckinUI(name, msg, color) {
        const target = document.getElementById('checkin-result');
        if (target) {
            target.innerHTML = `
                <div class="student-info-card" style="text-align:center; border: 2px solid ${color}; padding: 15px; border-radius: 12px; background: rgba(0,0,0,0.2);">
                    <h3 style="color:${color}; margin: 5px 0; font-size: 1.5rem;">${name}</h3>
                    <p style="margin: 5px 0; font-weight: bold; color: white;">${msg}</p>
                </div>`;
        }
    },

    // 2. 검색/조회 결과 렌더링 메인 함수
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
            
            // [검색 페이지 전용 대시보드 형태]
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
                            <div class="info-item" style="grid-column: span 2;">📅 수업: ${s.수업스케줄 || '정보 없음'}</div>
                        </div>
                        <button class="btn-manual-checkin" onclick="doManualCheckin('${s.ID}')" style="width:100%; margin-top:10px; padding:8px; border-radius:6px; border:none; background:var(--primary); color:white; cursor:pointer;">이 학생 수동 출석</button>
                    </div>
                    <div class="dash-calendar" style="margin-top:15px; border-top: 1px solid #444; padding-top:15px;">
                        <div class="cal-nav" style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px;">
                            <button class="cal-btn" onclick="changeMonthUI('${s.ID}', -1)">◀</button>
                            <span class="cal-label" id="cal-label-${s.ID}" style="font-weight:bold;">0000년 00월</span>
                            <button class="cal-btn" onclick="changeMonthUI('${s.ID}', 1)">▶</button>
                        </div>
                        <div class="cal-grid" id="grid-${s.ID}" style="display:grid; grid-template-columns: repeat(7, 1fr); gap:2px; text-align:center;">
                            <div style="grid-column: span 7; padding: 20px; color: var(--muted); font-size: 0.8rem;">데이터 로딩 중...</div>
                        </div>
                    </div>
                </div> `;
            }
            
            // [포인트 관리/카드 교체용 심플 카드 형태]
            return this.renderSimpleCard(s, type, statusColor);
        }).join('');

        // 검색 페이지일 경우 달력 초기화 로직 자동 실행
        if (type === 'search') {
            data.forEach(s => {
                setTimeout(() => {
                    if(typeof initCalendarUI === 'function') initCalendarUI(s.ID);
                }, 50);
            });
        }
    },

    // 3. 포인트/카드 교체용 심플 카드
    renderSimpleCard(s, type, statusColor) {
        return `
        <div class="student-info-card" style="margin-bottom:15px; background:var(--card-bg); padding:15px; border-radius:10px; border:1px solid #444;">
            <div class="student-header" style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px;">
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

    // 4. 출석 현황판 렌더링 (Module 5 대응)
    renderScheduleBoard(groupedData, summary) {
        const board = document.getElementById('schedule-board'); 
        const summaryDiv = document.getElementById('schedule-summary');
        
        if (!board || !summaryDiv) return;

        summaryDiv.innerHTML = `
            <div class="summary-item total" style="background:#f1f3f5; padding:10px 20px; border-radius:8px;">대상: <strong>${summary.total}</strong></div>
            <div class="summary-item present" style="background:#ebfbee; color:#2b8a3e; padding:10px 20px; border-radius:8px;">출석: <strong>${summary.present}</strong></div>
            <div class="summary-item absent" style="background:#fff5f5; color:#c92a2a; padding:10px 20px; border-radius:8px;">미출석: <strong>${summary.absent}</strong></div>
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
            section.style.marginBottom = "30px";
            
            const students = groupedData[time];
            section.innerHTML = `
                <div class="time-title" style="font-weight:bold; margin-bottom: 15px; font-size: 1.1rem; border-left: 4px solid var(--primary); padding-left: 10px; color:white;">
                    ${time} 수업
                </div>
                <div class="status-grid" style="display:grid; grid-template-columns: repeat(auto-fill, minmax(110px, 1fr)); gap:10px;">
                    ${students.map(s => `
                        <div class="status-card" 
                             style="padding:15px 10px; border-radius:8px; text-align:center; font-weight:bold; border:1px solid; 
                                    background-color: ${s.isPresent ? '#ebfbee' : '#fff5f5'}; 
                                    border-color: ${s.isPresent ? '#b2f2bb' : '#ffc9c9'}; 
                                    color: ${s.isPresent ? '#2b8a3e' : '#c92a2a'};">
                            <div style="margin-bottom:5px; font-size:1rem;">${s.name}</div>
                            <div style="font-size:1.2rem;">${s.isPresent ? '✅' : '❌'}</div>
                        </div>
                    `).join('')}
                </div>
            `;
            board.appendChild(section);
        });
    },

    // 5. 포인트 액션 버튼
    renderPointActions(id) {
        return `
        <div class="point-action-area" style="border-top:1px solid #444; padding-top:10px; margin-top:10px;">
            <div class="point-grid" style="display:grid; grid-template-columns: repeat(3, 1fr); gap:5px; margin-bottom:8px;">
                ${[10, 50, 100].map(v => `<button class="btn btn-success" style="padding:8px; cursor:pointer;" onclick="updatePt('${id}', ${v}, event)">+${v}</button>`).join('')}
            </div>
            <div style="display:flex; gap:5px;">
                <input type="number" id="pt-inp-${id}" placeholder="직접 입력" style="flex:1; padding:8px; border-radius:4px; background:#333; color:white; border:1px solid #555;">
                <button class="btn btn-primary" style="padding:8px 15px; cursor:pointer;" onclick="updatePtManual('${id}', event)">지급</button>
            </div>
        </div>`;
    },

    // 6. 카드 교체 액션
    renderCardActions(id, name) {
        return `
        <div style="border-top:1px solid #444; padding-top:10px; margin-top:10px;">
            <input type="text" id="new-card-input" placeholder="새 카드 태그" readonly 
                   style="width:100%; background:rgba(255,255,255,0.1); color:white; margin-bottom:8px; padding:10px; border-radius:4px; border:1px solid #555;">
            <button class="btn btn-danger" style="width:100%; padding:10px; cursor:pointer; background:#f03e3e; border:none; color:white; border-radius:4px;" 
                    onclick="execCardChange('${id}', '${name}')">이 학생의 카드로 교체</button>
        </div>`;
    }
};