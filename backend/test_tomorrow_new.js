const axios = require('axios');
const fs = require('fs');
const logFile = 'tomorrow_test_output.txt';

function log(msg) {
    console.log(msg);
    fs.appendFileSync(logFile, msg + '\n');
}

async function testTomorrowNew() {
    fs.writeFileSync(logFile, '');
    log('--- STARTING TOMORROW.IO TEST (UA SPOOF) ---');

    const apiKey = 'EMzZCdeSI8H4UcvxKTybjw5kqr1oUEj2';
    const url = `https://api.tomorrow.io/v4/weather/forecast?location=42.3478,-71.0466&apikey=${apiKey}`;

    try {
        log(`Testing URL: ${url}`);
        const response = await axios.get(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
                'Accept': 'application/json'
            },
            timeout: 10000
        });

        log(`Success: true`);
        log(`Status: ${response.status}`); // Should be 200

        if (response.data) {
            const data = response.data;
            if (data.timelines) {
                log('Structure: has "timelines"');
                // Log first timeline minutely data point to confirm structure
                if (data.timelines.minutely && data.timelines.minutely.length > 0) {
                    log(`Minutely sample: ${JSON.stringify(data.timelines.minutely[0])}`);
                }
            } else {
                log(`Structure: ${JSON.stringify(data).substring(0, 200)}`);
            }
        }

    } catch (e) {
        log(`EXCEPTION: ${e.message}`);
        if (e.response) {
            log(`Status: ${e.response.status}`);
            log(`Data Type: ${typeof e.response.data}`);
            if (typeof e.response.data === 'string' && e.response.data.includes('Cloudflare')) {
                log('Blocked by Cloudflare');
            } else {
                log(`Data: ${JSON.stringify(e.response.data).substring(0, 200)}`);
            }
        }
    }
    log('--- TEST COMPLETED ---');
}

testTomorrowNew();
