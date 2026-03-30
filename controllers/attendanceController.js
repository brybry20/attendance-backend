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
  
  if (!hasTimeIn && !hasTimeOut) {
    return record;
  }
  
  const dateObj = new Date(record.date);
  const schedule = getSchedule(record.employeeType, dateObj, record.name);
  const dayOfWeek = dateObj.getDay();
  const isRestDay = dayOfWeek === 0 || dayOfWeek === 6; // Saturday or Sunday
  
  let timeInDate = null;
  let timeOutDate = null;
  let remarks = "";
  
  if (hasTimeIn) {
    timeInDate = parseTimeToFullDate(record.timeIn, record.date);
  }
  
  if (hasTimeOut) {
    timeOutDate = parseTimeToFullDate(record.timeOut, record.date);
  }
  
  // Check if missing time-out
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
    if (dayOfWeek === 0) remarks = "SUNDAY";
    else if (dayOfWeek === 6) remarks = "SATURDAY";
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
      record.remarks = remarks;
    }
  }
  
  return record;
}
// ============================================
// PARSE BIOMETRICS FILE
// ============================================

function parseBiometricsFile(filePath) {
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
    
    const attendance = [];
    let idCounter = 1;
    
    for (let i = startRow; i < rows.length; i++) {
      const row = rows[i];
      if (!row || row.length < 4) continue;
      
      const name = row[1];
      const dateTimeStr = row[3];
      
      if (!name || name === "" || name === "Name") continue;
      if (!dateTimeStr || dateTimeStr === "") continue;
      
      const dateTime = parseDateTime(dateTimeStr);
      if (!dateTime) continue;
      
      const date = formatDate(dateTime);
      const time = formatTime(dateTime);
      
      const existingIndex = attendance.findIndex(a => a.name === name && a.date === date);
      
      if (existingIndex === -1) {
        attendance.push({
          id: idCounter++,
          name: name,
          date: date,
          day: getDayOfWeek(date),
          timeIn: time,
          timeOut: time,
          overtime: "",
          lateUndertime: "",
          remarks: "",
          employeeType: getEmployeeType(name),
          position: getEmployeePosition(name),
          paidHoliday: "",
          lastCutoffAdjust: "",
          lwop: "",
          lwp: "",
          rgot: "",
          rdot: "",
          isSummary: false
        });
      } else {
        const existing = attendance[existingIndex];
        const existingTime = parseTimeString(existing.timeOut);
        const newTime = parseTimeString(time);
        
        if (newTime > existingTime) existing.timeOut = time;
        if (parseTimeString(time) < parseTimeString(existing.timeIn)) existing.timeIn = time;
      }
    }
    
    for (let i = 0; i < attendance.length; i++) {
      attendance[i] = recomputeRecord(attendance[i]);
      attendance[i].day = getDayOfWeek(attendance[i].date);
    }
    
    attendance.sort((a, b) => {
      if (a.name < b.name) return -1;
      if (a.name > b.name) return 1;
      return a.date.localeCompare(b.date);
    });
    
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
    
    const attendance = parseBiometricsFile(file.path);
    
    uploadedFiles.set(fileName, {
      attendance: attendance,
      fileName: fileName,
      timestamp: new Date().toISOString(),
      totalRecords: attendance.length
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
    timestamp: fileData.timestamp
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
    updatedRecord.paidHoliday = paidHoliday !== undefined ? paidHoliday : fileData.attendance[index].paidHoliday;
    updatedRecord.lastCutoffAdjust = lastCutoffAdjust !== undefined ? lastCutoffAdjust : fileData.attendance[index].lastCutoffAdjust;
    updatedRecord.lwop = lwop !== undefined ? lwop : fileData.attendance[index].lwop;
    updatedRecord.lwp = lwp !== undefined ? lwp : fileData.attendance[index].lwp;
  }
  
  fileData.attendance[index] = updatedRecord;
  uploadedFiles.set(decodedFileName, fileData);
  saveData();
  
  res.json({ message: 'Record updated successfully', record: updatedRecord });
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
  deleteAllFiles
};