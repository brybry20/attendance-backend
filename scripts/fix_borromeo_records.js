const fs = require('fs');
const path = require('path');
const { getEmployeeType, getEmployeePosition, getScheduleForEmployee } = require('../config/employees');

const DATA_FILE = path.join(__dirname, '../data/attendance.json');

if (!fs.existsSync(DATA_FILE)) {
    console.log('No attendance.json found.');
    process.exit(0);
}

// --- HELPER FUNCTIONS FROM CONTROLLER ---
const getDayOfWeek = (dateStr) => {
  if (!dateStr) return '';
  const date = new Date(dateStr);
  const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  return days[date.getDay()];
};

function formatTime(date) {
  if (!date || isNaN(date)) return '';
  let hours = date.getHours();
  const minutes = String(date.getMinutes()).padStart(2, '0');
  const seconds = String(date.getSeconds()).padStart(2, '0');
  const ampm = hours >= 12 ? 'PM' : 'AM';
  hours = hours % 12;
  hours = hours ? hours : 12;
  return `${hours}:${minutes}:${seconds} ${ampm}`;
}

function parseTimeToDate(timeStr, baseDate) {
  const [hours, minutes] = timeStr.split(':');
  const date = new Date(baseDate);
  date.setHours(parseInt(hours), parseInt(minutes), 0);
  return date;
}

function computeLate(timeIn, scheduleStart, gracePeriod) {
  if (!timeIn) return 0;
  const startTime = parseTimeToDate(scheduleStart, timeIn);
  const graceTime = new Date(startTime.getTime() + gracePeriod * 60000);
  if (timeIn > graceTime) {
    return Math.floor((timeIn - graceTime) / 60000);
  }
  return 0;
}

function computeUndertime(timeOut, scheduleEnd) {
  if (!timeOut) return 0;
  const endTime = parseTimeToDate(scheduleEnd, timeOut);
  if (timeOut < endTime) {
    return Math.floor((endTime - timeOut) / 60000);
  }
  return 0;
}

function parseTimeToFullDate(timeStr, dateStr) {
  if (!timeStr) return null;
  const [time, ampm] = timeStr.split(' ');
  let [hours, minutes, seconds] = time.split(':');
  hours = parseInt(hours);
  if (ampm === 'PM' && hours !== 12) hours += 12;
  if (ampm === 'AM' && hours === 12) hours = 0;
  
  const [year, month, day] = dateStr.split('-');
  return new Date(year, month - 1, day, hours, minutes, seconds);
}

function recomputeRecord(record) {
  const hasTimeIn = record.timeIn && record.timeIn !== "";
  const hasTimeOut = record.timeOut && record.timeOut !== "";
  
  const dateObj = new Date(record.date);
  const dayOfWeek = dateObj.getDay();
  const isRestDay = dayOfWeek === 0 || dayOfWeek === 6;
  
  if (!hasTimeIn && !hasTimeOut) {
    if (isRestDay) {
      record.remarks = dayOfWeek === 0 ? "SUNDAY" : "SATURDAY";
    } else {
      record.remarks = "";
    }
    record.timeIn = "";
    record.timeOut = "";
    record.overtime = "";
    record.lateUndertime = "";
    record.rgot = "";
    record.rdot = "";
    
    // HOLIDAY OVERRIDE
    if (dateObj.getMonth() === 4 && dateObj.getDate() === 1) {
        record.remarks = "Labor day";
    }
    return record;
  }
  
  const schedule = getScheduleForEmployee(record.name, dateObj);
  
  let timeInDate = null;
  let timeOutDate = null;
  let remarks = "";
  
  if (hasTimeIn) {
    timeInDate = parseTimeToFullDate(record.timeIn, record.date);
  }
  
  if (hasTimeOut) {
    timeOutDate = parseTimeToFullDate(record.timeOut, record.date);
  }
  
  if (hasTimeIn && !hasTimeOut) {
    remarks = "NO TIME-OUT";
    record.timeOut = "";
  }
  
  if (hasTimeIn && hasTimeOut && record.timeIn === record.timeOut) {
    remarks = "NO TIME-OUT";
    timeOutDate = null;
    record.timeOut = "";
  }
  
  const skipComputation = remarks === "NO TIME-OUT";
  
  let late = 0;
  let overtime = 0;
  let undertime = 0;
  let overtimeType = "";
  let workedMinutes = 0;
  
  if (timeInDate && !skipComputation && !isRestDay) {
    late = computeLate(timeInDate, schedule.startTime, schedule.gracePeriod);
  }
  
  if (isRestDay && timeInDate && timeOutDate && !skipComputation) {
    workedMinutes = Math.floor((timeOutDate - timeInDate) / 60000);
    if (schedule.hasOT && workedMinutes > 30) {
      overtime = workedMinutes;
      overtimeType = "RDOT";
      remarks = `REST DAY OT - ${(workedMinutes / 60).toFixed(2)} hrs`;
    } else if (schedule.hasOT && workedMinutes <= 30) {
      remarks = "REST DAY (NO OT - UNDER 30 MINS)";
    } else {
      remarks = "REST DAY (NO OT)";
    }
  }
  
  if (!isRestDay && timeOutDate && !skipComputation && schedule.hasOT) {
    const endTime = parseTimeToDate(schedule.endTime, timeOutDate);
    if (timeOutDate > endTime) {
      const diffMinutes = Math.floor((timeOutDate - endTime) / 60000);
      if (diffMinutes > 30) {
        overtime = diffMinutes;
        overtimeType = "RGOT";
        remarks = remarks || "";
      }
    }
    if (!isRestDay) {
      undertime = computeUndertime(timeOutDate, schedule.endTime);
    }
  }
  
  if (!isRestDay && !remarks && !skipComputation) {
    remarks = "";
  }
  
  let lateUndertime = "";
  if (late > 0) lateUndertime = `${late} mins`;
  else if (undertime > 0 && !isRestDay) lateUndertime = `${undertime} mins`;
  
  const overtimeHours = overtime > 0 ? (overtime / 60).toFixed(2) : "";
  
  record.timeIn = timeInDate ? formatTime(timeInDate) : "";
  
  if (remarks === "NO TIME-OUT") {
    record.timeOut = "";
  } else {
    record.timeOut = timeOutDate ? formatTime(timeOutDate) : "";
  }
  
  if (remarks === "NO TIME-OUT") {
    record.overtime = "";
    record.lateUndertime = "";
    record.rgot = "";
    record.rdot = "";
    record.remarks = remarks;
  } else {
    record.overtime = overtime > 0 ? `${overtime} mins` : "";
    record.lateUndertime = lateUndertime;
    
    if (overtimeType === "RGOT") {
      record.rgot = overtimeHours;
      record.rdot = "";
      record.remarks = remarks || "";
    } else if (overtimeType === "RDOT") {
      record.rdot = overtimeHours;
      record.rgot = "";
      record.remarks = remarks;
    } else {
      record.rgot = "";
      record.rdot = "";
      record.remarks = remarks || "";
    }
  }

  // HOLIDAY OVERRIDE
  if (dateObj.getMonth() === 4 && dateObj.getDate() === 1) {
    record.remarks = "Labor day";
  }
  
  return record;
}

// --- MAIN SCRIPT ---
try {
    const data = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
    const fileName = "April 28-May 11,2026.xls";
    
    if (!data[fileName]) {
        console.log(`File ${fileName} not found in data.`);
        process.exit(0);
    }

    const fileData = data[fileName];
    
    // Store existing times for Ranny (to be Ramel)
    const existingTimes = {};
    fileData.attendance.forEach(record => {
        if (record.name === "Borromeo, Ranny") {
            existingTimes[record.date] = {
                timeIn: record.timeIn,
                timeOut: record.timeOut
            };
        }
    });

    // Remove existing Ranny records
    fileData.attendance = fileData.attendance.filter(r => r.name !== "Borromeo, Ranny");

    // Generate full range for Borromeo, Ramel
    const startDate = new Date(2026, 3, 28); // April 28
    const endDate = new Date(2026, 4, 11);   // May 11
    
    let idCounter = Math.max(...fileData.attendance.map(r => r.id)) + 1;
    const newRecords = [];

    let current = new Date(startDate);
    while (current <= endDate) {
        const year = current.getFullYear();
        const month = String(current.getMonth() + 1).padStart(2, '0');
        const day = String(current.getDate()).padStart(2, '0');
        const dateStr = `${year}-${month}-${day}`;
        
        const existing = existingTimes[dateStr] || { timeIn: "", timeOut: "" };
        
        let record = {
            id: idCounter++,
            name: "Borromeo, Ramel",
            date: dateStr,
            day: getDayOfWeek(dateStr),
            timeIn: existing.timeIn,
            timeOut: existing.timeOut,
            overtime: "",
            lateUndertime: "",
            remarks: "",
            employeeType: getEmployeeType("Borromeo, Ramel"),
            position: getEmployeePosition("Borromeo, Ramel"),
            paidHoliday: "",
            lastCutoffAdjust: "",
            lwop: "",
            lwp: "",
            rgot: "",
            rdot: "",
            isSummary: false
        };
        
        record = recomputeRecord(record);
        newRecords.push(record);
        
        current.setDate(current.getDate() + 1);
    }

    // Add new records and sort
    fileData.attendance.push(...newRecords);
    fileData.attendance.sort((a, b) => {
        if (a.name < b.name) return -1;
        if (a.name > b.name) return 1;
        return a.date.localeCompare(b.date);
    });
    
    fileData.totalRecords = fileData.attendance.length;

    fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
    console.log(`Successfully completed records for Borromeo, Ramel in ${fileName}.`);

} catch (error) {
    console.error('Error during processing:', error);
    process.exit(1);
}
