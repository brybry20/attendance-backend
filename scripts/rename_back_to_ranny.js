const fs = require('fs');
const path = require('path');

const DATA_FILE = path.join(__dirname, '../data/attendance.json');

if (!fs.existsSync(DATA_FILE)) {
    console.log('No attendance.json found.');
    process.exit(0);
}

try {
    const data = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
    let updatedCount = 0;

    Object.keys(data).forEach(fileName => {
        const fileData = data[fileName];
        if (fileData.attendance && Array.isArray(fileData.attendance)) {
            fileData.attendance.forEach(record => {
                if (record.name === "Borromeo, Ramel") {
                    record.name = "Borromeo, Ranny";
                    updatedCount++;
                }
            });
        }
    });

    if (updatedCount > 0) {
        fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
        console.log(`Successfully renamed ${updatedCount} records back to Borromeo, Ranny.`);
    } else {
        console.log('No records found for Borromeo, Ramel.');
    }

} catch (error) {
    console.error('Error during processing:', error);
    process.exit(1);
}
