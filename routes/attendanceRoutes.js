// routes/attendanceRoutes.js
const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const {
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
} = require('../controllers/attendanceController');

const router = express.Router();

const uploadDir = path.join(__dirname, '../uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir);
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    cb(null, Date.now() + '-' + file.originalname);
  }
});

const upload = multer({ storage: storage });

// Test endpoint
router.get('/test', (req, res) => {
  const { MANAGERS, OFFICE_EMPLOYEES, WAREHOUSE_EMPLOYEES } = require('../config/employees');
  res.json({ 
    message: 'Backend is working!', 
    employees: {
      managers: MANAGERS.length,
      office: OFFICE_EMPLOYEES.length,
      warehouse: WAREHOUSE_EMPLOYEES.length,
      total: MANAGERS.length + OFFICE_EMPLOYEES.length + WAREHOUSE_EMPLOYEES.length
    }
  });
});

// File/Tab Management
router.get('/files', getAllFiles);
router.post('/upload', upload.any(), uploadAttendance);
router.get('/files/:fileName', getAttendanceByFile);
router.delete('/files/:fileName', deleteFile);
router.post('/files/:fileName(*)/date-remark', setDateRemark);
router.get('/files/:fileName(*)/date-remark/:date', getDateRemark);

// Record CRUD per file
router.post('/files/:fileName/records', createRecord);
router.put('/files/:fileName/records/:recordId', updateRecord);
router.delete('/files/:fileName/records/:recordId', deleteRecord);

module.exports = router;