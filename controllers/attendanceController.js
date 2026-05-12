// controllers/attendanceController.js
const XLSX = require('xlsx');
const fs = require('fs');
const path = require('path');
const { getEmployeeType, getEmployeePosition, hasOT, getScheduleForEmployee } = require('../config/employees');

// File path for persistence
const DATA_FILE = path.join(__dirname, '../data/attendance.json');

// Ensure data directory exists
const dataDir = path.join(__dirname, '../data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

// Load existing data from file
let uploadedFiles = new Map();

function loadData() {
  try {
    if (fs.existsSync(DATA_FILE)) {
      const data = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
      uploadedFiles = new Map(Object.entries(data));
      console.log(`Loaded ${uploadedFiles.size} files from storage`);
    }
  } catch (error) {
    console.error('Error loading data:', error);
  }
}

function saveData() {
  try {
    const data = Object.fromEntries(uploadedFiles);
    fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
    console.log(`Saved ${uploadedFiles.size} files to storage`);
  } catch (error) {
    console.error('Error saving data:', error);
  }
}

// Load data on startup
loadData();

// ============================================
// HELPER FUNCTIONS
// ============================================

// Helper function to get day of week
const getDayOfWeek = (dateStr) => {
  if (!dateStr) return '';
  const date = new Date(dateStr);
  const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  return days[date.getDay()];
};

// Get schedule based on employee and date (uses config)
function getSchedule(employeeType, date, employeeName) {
  return getScheduleForEmployee(employeeName, date);
}

function parseDateTime(dateTimeStr) {
  if (!dateTimeStr || typeof dateTimeStr !== 'string') return null;
  
  const specials = ['SATURDAY', 'SUNDAY', 'Leave', 'FIELDWORK', 'ABSENT', 'RDOT', 'RGOT', 'LWOP', 'LWP', 'LATES', 'Adjust', 'Paid Holiday'];
  if (specials.some(s => dateTimeStr.includes(s))) {
    return null;
  }
  
  if (dateTimeStr.includes("00:00:00") && dateTimeStr.match(/^\d{4}-\d{2}-\d{2}/)) {
    return new Date(dateTimeStr);
  }
  
  try {
    let cleaned = dateTimeStr.toLowerCase().trim();
    let datePart, timePart, ampm;
    
    if (cleaned.includes(' ')) {
      const parts = cleaned.split(' ');
      datePart = parts[0];
      timePart = parts[1];
      ampm = parts[2] || '';
    } else {
      return null;
    }
    
    const [day, month, year] = datePart.split('/');
    let [hour, minute, second] = timePart.split(':');
    
    hour = parseInt(hour);
    if (ampm === 'pm' && hour !== 12) hour += 12;
    if (ampm === 'am' && hour === 12) hour = 0;
    
    return new Date(year, month - 1, day, hour, minute, second);
  } catch (e) {
    return null;
  }
}

function formatDate(date) {
  if (!date || isNaN(date)) return null;
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

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

function parseTimeString(timeStr) {
  if (!timeStr) return 0;
  const [time, ampm] = timeStr.split(' ');
  let [hours, minutes, seconds] = time.split(':');
  hours = parseInt(hours);
  if (ampm === 'PM' && hours !== 12) hours += 12;
  if (ampm === 'AM' && hours === 12) hours = 0;
  return hours * 3600 + parseInt(minutes) * 60 + parseInt(seconds);
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

// ============================================
// RECOMPUTE FUNCTION
// ============================================
function recomputeRecord(record) {
  const hasTimeIn = record.timeIn && record.timeIn !== "";
  const hasTimeOut = record.timeOut && record.timeOut !== "";
  
  const dateObj = new Date(record.date);
  const dayOfWeek = dateObj.getDay();
  const isRestDay = dayOfWeek === 0 || dayOfWeek === 6;
  
  // SPECIAL CASE: NO TIME-IN at NO TIME-OUT
  if (!hasTimeIn && !hasTimeOut) {
    // Weekend - mark as SATURDAY or SUNDAY
    if (isRestDay) {
      record.remarks = dayOfWeek === 0 ? "SUNDAY" : "SATURDAY";
    } else {
      // Weekday with no data - keep blank
      record.remarks = "";
    }
    record.timeIn = "";
    record.timeOut = "";
    record.overtime = "";
    record.lateUndertime = "";
    record.rgot = "";
    record.rdot = "";
    return record;
  }
  
  const schedule = getSchedule(record.employeeType, dateObj, record.name);
  
  let timeInDate = null;
  let timeOutDate = null;
  let remarks = "";
  
  if (hasTimeIn) {
    timeInDate = parseTimeToFullDate(record.timeIn, record.date);
  }
  
  if (hasTimeOut) {
    timeOutDate = parseTimeToFullDate(record.timeOut, record.date);
  }
  
  // Check if missing time-out (has time-in but no time-out)
  if (hasTimeIn && !hasTimeOut) {
    remarks = "NO TIME-OUT";
    record.timeOut = "";
  }
  
  // Check if time-in equals time-out (no actual time-out)
  if (hasTimeIn && hasTimeOut && record.timeIn === record.timeOut) {
    remarks = "NO TIME-OUT";
    timeOutDate = null;
    record.timeOut = "";
  }
  
  // Skip computation for NO TIME-OUT only
  const skipComputation = remarks === "NO TIME-OUT";
  
  let late = 0;
  let overtime = 0;
  let undertime = 0;
  let overtimeType = "";
  let workedMinutes = 0;
  
  // Compute late if not rest day (regular day)
  if (timeInDate && !skipComputation && !isRestDay) {
    late = computeLate(timeInDate, schedule.startTime, schedule.gracePeriod);
  }
  
  // Compute worked minutes for rest day
  if (isRestDay && timeInDate && timeOutDate && !skipComputation) {
    workedMinutes = Math.floor((timeOutDate - timeInDate) / 60000);
    
    // Only count if employee has OT and worked > 30 minutes
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
  
  // Compute regular day overtime
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
    
    // Compute undertime only for regular days
    if (!isRestDay) {
      undertime = computeUndertime(timeOutDate, schedule.endTime);
    }
  }
  
  // Set remarks for regular days if not set
  if (!isRestDay && !remarks && !skipComputation) {
    // Don't set anything for normal days without issues
    remarks = "";
  }
  
  let lateUndertime = "";
  if (late > 0) lateUndertime = `${late} mins`;
  else if (undertime > 0 && !isRestDay) lateUndertime = `${undertime} mins`;
  
  // Convert overtime minutes to hours
  const overtimeHours = overtime > 0 ? (overtime / 60).toFixed(2) : "";
  
  record.timeIn = timeInDate ? formatTime(timeInDate) : "";
  
  if (remarks === "NO TIME-OUT") {
    record.timeOut = "";
  } else {
    record.timeOut = timeOutDate ? formatTime(timeOutDate) : "";
  }
  
  // Set final values
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
  const dateObjForHoliday = new Date(record.date);
  if (dateObjForHoliday.getMonth() === 4 && dateObjForHoliday.getDate() === 1) {
    record.remarks = "Labor day";
  }
  
  return record;
}
// ============================================
// PARSE BIOMETRICS FILE
// ============================================

function parseBiometricsFile(filePath, fileName) {
  try {
    const workbook = XLSX.readFile(filePath);
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" });
    
    let startRow = 0;
    for (let i = 0; i < rows.length; i++) {
      if (rows[i] && rows[i][0] === "Department") {
        startRow = i + 1;
        break;
      }
    }
    
    // First pass: collect all existing records
    const existingRecords = [];
    const allDatesSet = new Set();
    const allEmployeesSet = new Set();
    
    for (let i = startRow; i < rows.length; i++) {
      const row = rows[i];
      if (!row || row.length < 4) continue;
      
      let name = row[1] ? String(row[1]).trim() : "";
      if (name === "57") name = "Morallos, Carlo";
      const dateTimeStr = row[3];
      
      if (!name || name === "" || name === "Name") continue;
      if (!dateTimeStr || dateTimeStr === "") continue;
      
      const dateTime = parseDateTime(dateTimeStr);
      if (!dateTime) continue;
      
      const date = formatDate(dateTime);
      const time = formatTime(dateTime);
      
      allDatesSet.add(date);
      allEmployeesSet.add(name);
      
      // Find if record already exists for this employee and date
      const existingIndex = existingRecords.findIndex(r => r.name === name && r.date === date);
      
      if (existingIndex === -1) {
        existingRecords.push({
          name: name,
          date: date,
          timeIn: time,
          timeOut: time,
          remarks: "",
          scanCount: 1
        });
      } else {
        const existing = existingRecords[existingIndex];
        // Update timeIn (earliest) and timeOut (latest)
        const currentTimeIn = parseTimeString(existing.timeIn);
        const currentTimeOut = parseTimeString(existing.timeOut);
        const newTime = parseTimeString(time);
        
        if (newTime < currentTimeIn) existing.timeIn = time;
        if (newTime > currentTimeOut) existing.timeOut = time;
        existing.scanCount++;
      }
    }
    
    // Parse date range from filename if possible
    let startDate, endDate;
    let foundDateRangeFromFileName = false;
    
    if (fileName) {
      const match = fileName.match(/([a-zA-Z]+)\s*(\d+)\s*-\s*(?:([a-zA-Z]+)\s*)?(\d+)[,\s]+(\d{4})/);
      if (match) {
        const monthNames = {
          january: 0, jan: 0,
          february: 1, feb: 1,
          march: 2, mar: 2,
          april: 3, apr: 3,
          may: 4,
          june: 5, jun: 5,
          july: 6, jul: 6,
          august: 7, aug: 7,
          september: 8, sep: 8, sept: 8,
          october: 9, oct: 9,
          november: 10, nov: 10,
          december: 11, dec: 11
        };
        
        const startMonthStr = match[1].toLowerCase();
        const startDay = parseInt(match[2]);
        const endMonthStr = match[3] ? match[3].toLowerCase() : startMonthStr;
        const endDay = parseInt(match[4]);
        const year = parseInt(match[5]);
        
        const startMonthIndex = monthNames[startMonthStr];
        const endMonthIndex = monthNames[endMonthStr];
        
        if (startMonthIndex !== undefined && endMonthIndex !== undefined) {
          startDate = new Date(year, startMonthIndex, startDay);
          endDate = new Date(year, endMonthIndex, endDay);
          foundDateRangeFromFileName = true;
          console.log(`Extracted date range from filename: ${formatDate(startDate)} to ${formatDate(endDate)}`);
        }
      }
    }
    
    if (!foundDateRangeFromFileName) {
      // Fallback: Get min and max dates from records
      const allDates = Array.from(allDatesSet).sort();
      if (allDates.length === 0) {
        return [];
      }
      
      startDate = new Date(allDates[0]);
      endDate = new Date(allDates[allDates.length - 1]);
      
      // Auto-expand to cover the full week (Monday to Sunday)
      const startDay = startDate.getDay();
      const diffToMonday = startDay === 0 ? -6 : 1 - startDay;
      startDate.setDate(startDate.getDate() + diffToMonday);

      const endDay = endDate.getDay();
      const diffToSunday = endDay === 0 ? 0 : 7 - endDay;
      endDate.setDate(endDate.getDate() + diffToSunday);
    }
    
    // Generate all days in the expanded range
    const allDaysInRange = [];
    const currentDate = new Date(startDate);
    
    while (currentDate <= endDate) {
      const year = currentDate.getFullYear();
      const month = String(currentDate.getMonth() + 1).padStart(2, '0');
      const day = String(currentDate.getDate()).padStart(2, '0');
      allDaysInRange.push(`${year}-${month}-${day}`);
      currentDate.setDate(currentDate.getDate() + 1);
    }
    
    // Build complete attendance for all employees and all days
    const attendance = [];
    let idCounter = 1;
    const allEmployees = Array.from(allEmployeesSet).sort();
    
    for (const employeeName of allEmployees) {
      for (const date of allDaysInRange) {
        const existingRecord = existingRecords.find(r => r.name === employeeName && r.date === date);
        
        if (existingRecord) {
          // Has existing record
          attendance.push({
            id: idCounter++,
            name: employeeName,
            date: date,
            day: getDayOfWeek(date),
            timeIn: existingRecord.timeIn,
            timeOut: existingRecord.timeOut,
            overtime: "",
            lateUndertime: "",
            remarks: "",
            employeeType: getEmployeeType(employeeName),
            position: getEmployeePosition(employeeName),
            paidHoliday: "",
            lastCutoffAdjust: "",
            lwop: "",
            lwp: "",
            rgot: "",
            rdot: "",
            isSummary: false
          });
        } else {
          // No record for this date - create empty record
          attendance.push({
            id: idCounter++,
            name: employeeName,
            date: date,
            day: getDayOfWeek(date),
            timeIn: "",
            timeOut: "",
            overtime: "",
            lateUndertime: "",
            remarks: "",
            employeeType: getEmployeeType(employeeName),
            position: getEmployeePosition(employeeName),
            paidHoliday: "",
            lastCutoffAdjust: "",
            lwop: "",
            lwp: "",
            rgot: "",
            rdot: "",
            isSummary: false
          });
        }
      }
    }
    
    // Recompute all records
    for (let i = 0; i < attendance.length; i++) {
      attendance[i] = recomputeRecord(attendance[i]);
      attendance[i].day = getDayOfWeek(attendance[i].date);
    }
    
    // Sort by name then date
    attendance.sort((a, b) => {
      if (a.name < b.name) return -1;
      if (a.name > b.name) return 1;
      return a.date.localeCompare(b.date);
    });
    
    console.log(`Generated ${attendance.length} records (${allEmployees.length} employees x ${allDaysInRange.length} days)`);
    
    return attendance;
    
  } catch (error) {
    console.error('Parse error:', error);
    throw error;
  }
}

// ============================================
// API FUNCTIONS (with saveData after each change)
// ============================================

const getAllFiles = (req, res) => {
  const files = Array.from(uploadedFiles.keys()).map(key => ({
    fileName: key,
    totalRecords: uploadedFiles.get(key).attendance.length,
    timestamp: uploadedFiles.get(key).timestamp
  }));
  res.json({ files });
};

const uploadAttendance = async (req, res) => {
  try {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ error: 'No file uploaded' });
    }
    
    const file = req.files[0];
    const fileName = file.originalname;
    
    if (uploadedFiles.has(fileName)) {
      return res.status(400).json({ error: `File "${fileName}" already exists.` });
    }
    
    const attendance = parseBiometricsFile(file.path, fileName);
    
    uploadedFiles.set(fileName, {
      attendance: attendance,
      fileName: fileName,
      timestamp: new Date().toISOString(),
      totalRecords: attendance.length,
      dateRemarks: {}
    });
    
    saveData();
    
    res.json({
      message: 'File processed successfully',
      fileName: fileName,
      totalRecords: attendance.length,
      attendance: attendance
    });
    
  } catch (error) {
    console.error('Upload error:', error);
    res.status(500).json({ error: 'Failed to process file', details: error.message });
  }
};

const getAttendanceByFile = (req, res) => {
  const { fileName } = req.params;
  const decodedFileName = decodeURIComponent(fileName);
  
  if (!uploadedFiles.has(decodedFileName)) {
    return res.status(404).json({ error: 'File not found' });
  }
  
  const fileData = uploadedFiles.get(decodedFileName);
  res.json({
    fileName: decodedFileName,
    attendance: fileData.attendance,
    totalRecords: fileData.totalRecords,
    timestamp: fileData.timestamp,
    dateRemarks: fileData.dateRemarks || {}
  });
};

const createRecord = (req, res) => {
  const { fileName } = req.params;
  const { 
    name, date, timeIn, timeOut, overtime, lateUndertime, remarks, employeeType,
    paidHoliday, lastCutoffAdjust, lwop, lwp, rgot, rdot
  } = req.body;
  const decodedFileName = decodeURIComponent(fileName);
  
  if (!uploadedFiles.has(decodedFileName)) {
    return res.status(404).json({ error: 'File not found' });
  }
  
  if (!name || !date) {
    return res.status(400).json({ error: 'Name and Date are required' });
  }
  
  const fileData = uploadedFiles.get(decodedFileName);
  const newId = fileData.attendance.length > 0 
    ? Math.max(...fileData.attendance.map(r => r.id)) + 1 
    : 1;
    
  let newRecord = {
    id: newId,
    name,
    date,
    day: getDayOfWeek(date),
    timeIn: timeIn || '',
    timeOut: timeOut || '',
    overtime: overtime || '',
    lateUndertime: lateUndertime || '',
    remarks: remarks || '',
    employeeType: employeeType || getEmployeeType(name),
    position: getEmployeePosition(name),
    paidHoliday: paidHoliday || '',
    lastCutoffAdjust: lastCutoffAdjust || '',
    lwop: lwop || '',
    lwp: lwp || '',
    rgot: rgot || '',
    rdot: rdot || '',
    isSummary: false
  };
  
  if (newRecord.timeIn || newRecord.timeOut) {
    newRecord = recomputeRecord(newRecord);
  }
  
  fileData.attendance.push(newRecord);
  fileData.totalRecords = fileData.attendance.length;
  uploadedFiles.set(decodedFileName, fileData);
  saveData();
  
  res.json({ message: 'Record created successfully', record: newRecord });
};

const updateRecord = (req, res) => {
  const { fileName, recordId } = req.params;
  const { 
    name, date, timeIn, timeOut, overtime, lateUndertime, remarks, employeeType,
    paidHoliday, lastCutoffAdjust, lwop, lwp, rgot, rdot
  } = req.body;
  const decodedFileName = decodeURIComponent(fileName);
  
  if (!uploadedFiles.has(decodedFileName)) {
    return res.status(404).json({ error: 'File not found' });
  }
  
  const fileData = uploadedFiles.get(decodedFileName);
  const index = fileData.attendance.findIndex(r => r.id == recordId);
  
  if (index === -1) {
    return res.status(404).json({ error: 'Record not found' });
  }
  
  let updatedRecord = {
    ...fileData.attendance[index],
    name: name || fileData.attendance[index].name,
    date: date || fileData.attendance[index].date,
    day: getDayOfWeek(date || fileData.attendance[index].date),
    timeIn: timeIn !== undefined ? timeIn : fileData.attendance[index].timeIn,
    timeOut: timeOut !== undefined ? timeOut : fileData.attendance[index].timeOut,
    overtime: overtime !== undefined ? overtime : fileData.attendance[index].overtime,
    lateUndertime: lateUndertime !== undefined ? lateUndertime : fileData.attendance[index].lateUndertime,
    remarks: remarks !== undefined ? remarks : fileData.attendance[index].remarks,
    employeeType: employeeType || fileData.attendance[index].employeeType,
    position: getEmployeePosition(name || fileData.attendance[index].name),
    paidHoliday: paidHoliday !== undefined ? paidHoliday : fileData.attendance[index].paidHoliday,
    lastCutoffAdjust: lastCutoffAdjust !== undefined ? lastCutoffAdjust : fileData.attendance[index].lastCutoffAdjust,
    lwop: lwop !== undefined ? lwop : fileData.attendance[index].lwop,
    lwp: lwp !== undefined ? lwp : fileData.attendance[index].lwp,
    rgot: rgot !== undefined ? rgot : fileData.attendance[index].rgot,
    rdot: rdot !== undefined ? rdot : fileData.attendance[index].rdot
  };
  
  const timeInChanged = timeIn !== undefined && timeIn !== fileData.attendance[index].timeIn;
  const timeOutChanged = timeOut !== undefined && timeOut !== fileData.attendance[index].timeOut;
  
  if (timeInChanged || timeOutChanged) {
    updatedRecord = recomputeRecord(updatedRecord);
    // preserve other fields as they may be overwritten by recomputeRecord
    updatedRecord.paidHoliday = paidHoliday !== undefined ? paidHoliday : fileData.attendance[index].paidHoliday;
    updatedRecord.lastCutoffAdjust = lastCutoffAdjust !== undefined ? lastCutoffAdjust : fileData.attendance[index].lastCutoffAdjust;
    updatedRecord.lwop = lwop !== undefined ? lwop : fileData.attendance[index].lwop;
    updatedRecord.lwp = lwp !== undefined ? lwp : fileData.attendance[index].lwp;
    updatedRecord.rgot = rgot !== undefined ? rgot : fileData.attendance[index].rgot;
    updatedRecord.rdot = rdot !== undefined ? rdot : fileData.attendance[index].rdot;
  }
  
  fileData.attendance[index] = updatedRecord;
  uploadedFiles.set(decodedFileName, fileData);
  saveData();
  
  res.json({ message: 'Record updated successfully', record: updatedRecord });
};

// ------- Date Remarks Handlers -------
// Set or update a remark for a specific date
const setDateRemark = (req, res) => {
  const { fileName } = req.params;
  const { date, remark } = req.body; // expect ISO date string
  const decodedFileName = decodeURIComponent(fileName);

  if (!uploadedFiles.has(decodedFileName)) {
    return res.status(404).json({ error: 'File not found' });
  }
  if (!date) {
    return res.status(400).json({ error: 'Date is required' });
  }

  const fileData = uploadedFiles.get(decodedFileName);
  if (!fileData.dateRemarks) fileData.dateRemarks = {};
  fileData.dateRemarks[date] = remark || '';
  uploadedFiles.set(decodedFileName, fileData);
  saveData();
  res.json({ message: 'Date remark saved', date, remark });
};

// Retrieve remark for a specific date
const getDateRemark = (req, res) => {
  const { fileName, date } = req.params;
  const decodedFileName = decodeURIComponent(fileName);

  if (!uploadedFiles.has(decodedFileName)) {
    return res.status(404).json({ error: 'File not found' });
  }
  const fileData = uploadedFiles.get(decodedFileName);
  const remark = (fileData.dateRemarks && fileData.dateRemarks[date]) || '';
  res.json({ date, remark });
};

const deleteRecord = (req, res) => {
  const { fileName, recordId } = req.params;
  const decodedFileName = decodeURIComponent(fileName);
  
  if (!uploadedFiles.has(decodedFileName)) {
    return res.status(404).json({ error: 'File not found' });
  }
  
  const fileData = uploadedFiles.get(decodedFileName);
  const newAttendance = fileData.attendance.filter(r => r.id != recordId);
  
  if (newAttendance.length === fileData.attendance.length) {
    return res.status(404).json({ error: 'Record not found' });
  }
  
  fileData.attendance = newAttendance;
  fileData.totalRecords = newAttendance.length;
  uploadedFiles.set(decodedFileName, fileData);
  saveData();
  
  res.json({ message: 'Record deleted successfully' });
};

const deleteFile = (req, res) => {
  const { fileName } = req.params;
  const decodedFileName = decodeURIComponent(fileName);
  
  if (!uploadedFiles.has(decodedFileName)) {
    return res.status(404).json({ error: 'File not found' });
  }
  
  uploadedFiles.delete(decodedFileName);
  saveData();
  
  res.json({ message: `File "${decodedFileName}" deleted successfully` });
};

const deleteAllFiles = (req, res) => {
  const count = uploadedFiles.size;
  uploadedFiles.clear();
  saveData();
  
  res.json({ message: 'All files deleted successfully', deletedCount: count });
};

module.exports = {
  getAllFiles,
  uploadAttendance,
  getAttendanceByFile,
  createRecord,
  updateRecord,
  deleteRecord,
  deleteFile,
  deleteAllFiles,
  setDateRemark,
  getDateRemark
};