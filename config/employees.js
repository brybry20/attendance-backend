// config/employees.js

// Manager (2 hours grace period)
const MANAGERS = [
  "Evangelista, Leah"
];

// Office / Sales / Finance (15 mins grace, 8AM-5PM)
const OFFICE_EMPLOYEES = [
  "Ceniza, Evangeline G.",
  "Labado, Ronel",
  "Leano, Mark Ading",
  "Rios, Leordielle",
  "Guerra, Madellyne",
  "Bonete, Jea Angela",
  "Borromeo, Felicisimo",
  "Magallanes, Francis",
  "Vargas, Mario II",
  "Macrohon, Patrixia",
  "Tolentino, Sarabelle",
  "Diocena, Arvin Jay",
  "Rogacion, Maria Benigna",
  "Figueroa, Mariella Izon",
  "Manez, Ana Linea"
];

// Warehouse / Logistics (no grace)
const WAREHOUSE_EMPLOYEES = [
  "Atam, Sarze",
  "Balagat, Mac James",
  "Ballena, Geraldo",
  "Ballena, Junicio",
  "Canatoy, Michael John",
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

function getEmployeeType(name) {
  const cleanName = name.trim();
  if (MANAGERS.some(m => cleanName.includes(m))) return 'manager';
  if (OFFICE_EMPLOYEES.some(o => cleanName.includes(o))) return 'office';
  if (WAREHOUSE_EMPLOYEES.some(w => cleanName.includes(w))) return 'warehouse';
  return 'office';
}

module.exports = {
  MANAGERS,
  OFFICE_EMPLOYEES,
  WAREHOUSE_EMPLOYEES,
  getEmployeeType
};