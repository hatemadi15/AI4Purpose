require('dotenv').config();
const { performDeepVerification } = require('./services/verificationService');
const Alert = require('./models/Alert');

async function strictTest() {
    let alertId = null;
    try {
        console.log('🧪 Starting Strict Verification Test...');

        // 1. Create Dummy Alert
        const alert = await Alert.create({
            event_type: 'Test Event',
            lat: 33.0,
            lon: 35.0,
            affected_radius_km: 10,
            region: 'Test Region',
            severity: 'MEDIUM',
            status: 'PENDING_REVIEW'
        });
        alertId = alert.id;
        console.log(`✅ Created test alert: ${alertId}`);

        // 2. Mock Socket.IO
        let emittedEvent = null;
        let emittedData = null;
        const mockIo = {
            emit: (event, data) => {
                if (event === 'verification_complete') {
                    emittedEvent = event;
                    emittedData = data;
                }
            }
        };

        // 3. Run Verification
        console.log('🔍 Running verification...');
        const result = await performDeepVerification(alertId, mockIo);

        // 4. Assertions
        console.log('📊 Checking results...');

        // Check Function Return
        if (!result.verification_status) {
            throw new Error(`❌ Function returned wrong key! Expected 'verification_status', got: ${Object.keys(result).join(', ')}`);
        }
        console.log('   ✅ Function return has verification_status');

        // Check Socket Event
        if (!emittedEvent) {
            throw new Error('❌ Socket event verification_complete was never emitted');
        }
        if (!emittedData.verification_status) {
            throw new Error(`❌ Socket Payload returned wrong key! Expected 'verification_status', got: ${Object.keys(emittedData).join(', ')}`);
        }
        if (emittedData.status) {
            console.warn('   ⚠️ Warning: Socket payload still contains "status". This might overwrite main alert status if merged!');
            // We generally don't want 'status' in here if it conflicts, but let's just make sure verification_status is there.
        }
        console.log('   ✅ Socket payload has verification_status');

        console.log('🎉 TEST PASSED: The fix is verified.');

    } catch (error) {
        console.error('❌ TEST FAILED:', error.message);
        process.exit(1);
    } finally {
        if (alertId) {
            await Alert.destroy({ where: { id: alertId } });
            console.log('🧹 Cleanup complete');
        }
        process.exit(0);
    }
}

strictTest();
