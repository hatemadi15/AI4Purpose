require('dotenv').config();
const { performDeepVerification } = require('./services/verificationService');
const Alert = require('./models/Alert');

async function testRealVerification() {
    let alertId = null;
    try {
        console.log('🧪 Testing REAL Multi-Source Verification...\n');

        // Create test alert (earthquake in a known seismic zone)
        const alert = await Alert.create({
            event_type: 'Earthquake',
            lat: 34.0522,
            lon: -118.2437,
            affected_radius_km: 50,
            region: 'Los Angeles, California',
            severity: 'HIGH',
            status: 'PENDING_REVIEW'
        });
        alertId = alert.id;
        console.log(`✅ Created test alert: ${alertId} (Earthquake in LA)\n`);

        // Mock Socket.IO
        const mockIo = {
            emit: (event, data) => console.log(`📡 [${event}] ${data.step || JSON.stringify(data)}`)
        };

        // Run verification
        console.log('🔍 Starting deep verification...\n');
        const result = await performDeepVerification(alertId, mockIo);

        // Show results
        console.log('\n========== RESULTS ==========');
        console.log('Score:', result.score);
        console.log('Status:', result.verification_status);
        console.log('Twitter count:', result.data.twitter_summary?.count);
        console.log('News count:', result.data.news_summary?.count);
        console.log('Scientific weather:', result.data.scientific_verification?.weather?.confirmed);
        console.log('Scientific seismic:', result.data.scientific_verification?.seismic?.confirmed);
        console.log('Perplexity confirmed:', result.data.perplexity?.independent_confirmation_found);
        console.log('Gemini credibility:', result.data.gemini?.overall_credibility);
        console.log('==============================\n');

        console.log('🎉 TEST COMPLETE');

    } catch (error) {
        console.error('❌ TEST FAILED:', error);
    } finally {
        if (alertId) {
            await Alert.destroy({ where: { id: alertId } });
            console.log('🧹 Cleanup complete');
        }
        process.exit(0);
    }
}

testRealVerification();
