require('dotenv').config();
const { fetchTomorrow } = require('./services/detectionService');
const fs = require('fs');
const logFile = 'tomorrow_integration_test.txt';

function log(msg) {
    console.log(msg);
    fs.appendFileSync(logFile, msg + '\n');
}

async function testTomorrowIntegration() {
    fs.writeFileSync(logFile, '');
    log('--- STARTING TOMORROW.IO INTEGRATION TEST ---');

    try {
        const result = await fetchTomorrow('Lebanon');

        log(`Success: ${result.success}`);
        if (!result.success) {
            log(`ERROR: ${result.error}`);
        } else {
            log(`Count/Found: ${result.count}`);
            log(`Raw Data Present: ${result.raw ? 'Yes' : 'No'}`);
            if (result.data && result.data.length > 0) {
                const finding = result.data[0];
                log(`Finding Type: ${finding.type}`);
                log(`Description: ${finding.description}`);
                log(`Severity: ${finding.severity}`);
            }
        }

    } catch (e) {
        log(`EXCEPTION: ${e.message}`);
    }
    log('--- TEST COMPLETED ---');
}

testTomorrowIntegration();
