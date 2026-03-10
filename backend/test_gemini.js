// Test just the Gemini API call to see why it's failing
require('dotenv').config();
const { GoogleGenerativeAI } = require('@google/generative-ai');

async function testGemini() {
    console.log('=== Testing Gemini API ===');
    console.log('API Key:', process.env.GEMINI_API_KEY ? `${process.env.GEMINI_API_KEY.slice(0, 10)}...` : 'MISSING');

    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

    // Try with gemini-2.0-flash-exp
    console.log('\nTrying model: gemini-2.0-flash-exp');
    try {
        const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash-exp' });
        const result = await model.generateContent({
            contents: [{ role: 'user', parts: [{ text: 'Say hello in JSON: {"message": "hello"}' }] }],
            generationConfig: { responseMimeType: 'application/json' }
        });
        console.log('SUCCESS:', result.response.text());
    } catch (error) {
        console.log('ERROR:', error.message);
    }

    // Try with gemini-1.5-flash
    console.log('\nTrying model: gemini-1.5-flash');
    try {
        const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });
        const result = await model.generateContent({
            contents: [{ role: 'user', parts: [{ text: 'Say hello in JSON: {"message": "hello"}' }] }],
            generationConfig: { responseMimeType: 'application/json' }
        });
        console.log('SUCCESS:', result.response.text());
    } catch (error) {
        console.log('ERROR:', error.message);
    }
}

testGemini();
