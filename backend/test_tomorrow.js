require('dotenv').config();
const { fetchTomorrow } = require('./services/detectionService');
const fs = require('fs');
const logFile = 'tomorrow_test_output.txt';

function log(msg) {
    console.log(msg);
    fs.appendFileSync(logFile, msg + '\n');
}

async function testTomorrow() {
    fs.writeFileSync(logFile, '');
    log('--- STARTING TOMORROW.IO TEST (FIXED) ---');

    try {
        const tm = await fetchTomorrow('Lebanon');
        log(`Success: ${tm.success}`);

        if (!tm.success) {
            log(`ERROR: ${tm.error}`);
        } else {
            log(`Count: ${tm.count}`);
            log(`Raw Data: ${tm.raw ? 'Yes' : 'No'}`);
            if (tm.data && tm.data.length > 0) {
                const sample = tm.data[0];
                log(`Sample Payload: ${JSON.stringify(sample)}`);
            }
        }
    } catch (e) {
        log(`EXCEPTION: ${e.message}`);
    }
    log('--- TEST COMPLETED ---');
}

testTomorrow();
