// config/database.js
const sqlite3 = require('sqlite3').verbose();
const path = require('path');

// Use /tmp for SQLite on Render (disk is ephemeral but works)
const dbPath = path.join(process.env.RENDER ? '/tmp' : __dirname, '../attendance.db');
const db = new sqlite3.Database(dbPath);

console.log(`Database path: ${dbPath}`);

db.serialize(() => {
  db.run(`DROP TABLE IF EXISTS attendance`);
  
  db.run(`CREATE TABLE IF NOT EXISTS employees (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT UNIQUE,
    employee_type TEXT,
    position TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);
  
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
  )`);
  
  db.run(`CREATE INDEX IF NOT EXISTS idx_attendance_file_name ON attendance(file_name, employee_name, date)`);
  
  console.log('Database initialized');
});

module.exports = db;