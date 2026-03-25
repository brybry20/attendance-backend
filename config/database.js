// config/database.js
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

// Determine database path - use /tmp on Render, local folder otherwise
let dbPath;
if (process.env.RENDER) {
  // On Render, use /tmp directory (writable)
  dbPath = path.join('/tmp', 'attendance.db');
} else {
  // Locally, use the data folder
  const dataDir = path.join(__dirname, '../data');
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }
  dbPath = path.join(dataDir, 'attendance.db');
}

console.log(`Database path: ${dbPath}`);

const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('Error opening database:', err.message);
  } else {
    console.log('Database connected successfully');
  }
});

// Create tables if not exists
db.serialize(() => {
  // Drop old attendance table to recreate with new schema
  db.run(`DROP TABLE IF EXISTS attendance`, (err) => {
    if (err && err.message !== 'SQLITE_ERROR: no such table: attendance') {
      console.error('Error dropping table:', err);
    }
  });
  
  // Employees table
  db.run(`CREATE TABLE IF NOT EXISTS employees (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT UNIQUE,
    employee_type TEXT,
    position TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);
  
  // Attendance table with file_name column
  db.run(`CREATE TABLE IF NOT EXISTS attendance (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    file_name TEXT NOT NULL,
    employee_name TEXT NOT NULL,
    date TEXT NOT NULL,
    day TEXT,
    time_in TEXT,
    time_out TEXT,
    overtime TEXT,
    late_undertime TEXT,
    remarks TEXT,
    employee_type TEXT,
    paid_holiday TEXT,
    last_cutoff_adjust TEXT,
    lwop TEXT,
    lwp TEXT,
    rgot TEXT,
    rdot TEXT,
    is_summary INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(file_name, employee_name, date)
  )`, (err) => {
    if (err) console.error('Error creating attendance table:', err.message);
  });
  
  // Create index for faster sorting
  db.run(`CREATE INDEX IF NOT EXISTS idx_attendance_file_name ON attendance(file_name, employee_name, date)`, (err) => {
    if (err) console.error('Error creating index:', err.message);
  });
  
  console.log('Database initialized');
});

module.exports = db;