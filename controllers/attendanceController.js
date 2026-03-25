// controllers/attendanceController.js
const XLSX = require('xlsx');
const db = require('../config/database');
const { getEmployeeType } = require('../config/employees');

// Helper function to get day of week
const getDayOfWeek = (dateStr) => {
  if (!dateStr) return '';
  const date = new Date(dateStr);
  const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  return days[date.getDay()];
};

// ============================================
// HELPER FUNCTIONS
// ============================================

function getSchedule(employeeType, date) {
  const dayOfWeek = date.getDay();
  if (employeeType === 'manager') {
    return { startTime: "08:00", endTime: "17:00", gracePeriod: 120 };
  }
  if (employeeType === 'office') {
    return { startTime: "08:00", endTime: "17:00", gracePeriod: 15 };
  }
  if (employeeType === 'warehouse') {
    if (dayOfWeek === 1) {
      return { startTime: "07:00", endTime: "18:00", gracePeriod: 0 };
    }
    return { startTime: "07:00", endTime: "17:30", gracePeriod: 0 };
  }
  return { startTime: "08:00", endTime: "17:00", gracePeriod: 15 };
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

function computeOvertime(timeOut, scheduleEnd, employeeType) {
  if (employeeType === 'manager') return 0;
  if (!timeOut) return 0;
  const endTime = parseTimeToDate(scheduleEnd, timeOut);
  if (timeOut > endTime) {
    const diffMinutes = Math.floor((timeOut - endTime) / 60000);
    if (diffMinutes > 30) return diffMinutes;
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
  const schedule = getSchedule(record.employeeType, dateObj);
  const dayOfWeek = dateObj.getDay();
  
  let timeInDate = null;
  let timeOutDate = null;
  let remarks = "";
  
  if (hasTimeIn) {
    timeInDate = parseTimeToFullDate(record.timeIn, record.date);
  }
  
  if (hasTimeOut) {
    timeOutDate = parseTimeToFullDate(record.timeOut, record.date);
  }
  
  if (dayOfWeek === 0) {
    remarks = "SUNDAY";
  } else if (dayOfWeek === 6) {
    remarks = "SATURDAY";
  }
  
  if (hasTimeIn && hasTimeOut && record.timeIn === record.timeOut) {
    remarks = "NO TIME-OUT";
    timeOutDate = null;
    record.timeOut = "";
  }
  
  if (hasTimeIn && !hasTimeOut) {
    remarks = "NO TIME-OUT";
    record.timeOut = "";
  }
  
  const skipComputation = remarks === "SATURDAY" || remarks === "SUNDAY" || remarks === "NO TIME-OUT";
  
  let late = 0;
  let overtime = 0;
  let undertime = 0;
  let overtimeType = "";
  
  if (timeInDate && !skipComputation) {
    late = computeLate(timeInDate, schedule.startTime, schedule.gracePeriod);
  }
  
  if (timeOutDate && !skipComputation) {
    const endTime = parseTimeToDate(schedule.endTime, timeOutDate);
    if (timeOutDate > endTime) {
      const diffMinutes = Math.floor((timeOutDate - endTime) / 60000);
      if (diffMinutes > 30) {
        overtime = diffMinutes;
        if (dayOfWeek === 0 || dayOfWeek === 6) {
          overtimeType = "RDOT";
        } else {
          overtimeType = "RGOT";
        }
      }
    }
    undertime = computeUndertime(timeOutDate, schedule.endTime);
  }
  
  let lateUndertime = "";
  if (late > 0) lateUndertime = `${late} mins`;
  else if (undertime > 0) lateUndertime = `${undertime} mins`;
  
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
  } else {
    record.overtime = overtime > 0 ? `${overtime} mins` : "";
    record.lateUndertime = lateUndertime;
    
    if (overtimeType === "RGOT") {
      record.rgot = overtimeHours;
      record.rdot = "";
    } else if (overtimeType === "RDOT") {
      record.rdot = overtimeHours;
      record.rgot = "";
    } else {
      if (!record.rgot) record.rgot = "";
      if (!record.rdot) record.rdot = "";
    }
  }
  
  record.remarks = remarks;
  
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
    
    // Sort by name then date - para magkakatabi ang same employee
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
// DATABASE FUNCTIONS
// ============================================

// Save attendance to database
const saveToDatabase = (fileName, attendance) => {
  return new Promise((resolve, reject) => {
    db.serialize(() => {
      // First, delete existing records for this file
      db.run(`DELETE FROM attendance WHERE file_name = ?`, [fileName], (err) => {
        if (err) {
          console.error('Error deleting old records:', err);
          reject(err);
        }
      });
      
      // Insert new records
      const stmt = db.prepare(`INSERT INTO attendance (
        file_name, employee_name, date, day, time_in, time_out, overtime, 
        late_undertime, remarks, employee_type, paid_holiday, last_cutoff_adjust,
        lwop, lwp, rgot, rdot, is_summary
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
      
      attendance.forEach(record => {
        stmt.run([
          fileName,
          record.name,
          record.date,
          record.day || getDayOfWeek(record.date),
          record.timeIn,
          record.timeOut,
          record.overtime,
          record.lateUndertime,
          record.remarks,
          record.employeeType,
          record.paidHoliday || '',
          record.lastCutoffAdjust || '',
          record.lwop || '',
          record.lwp || '',
          record.rgot || '',
          record.rdot || '',
          record.isSummary ? 1 : 0
        ], (err) => {
          if (err) console.error('Error inserting record:', err);
        });
      });
      
      stmt.finalize();
      resolve({ success: true, count: attendance.length });
    });
  });
};

// Load attendance from database (sorted by name then date)
const loadFromDatabase = (fileName) => {
  return new Promise((resolve, reject) => {
    db.all(`
      SELECT 
        id, 
        employee_name as name, 
        date, 
        day, 
        time_in as timeIn, 
        time_out as timeOut,
        overtime, 
        late_undertime as lateUndertime, 
        remarks, 
        employee_type as employeeType,
        paid_holiday as paidHoliday, 
        last_cutoff_adjust as lastCutoffAdjust,
        lwop, lwp, rgot, rdot, 
        is_summary as isSummary
      FROM attendance 
      WHERE file_name = ?
      ORDER BY employee_name ASC, date ASC
    `, [fileName], (err, rows) => {
      if (err) {
        reject(err);
      } else {
        resolve(rows);
      }
    });
  });
};

// Get all unique file names
const getAllFileNames = () => {
  return new Promise((resolve, reject) => {
    db.all(`
      SELECT DISTINCT file_name as fileName, COUNT(*) as totalRecords 
      FROM attendance 
      GROUP BY file_name 
      ORDER BY created_at DESC
    `, [], (err, rows) => {
      if (err) {
        reject(err);
      } else {
        resolve(rows);
      }
    });
  });
};

// Delete file from database
const deleteFileFromDB = (fileName) => {
  return new Promise((resolve, reject) => {
    db.run(`DELETE FROM attendance WHERE file_name = ?`, [fileName], function(err) {
      if (err) {
        reject(err);
      } else {
        resolve({ deletedCount: this.changes });
      }
    });
  });
};

// Delete all files from database
const deleteAllFilesFromDB = () => {
  return new Promise((resolve, reject) => {
    db.run(`DELETE FROM attendance`, function(err) {
      if (err) {
        reject(err);
      } else {
        resolve({ deletedCount: this.changes });
      }
    });
  });
};

// ============================================
// API FUNCTIONS (using Database)
// ============================================

const getAllFiles = async (req, res) => {
  try {
    const files = await getAllFileNames();
    res.json({ files });
  } catch (error) {
    console.error('Error getting files:', error);
    res.status(500).json({ error: 'Failed to get files' });
  }
};

const uploadAttendance = async (req, res) => {
  try {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ error: 'No file uploaded' });
    }
    
    const file = req.files[0];
    const fileName = file.originalname;
    
    // Check if file already exists
    const existingFiles = await getAllFileNames();
    if (existingFiles.some(f => f.fileName === fileName)) {
      return res.status(400).json({ error: `File "${fileName}" already exists.` });
    }
    
    const attendance = parseBiometricsFile(file.path);
    
    // Save to database
    await saveToDatabase(fileName, attendance);
    
    res.json({
      message: 'File processed and saved successfully',
      fileName: fileName,
      totalRecords: attendance.length,
      attendance: attendance
    });
    
  } catch (error) {
    console.error('Upload error:', error);
    res.status(500).json({ error: 'Failed to process file', details: error.message });
  }
};

const getAttendanceByFile = async (req, res) => {
  const { fileName } = req.params;
  const decodedFileName = decodeURIComponent(fileName);
  
  try {
    const attendance = await loadFromDatabase(decodedFileName);
    res.json({
      fileName: decodedFileName,
      attendance: attendance,
      totalRecords: attendance.length,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error loading attendance:', error);
    res.status(500).json({ error: 'Failed to load attendance' });
  }
};

const createRecord = async (req, res) => {
  const { fileName } = req.params;
  const { 
    name, date, timeIn, timeOut, overtime, lateUndertime, remarks, employeeType,
    paidHoliday, lastCutoffAdjust, lwop, lwp, rgot, rdot
  } = req.body;
  const decodedFileName = decodeURIComponent(fileName);
  
  if (!name || !date) {
    return res.status(400).json({ error: 'Name and Date are required' });
  }
  
  try {
    // Check if record already exists
    const existing = await new Promise((resolve) => {
      db.get(`
        SELECT * FROM attendance 
        WHERE file_name = ? AND employee_name = ? AND date = ?
      `, [decodedFileName, name, date], (err, row) => {
        resolve(row);
      });
    });
    
    if (existing) {
      return res.status(400).json({ error: 'Record already exists for this employee on this date' });
    }
    
    const day = getDayOfWeek(date);
    const employeeTypeFinal = employeeType || getEmployeeType(name);
    
    let newRecord = {
      name, date, day, timeIn, timeOut, overtime, lateUndertime, remarks,
      employeeType: employeeTypeFinal, paidHoliday, lastCutoffAdjust,
      lwop, lwp, rgot, rdot, isSummary: false
    };
    
    // Recompute if time data exists
    if (timeIn || timeOut) {
      const recomputed = recomputeRecord(newRecord);
      newRecord.timeIn = recomputed.timeIn;
      newRecord.timeOut = recomputed.timeOut;
      newRecord.overtime = recomputed.overtime;
      newRecord.lateUndertime = recomputed.lateUndertime;
      newRecord.remarks = recomputed.remarks;
      newRecord.rgot = recomputed.rgot;
      newRecord.rdot = recomputed.rdot;
    }
    
    // Insert new record
    await new Promise((resolve, reject) => {
      db.run(`
        INSERT INTO attendance (
          file_name, employee_name, date, day, time_in, time_out, overtime,
          late_undertime, remarks, employee_type, paid_holiday, last_cutoff_adjust,
          lwop, lwp, rgot, rdot, is_summary
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        decodedFileName, name, date, day, newRecord.timeIn, newRecord.timeOut,
        newRecord.overtime, newRecord.lateUndertime, newRecord.remarks, employeeTypeFinal,
        paidHoliday || '', lastCutoffAdjust || '', lwop || '', lwp || '',
        rgot || '', rdot || '', 0
      ], function(err) {
        if (err) reject(err);
        else resolve(this.lastID);
      });
    });
    
    // Load all records for this file (automatically sorted by name, date)
    const allRecords = await loadFromDatabase(decodedFileName);
    
    res.json({ 
      message: 'Record created successfully', 
      record: newRecord,
      attendance: allRecords,  // Return sorted records
      totalRecords: allRecords.length
    });
    
  } catch (error) {
    console.error('Create error:', error);
    res.status(500).json({ error: 'Failed to create record' });
  }
};

const updateRecord = async (req, res) => {
  const { fileName, recordId } = req.params;
  const { 
    name, date, timeIn, timeOut, overtime, lateUndertime, remarks, employeeType,
    paidHoliday, lastCutoffAdjust, lwop, lwp, rgot, rdot
  } = req.body;
  const decodedFileName = decodeURIComponent(fileName);
  
  try {
    // Get existing record
    const existing = await new Promise((resolve) => {
      db.get(`SELECT * FROM attendance WHERE id = ? AND file_name = ?`, [recordId, decodedFileName], (err, row) => {
        resolve(row);
      });
    });
    
    if (!existing) {
      return res.status(404).json({ error: 'Record not found' });
    }
    
    const day = getDayOfWeek(date || existing.date);
    const employeeTypeFinal = employeeType || getEmployeeType(name || existing.employee_name);
    
    let updatedRecord = {
      name: name || existing.employee_name,
      date: date || existing.date,
      day: day,
      timeIn: timeIn !== undefined ? timeIn : existing.time_in,
      timeOut: timeOut !== undefined ? timeOut : existing.time_out,
      overtime: overtime !== undefined ? overtime : existing.overtime,
      lateUndertime: lateUndertime !== undefined ? lateUndertime : existing.late_undertime,
      remarks: remarks !== undefined ? remarks : existing.remarks,
      employeeType: employeeTypeFinal,
      paidHoliday: paidHoliday !== undefined ? paidHoliday : existing.paid_holiday,
      lastCutoffAdjust: lastCutoffAdjust !== undefined ? lastCutoffAdjust : existing.last_cutoff_adjust,
      lwop: lwop !== undefined ? lwop : existing.lwop,
      lwp: lwp !== undefined ? lwp : existing.lwp,
      rgot: rgot !== undefined ? rgot : existing.rgot,
      rdot: rdot !== undefined ? rdot : existing.rdot
    };
    
    // Recompute if time changed
    const timeChanged = (timeIn !== undefined && timeIn !== existing.time_in) ||
                        (timeOut !== undefined && timeOut !== existing.time_out);
    
    if (timeChanged && (updatedRecord.timeIn || updatedRecord.timeOut)) {
      const recomputed = recomputeRecord(updatedRecord);
      updatedRecord.timeIn = recomputed.timeIn;
      updatedRecord.timeOut = recomputed.timeOut;
      updatedRecord.overtime = recomputed.overtime;
      updatedRecord.lateUndertime = recomputed.lateUndertime;
      updatedRecord.remarks = recomputed.remarks;
      updatedRecord.rgot = recomputed.rgot;
      updatedRecord.rdot = recomputed.rdot;
    }
    
    await new Promise((resolve, reject) => {
      db.run(`
        UPDATE attendance SET
          employee_name = ?, date = ?, day = ?, time_in = ?, time_out = ?,
          overtime = ?, late_undertime = ?, remarks = ?, employee_type = ?,
          paid_holiday = ?, last_cutoff_adjust = ?, lwop = ?, lwp = ?,
          rgot = ?, rdot = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `, [
        updatedRecord.name, updatedRecord.date, updatedRecord.day,
        updatedRecord.timeIn, updatedRecord.timeOut,
        updatedRecord.overtime, updatedRecord.lateUndertime, updatedRecord.remarks,
        updatedRecord.employeeType, updatedRecord.paidHoliday, updatedRecord.lastCutoffAdjust,
        updatedRecord.lwop, updatedRecord.lwp, updatedRecord.rgot, updatedRecord.rdot,
        recordId
      ], function(err) {
        if (err) reject(err);
        else resolve();
      });
    });
    
    res.json({ message: 'Record updated successfully', record: updatedRecord });
    
  } catch (error) {
    console.error('Update error:', error);
    res.status(500).json({ error: 'Failed to update record' });
  }
};

const deleteRecord = async (req, res) => {
  const { fileName, recordId } = req.params;
  const decodedFileName = decodeURIComponent(fileName);
  
  try {
    await new Promise((resolve, reject) => {
      db.run(`DELETE FROM attendance WHERE id = ? AND file_name = ?`, [recordId, decodedFileName], function(err) {
        if (err) reject(err);
        else resolve(this.changes);
      });
    });
    
    res.json({ message: 'Record deleted successfully' });
    
  } catch (error) {
    console.error('Delete error:', error);
    res.status(500).json({ error: 'Failed to delete record' });
  }
};

const deleteFile = async (req, res) => {
  const { fileName } = req.params;
  const decodedFileName = decodeURIComponent(fileName);
  
  try {
    await deleteFileFromDB(decodedFileName);
    res.json({ message: `File "${decodedFileName}" deleted successfully` });
  } catch (error) {
    console.error('Delete file error:', error);
    res.status(500).json({ error: 'Failed to delete file' });
  }
};

const deleteAllFiles = async (req, res) => {
  try {
    const result = await deleteAllFilesFromDB();
    res.json({ message: 'All files deleted successfully', deletedCount: result.deletedCount });
  } catch (error) {
    console.error('Delete all error:', error);
    res.status(500).json({ error: 'Failed to delete files' });
  }
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