const record = {
  name: "Borromeo, Felicisimo",
  date: "2026-03-23",
  timeIn: "6:56:00 AM",
  timeOut: "4:12:00 PM"
};

const recomputed = recomputeRecord(record);
console.log("Late/Undertime:", recomputed.lateUndertime);
console.log("Overtime:", recomputed.overtime);
console.log("Remarks:", recomputed.remarks);