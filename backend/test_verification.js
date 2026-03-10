// Direct test of verification flow
require('dotenv').config();
const { performDeepVerification } = require('./services/verificationService');

async function testVerification() {
    console.log('=== Starting Direct Verification Test ===');

    // Test with alert ID 22 (or any valid alert)
    const testAlertId = 22;

    try {
        console.log(`Testing verification for alert ${testAlertId}...`);
        const result = await performDeepVerification(testAlertId, null);
        console.log('\n=== RESULT ===');
        console.log('Score:', result?.verification_score);
        console.log('Status:', result?.verification_status);
        console.log('Twitter count:', result?.verification_data?.twitter_summary?.count);
        console.log('News count:', result?.verification_data?.news_summary?.count);
        console.log('Corroboration:', result?.verification_data?.corroboration);
    } catch (error) {
        console.error('ERROR:', error.message);
        console.error('Stack:', error.stack);
    }

    process.exit(0);
}

testVerification();
