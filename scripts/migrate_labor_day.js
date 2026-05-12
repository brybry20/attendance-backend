const fs = require('fs');
const path = require('path');

const DATA_FILE = path.join(__dirname, '../data/attendance.json');

if (!fs.existsSync(DATA_FILE)) {
    console.log('No attendance.json found. Skipping migration.');
    process.exit(0);
}

try {
    const data = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
    let updatedCount = 0;

    // The data is a Map of file names to their attendance data
    Object.keys(data).forEach(fileName => {
        const fileData = data[fileName];
        if (fileData.attendance && Array.isArray(fileData.attendance)) {
            fileData.attendance.forEach(record => {
                const dateObj = new Date(record.date);
                if (dateObj.getMonth() === 4 && dateObj.getDate() === 1) {
                    record.remarks = "Labor day";
                    updatedCount++;
                }
            });
        }
    });

    if (updatedCount > 0) {
        fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
        console.log(`Successfully updated ${updatedCount} records to "Labor day".`);
    } else {
        console.log('No records found for May 1st.');
    }

} catch (error) {
    console.error('Error during migration:', error);
    process.exit(1);
}
