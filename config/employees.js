// config/employees.js

// ============================================
// EMPLOYEE CLASSIFICATION
// ============================================

// MANAGERS (2 hours grace period, NO OT)
const MANAGERS = [
  "Evangelista, Leah",
  "Magallanes, Francis",
  "Rios, Leordielle",
  "Ballena, Geraldo",
  "Macrohon, Patrixia",
  "Vargas, Mario II"
];

// SUPERVISORS (NO OT, custom schedules)
const SUPERVISORS = {
  warehouse: ["Canatoy, Michael John"],
  accounting: ["Guerra, Madellyne"],
  hr: ["Ceniza, Evangeline G."],
  sales_admin: ["Tolentino, Sarabelle"]
};

// OFFICE / SALES / FINANCE (15 mins grace, 8AM-5PM, HAS OT)
const OFFICE_EMPLOYEES = [
  "Labado, Ronel",
  "Leano, Mark Ading",
  "Bonete, Jea Angela",
  "Borromeo, Felicisimo",
  "Diocena, Arvin Jay",
  "Rogacion, Maria Benigna",
  "Figueroa, Mariella Izon",
  "Manez, Ana Linea"
];

// WAREHOUSE / LOGISTICS (no grace, HAS OT)
const WAREHOUSE_EMPLOYEES = [
  "Atam, Sarze",
  "Balagat, Mac James",
  "Ballena, Junicio",
  "Garcia, Rey",
  "Genova, Ramel",
  "Hilario, Reynold",
  "Interino, Nicky Boy",
  "Lozada, Ryan",
  "Marcos, Gladys Joy",
  "Moraleda, Samuel",
  "Navida, Donald",
  "Tatel, Alexander",
  "Temones, Kennett",
  "Magdaong, Joemer"
];

// All supervisors combined for easy checking
const ALL_SUPERVISORS = [
  ...SUPERVISORS.warehouse,
  ...SUPERVISORS.accounting,
  ...SUPERVISORS.hr,
  ...SUPERVISORS.sales_admin
];

// ============================================
// EMPLOYEE FUNCTIONS
// ============================================

// Function to get employee position/title
function getEmployeePosition(name) {
  const cleanName = name.trim();
  
  if (MANAGERS.some(m => cleanName.includes(m))) {
    return "Manager";
  }
  
  if (SUPERVISORS.warehouse.some(w => cleanName.includes(w))) {
    return "Warehouse Supervisor";
  }
  
  if (SUPERVISORS.accounting.some(a => cleanName.includes(a))) {
    return "Accounting Supervisor";
  }
  
  if (SUPERVISORS.hr.some(h => cleanName.includes(h))) {
    return "HR & Admin Officer";
  }
  
  if (SUPERVISORS.sales_admin.some(s => cleanName.includes(s))) {
    return "Sales Admin Supervisor";
  }
  
  if (OFFICE_EMPLOYEES.some(o => cleanName.includes(o))) {
    return "Office Staff";
  }
  
  if (WAREHOUSE_EMPLOYEES.some(w => cleanName.includes(w))) {
    return "Warehouse Staff";
  }
  
  return "Employee";
}

// Function to get employee type (manager, supervisor, office, warehouse)
function getEmployeeType(name) {
  const cleanName = name.trim();
  
  // Managers
  if (MANAGERS.some(m => cleanName.includes(m))) return 'manager';
  
  // Supervisors
  if (ALL_SUPERVISORS.some(s => cleanName.includes(s))) return 'supervisor';
  
  // Office employees
  if (OFFICE_EMPLOYEES.some(o => cleanName.includes(o))) return 'office';
  
  // Warehouse employees
  if (WAREHOUSE_EMPLOYEES.some(w => cleanName.includes(w))) return 'warehouse';
  
  return 'office';
}

// Function to check if employee has OT
function hasOT(name) {
  const cleanName = name.trim();
  
  // Managers have NO OT
  if (MANAGERS.some(m => cleanName.includes(m))) return false;
  
  // Supervisors have NO OT
  if (ALL_SUPERVISORS.some(s => cleanName.includes(s))) return false;
  
  // Everyone else has OT
  return true;
}

// Function to get schedule for a specific employee and date
function getScheduleForEmployee(name, date) {
  const cleanName = name.trim();
  const dayOfWeek = date.getDay(); // 0=Sunday, 1=Monday, 2=Tuesday...
  
  // Check for MANAGERS
  if (MANAGERS.some(m => cleanName.includes(m))) {
    return { startTime: "08:00", endTime: "17:00", gracePeriod: 120, hasOT: false, position: "Manager" };
  }
  
  // Check for WAREHOUSE SUPERVISOR (Canatoy)
  if (SUPERVISORS.warehouse.some(w => cleanName.includes(w))) {
    if (dayOfWeek === 1) { // Monday
      return { startTime: "07:00", endTime: "18:00", gracePeriod: 0, hasOT: false, position: "Warehouse Supervisor" };
    } else if (dayOfWeek >= 2 && dayOfWeek <= 5) { // Tue-Fri
      return { startTime: "07:00", endTime: "17:30", gracePeriod: 0, hasOT: false, position: "Warehouse Supervisor" };
    } else { // Weekend
      return { startTime: "07:00", endTime: "17:30", gracePeriod: 0, hasOT: false, position: "Warehouse Supervisor", isRestDay: true };
    }
  }
  
  // Check for ACCOUNTING SUPERVISOR (Guerra)
  if (SUPERVISORS.accounting.some(a => cleanName.includes(a))) {
    return { startTime: "08:00", endTime: "17:00", gracePeriod: 15, hasOT: false, position: "Accounting Supervisor" };
  }
  
  // Check for HR SUPERVISOR (Ceniza)
  if (SUPERVISORS.hr.some(h => cleanName.includes(h))) {
    return { startTime: "09:00", endTime: "18:00", gracePeriod: 15, hasOT: false, position: "HR & Admin Officer" };
  }
  
  // Check for SALES ADMIN SUPERVISOR (Tolentino)
  if (SUPERVISORS.sales_admin.some(s => cleanName.includes(s))) {
    return { startTime: "08:00", endTime: "17:00", gracePeriod: 15, hasOT: false, position: "Sales Admin Supervisor" };
  }
  
  // OFFICE employees (has OT)
  if (OFFICE_EMPLOYEES.some(o => cleanName.includes(o))) {
    return { startTime: "08:00", endTime: "17:00", gracePeriod: 15, hasOT: true, position: "Office Staff" };
  }
  
  // WAREHOUSE employees (has OT)
  if (WAREHOUSE_EMPLOYEES.some(w => cleanName.includes(w))) {
    if (dayOfWeek === 1) { // Monday
      return { startTime: "07:00", endTime: "18:00", gracePeriod: 0, hasOT: true, position: "Warehouse Staff" };
    } else if (dayOfWeek >= 2 && dayOfWeek <= 5) { // Tue-Fri
      return { startTime: "07:00", endTime: "17:30", gracePeriod: 0, hasOT: true, position: "Warehouse Staff" };
    }
  }
  
  // Default
  return { startTime: "08:00", endTime: "17:00", gracePeriod: 15, hasOT: true, position: "Employee" };
}

module.exports = {
  MANAGERS,
  SUPERVISORS,
  ALL_SUPERVISORS,
  OFFICE_EMPLOYEES,
  WAREHOUSE_EMPLOYEES,
  getEmployeeType,
  getEmployeePosition,
  hasOT,
  getScheduleForEmployee
};