/* =============================================================
   [Section 1] 전역 설정 및 메인 라우터 (Entry Point)
   ============================================================= */
var CONFIG = {
  SHEET_NAME: "학생명단",
  LOG_SHEET_PREFIX: "출석로그_",
  COLUMNS: {
    ID: "ID", 
    NAME: "이름", 
    BIRTH: "생년월일", 
    PHONE: "전화번호", 
    SCHEDULE: "수업스케줄", 
    POINT: "포인트", 
    STATUS: "상태", 
    LAST_DATE: "마지막출석"
  }
};

function doPost(e) {
  try {
    var data = JSON.parse(e.postData.contents);
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    
    // 액션에 따라 필요한 데이터만 선별적으로 로드하여 최적화
    var ctx = getContext(ss, data.action);

    switch (data.action) {
      case "getSchema":   return response({success: true, headers: ctx.headers});
      case "getQuickMap": return handleGetQuickMap(ctx.rows, ctx.idx);
      case "checkin":     return handleCheckin(ctx.sheet, ctx.idx, data, ss);
      case "add":         return handleAddStudent(ctx.sheet, ctx.headers, data);
      case "updatePoint": return handleUpdatePoint(ctx.sheet, ctx.idx, data);
      case "updateId":    return handleUpdateId(ctx.sheet, ctx.idx, data);
      case "getHistory":  return handleGetHistory(data, ss);
      default:            return response({success: false, message: "알 수 없는 액션"});
    }
  } catch (err) {
    return response({success: false, message: "서버 오류: " + err.toString()});
  }
}

/* =============================================================
   [Section 2] 데이터 조회 및 출석 핸들러 (최적화 버전)
   ============================================================= */

// [조회] row 인덱스를 포함하여 앱에 데이터 전송
function handleGetQuickMap(rows, idx) {
  var map = {};
  for (var i = 1; i < rows.length; i++) {
    var id = String(rows[i][idx.id]).trim();
    var status = String(rows[i][idx.status] || "").trim();
    if (!id || status === "퇴원") continue; 
    
    map[id] = {
      name: String(rows[i][idx.name] || ""),
      birth: String(rows[i][idx.birth] || ""),
      phone: String(rows[i][idx.phone] || ""),
      point: Number(rows[i][idx.point]) || 0,
      status: status,
      schedule: String(rows[i][idx.schedule] || ""),
      lastDate: String(rows[i][idx.last_date] || ""), // getDisplayValues로 이미 포맷팅됨
      row: i + 1 // 앱에서 직접 접근할 수 있는 행 번호 저장
    };
  }
  return response({success: true, data: map});
}

// [출석] row 번호로 직접 접근하여 루프 없이 처리
function handleCheckin(sheet, idx, data, ss) {
  var today = Utilities.formatDate(new Date(), "GMT+9", "yyyy-MM-dd");
  var r = data.row; // 앱에서 보내준 row 번호

  if (!r) return response({success: false, message: "행 정보가 없습니다."});

  // 해당 행만 콕 집어서 데이터 가져오기 (getDisplayValues 사용)
  var range = sheet.getRange(r, 1, 1, sheet.getLastColumn());
  var rowData = range.getDisplayValues()[0];

  // 보안 확인: 보낸 ID와 시트의 ID가 일치하는지 확인
  if (String(rowData[idx.id]).trim() !== String(data.id).trim()) {
    return response({success: false, message: "데이터 불일치 (새로고침 필요)"});
  }

  // 중복 출석 확인
  if (rowData[idx.last_date] === today) {
    return response({success: false, name: rowData[idx.name], status: "already"});
  }

  // 포인트와 날짜를 한 번의 통신(setValues)으로 업데이트하기 위해 범위 계산
  var startCol = Math.min(idx.point, idx.last_date) + 1;
  var colCount = Math.abs(idx.point - idx.last_date) + 1;
  var updateRange = sheet.getRange(r, startCol, 1, colCount);
  var vals = updateRange.getValues()[0];

  vals[idx.point + 1 - startCol] = (Number(rowData[idx.point]) || 0) + 10;
  vals[idx.last_date + 1 - startCol] = today;

  updateRange.setValues([vals]); // 시트 쓰기 통신 1회 발생
  
  logAttendance(ss, data.id, rowData[idx.name], "출석");
  return response({success: true, name: rowData[idx.name], message: "출석 성공 (+10pt)"});
}

/* =============================================================
   [Section 3] 정보 관리 핸들러 (직접 접근 최적화)
   ============================================================= */

function handleUpdatePoint(sheet, idx, data) {
  var r = data.row;
  if (!r) return response({success: false, message: "행 정보 없음"});

  var currentPoint = Number(sheet.getRange(r, idx.point + 1).getValue()) || 0;
  var newTotal = currentPoint + (Number(data.amount) || 0);
  
  sheet.getRange(r, idx.point + 1).setNumberFormat("0").setValue(newTotal);
  return response({success: true, newTotal: newTotal});
}

function handleUpdateId(sheet, idx, data) {
  var r = data.row;
  if (!r) return response({success: false, message: "행 정보 없음"});
  
  sheet.getRange(r, idx.id + 1).setValue("'" + String(data.newId));
  return response({success: true, message: "카드 교체 성공"});
}

function handleAddStudent(sheet, headers, data) {
  var newRow = headers.map(function(h) {
    if (h === CONFIG.COLUMNS.POINT) return 0;
    if (h === CONFIG.COLUMNS.STATUS) return "재원";
    if (h === CONFIG.COLUMNS.LAST_DATE) return "";
    var val = (data.fields && data.fields[h]) ? String(data.fields[h]).trim() : "";
    if (h === CONFIG.COLUMNS.ID || h === CONFIG.COLUMNS.PHONE) return "'" + val;
    return val;
  });
  sheet.appendRow(newRow);
  return response({success: true, message: "등록 완료"});
}

function handleGetHistory(data, ss) {
  var targetId = String(data.id || "").trim();
  var logSheetName = CONFIG.LOG_SHEET_PREFIX + (data.year || new Date().getFullYear());
  var logSheet = ss.getSheetByName(logSheetName);
  
  if (!logSheet) return response({ success: true, history: [] });

  var logs = logSheet.getDataRange().getValues();
  var history = [];

  for (var i = logs.length - 1; i >= 1; i--) {
    if (String(logs[i][1]).trim() === targetId) {
      var rawValue = logs[i][0]; // 첫 번째 열 (날짜 데이터)
      
      // [수정 포인트] 텍스트든 객체든 일단 Date로 변환 시도
      var d = new Date(rawValue); 
      
      // 유효한 날짜인지 확인 (Invalid Date가 아닌지)
      if (!isNaN(d.getTime())) {
        // 한국 표준시(GMT+9) 기준으로 YYYY-MM-DD 형식의 문자열 추출
        var datePart = Utilities.formatDate(d, "GMT+9", "yyyy-MM-dd");
        
        // 중복 제거 후 배열에 추가
        if (history.indexOf(datePart) === -1) {
          history.push(datePart);
        }
      }
    }
  }
  
  return response({ success: true, history: history });
}

/* =============================================================
   [Section 4] 시스템 유틸리티
   ============================================================= */

function getContext(ss, action) {
  var { sheet } = initSheets(ss);
  var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0].map(h => String(h || "").trim());
  var idx = {};
  for (var key in CONFIG.COLUMNS) {
    idx[key.toLowerCase()] = headers.indexOf(CONFIG.COLUMNS[key]);
  }

  // getQuickMap일 때만 전체 데이터를 가져와서 메모리 절약 (getDisplayValues 사용)
  var rows = (action === "getQuickMap") ? sheet.getDataRange().getDisplayValues() : null;

  return { sheet, rows, idx, headers };
}

function initSheets(ss) {
  var sheet = ss.getSheetByName(CONFIG.SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(CONFIG.SHEET_NAME);
    var headerRow = [
      CONFIG.COLUMNS.ID, CONFIG.COLUMNS.NAME, CONFIG.COLUMNS.BIRTH, 
      CONFIG.COLUMNS.PHONE, CONFIG.COLUMNS.SCHEDULE, CONFIG.COLUMNS.POINT, 
      CONFIG.COLUMNS.STATUS, CONFIG.COLUMNS.LAST_DATE
    ];
    sheet.appendRow(headerRow);
    sheet.setFrozenRows(1);
  }
  return { sheet: sheet };
}

function logAttendance(ss, id, name, status) {
  var sheetName = CONFIG.LOG_SHEET_PREFIX + new Date().getFullYear();
  var s = ss.getSheetByName(sheetName) || ss.insertSheet(sheetName);
  if (s.getLastRow() === 0) {
    s.appendRow(["날짜시간", "ID", "이름", "상태"]).setFrozenRows(1);
  }
  s.appendRow([new Date(), "'" + id, name, status]);
}

function response(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}