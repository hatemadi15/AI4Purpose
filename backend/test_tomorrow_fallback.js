require('dotenv').config();
const { fetchTomorrow } = require('./services/detectionService');
const fs = require('fs');
const logFile = 'tomorrow_fallback_test.txt';

function log(msg) {
    console.log(msg);
    fs.appendFileSync(logFile, msg + '\n');
}

async function testTomorrowFallback() {
    fs.writeFileSync(logFile, '');
    log('--- STARTING TOMORROW.IO FALLBACK TEST ---');

    // This should trigger the catch block due to 403 (Cloudflare) on this machine
    // We expect "success: true" now with "demo: true"
    try {
        const result = await fetchTomorrow('Lebanon');

        log(`Success: ${result.success}`);
        log(`Is Demo: ${result.demo}`);
        log(`Count: ${result.count}`);

        if (result.data && result.data.length > 0) {
            const finding = result.data[0];
            log(`First Finding: ${finding.type} - ${finding.description}`);
        }

    } catch (e) {
        log(`EXCEPTION (Should be caught internally): ${e.message}`);
    }
    log('--- TEST COMPLETED ---');
}

testTomorrowFallback();
