const { GoogleGenerativeAI } = require('@google/generative-ai');
require('dotenv').config();

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

const LANGUAGES = ['Arabic', 'English', 'Turkish', 'Italian', 'Hebrew'];
const LANGUAGE_CODES = ['ar', 'en', 'tr', 'it', 'he'];

async function generatePostVerificationTemplates({ alert, eventDetails, verificationData, verificationStatus, verificationScore }) {
    try {
        const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });

        const keyFacts = [];
        if (verificationData?.perplexity?.summary) {
            keyFacts.push(`Web: ${verificationData.perplexity.summary}`);
        }
        if (verificationData?.scientific_verification?.seismic?.confirmed) {
            const s = verificationData.scientific_verification.seismic;
            keyFacts.push(`Seismic: M${s.magnitude} at ${s.place}`);
        }
        if (verificationData?.scientific_verification?.weather?.confirmed) {
            const w = verificationData.scientific_verification.weather;
            keyFacts.push(`Weather: ${w.description} ${w.temperature}C`);
        }
        if (verificationData?.news_summary?.sources?.length) {
            keyFacts.push(`News: ${verificationData.news_summary.sources[0].title}`);
        }
        if (verificationData?.twitter_summary?.count) {
            keyFacts.push(`Social: ${verificationData.twitter_summary.count} relevant tweets`);
        }

        const prompt = `You are generating emergency alert message templates for MedAlert AFTER verification.
Use ONLY the verified facts provided. Avoid speculation. Keep messages clear and actionable.

EVENT DETAILS:
Type: ${alert.event_type}
Region: ${alert.region}
Coordinates: ${eventDetails?.lat}, ${eventDetails?.lon}
Severity: ${alert.severity}
Affected Radius: ${alert.affected_radius_km}km
Verification Status: ${verificationStatus} (Score: ${verificationScore})

VERIFIED FACTS (summarized):
${keyFacts.length ? keyFacts.join('\n') : 'No additional verified facts available'}

INSTRUCTIONS:
Generate 3 alert message options in 5 languages (Arabic, English, Turkish, Italian, Hebrew).

Message Options:
1. CONCISE - Under 160 characters, SMS-friendly, urgent tone
2. DETAILED - Around 300 characters, includes specific instructions
3. TECHNICAL - Includes technical data (coordinates, radius, and verification status)

RESPOND IN THIS EXACT JSON FORMAT (no markdown, no code blocks):
{
  "concise": {
    "ar": "Arabic message...",
    "en": "English message...",
    "tr": "Turkish message...",
    "it": "Italian message...",
    "he": "Hebrew message..."
  },
  "detailed": {
    "ar": "Arabic message...",
    "en": "English message...",
    "tr": "Turkish message...",
    "it": "Italian message...",
    "he": "Hebrew message..."
  },
  "technical": {
    "ar": "Arabic message...",
    "en": "English message...",
    "tr": "Turkish message...",
    "it": "Italian message...",
    "he": "Hebrew message..."
  },
  "assessment": {
    "severity": "${alert.severity}",
    "urgency": "IMMEDIATE/HIGH/MODERATE/LOW",
    "certainty": "OBSERVED/LIKELY/POSSIBLE/UNLIKELY",
    "response_type": "SHELTER/EVACUATE/MONITOR/PREPARE"
  }
}`;

        const result = await model.generateContent({
            contents: [{ role: 'user', parts: [{ text: prompt }] }],
            generationConfig: {
                temperature: 0.3,
                maxOutputTokens: 2000
            }
        });

        const content = result.response.text();
        let jsonStr = content;
        if (content.includes('```json')) {
            jsonStr = content.split('```json')[1].split('```')[0].trim();
        } else if (content.includes('```')) {
            jsonStr = content.split('```')[1].split('```')[0].trim();
        }

        const templates = JSON.parse(jsonStr);
        return {
            success: true,
            messages: templates,
            generated_at: new Date().toISOString()
        };
    } catch (error) {
        console.error('Post-verification template generation error:', error.message);
        return { success: false, error: error.message };
    }
}

async function generateAlertOptions(eventData, perplexityAnalysis) {
    try {
        const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });

        const prompt = `You are an emergency alert message generator for MedAlert AI crisis communication system.

EVENT DETAILS:
Type: ${eventData.type || perplexityAnalysis.event_type}
Location: ${eventData.lat}, ${eventData.lon}
Severity: ${perplexityAnalysis.severity_assessment}
Affected Radius: ${perplexityAnalysis.affected_radius_km}km
Key Facts: ${perplexityAnalysis.key_facts?.join(', ') || 'Emergency event detected'}
Recommended Action: ${perplexityAnalysis.recommended_action}

INSTRUCTIONS:
Generate 3 alert message options in 5 languages (Arabic, English, Turkish, Italian, Hebrew).

Message Options:
1. CONCISE - Under 160 characters, SMS-friendly, urgent tone
2. DETAILED - Around 300 characters, includes specific instructions
3. TECHNICAL - Includes technical data (magnitude, coordinates, radius)

RESPOND IN THIS EXACT JSON FORMAT (no markdown, no code blocks):
{
  "concise": {
    "ar": "Arabic message...",
    "en": "English message...",
    "tr": "Turkish message...",
    "it": "Italian message...",
    "he": "Hebrew message..."
  },
  "detailed": {
    "ar": "Arabic message...",
    "en": "English message...",
    "tr": "Turkish message...",
    "it": "Italian message...",
    "he": "Hebrew message..."
  },
  "technical": {
    "ar": "Arabic message...",
    "en": "English message...",
    "tr": "Turkish message...",
    "it": "Italian message...",
    "he": "Hebrew message..."
  },
  "assessment": {
    "severity": "${perplexityAnalysis.severity_assessment}",
    "urgency": "IMMEDIATE/HIGH/MODERATE/LOW",
    "certainty": "OBSERVED/LIKELY/POSSIBLE/UNLIKELY",
    "response_type": "SHELTER/EVACUATE/MONITOR/PREPARE"
  }
}`;

        const result = await model.generateContent({
            contents: [{ role: 'user', parts: [{ text: prompt }] }],
            generationConfig: {
                temperature: 0.3,
                maxOutputTokens: 2000
            }
        });

        const content = result.response.text();

        // Parse JSON from response
        let jsonStr = content;
        if (content.includes('```json')) {
            jsonStr = content.split('```json')[1].split('```')[0].trim();
        } else if (content.includes('```')) {
            jsonStr = content.split('```')[1].split('```')[0].trim();
        }

        const alertMessages = JSON.parse(jsonStr);

        return {
            success: true,
            messages: alertMessages,
            generated_at: new Date().toISOString()
        };

    } catch (error) {
        console.error('Gemini generation error:', error.message);

        // Fallback messages for demo
        const eventType = eventData.type || perplexityAnalysis.event_type || 'EMERGENCY';
        const fallbackMessages = {
            concise: {
                ar: `⚠️ تنبيه طوارئ: ${eventType} في منطقتك. ابق آمناً.`,
                en: `⚠️ ALERT: ${eventType} detected in your area. Stay safe, await instructions.`,
                tr: `⚠️ UYARI: Bölgenizde ${eventType} tespit edildi. Güvende kalın.`,
                it: `⚠️ ALLERTA: ${eventType} rilevato nella tua zona. Resta al sicuro.`,
                he: `⚠️ התראה: ${eventType} זוהה באזורך. הישאר בטוח.`
            },
            detailed: {
                ar: `تنبيه طوارئ: تم اكتشاف ${eventType} في منطقتك. الشدة: ${perplexityAnalysis.severity_assessment}. نصف القطر المتأثر: ${perplexityAnalysis.affected_radius_km} كم. اتبع تعليمات السلطات المحلية وابق في مكان آمن.`,
                en: `Emergency Alert: ${eventType} detected in your area. Severity: ${perplexityAnalysis.severity_assessment}. Affected radius: ${perplexityAnalysis.affected_radius_km}km. Follow local authority instructions and stay in a safe location.`,
                tr: `Acil Durum Uyarısı: Bölgenizde ${eventType} tespit edildi. Şiddet: ${perplexityAnalysis.severity_assessment}. Etkilenen yarıçap: ${perplexityAnalysis.affected_radius_km}km. Yerel yetkilerin talimatlarını izleyin.`,
                it: `Allerta Emergenza: ${eventType} rilevato. Gravità: ${perplexityAnalysis.severity_assessment}. Raggio interessato: ${perplexityAnalysis.affected_radius_km}km. Seguire le istruzioni delle autorità locali.`,
                he: `התראת חירום: ${eventType} זוהה באזורך. חומרה: ${perplexityAnalysis.severity_assessment}. רדיוס מושפע: ${perplexityAnalysis.affected_radius_km} ק"מ. עקוב אחר הוראות הרשויות.`
            },
            technical: {
                ar: `[MedAlert] ${eventType} | الموقع: ${eventData.lat?.toFixed(4)}, ${eventData.lon?.toFixed(4)} | الشدة: ${perplexityAnalysis.severity_assessment} | نصف القطر: ${perplexityAnalysis.affected_radius_km} كم`,
                en: `[MedAlert] ${eventType} | Loc: ${eventData.lat?.toFixed(4)}, ${eventData.lon?.toFixed(4)} | Severity: ${perplexityAnalysis.severity_assessment} | Radius: ${perplexityAnalysis.affected_radius_km}km`,
                tr: `[MedAlert] ${eventType} | Konum: ${eventData.lat?.toFixed(4)}, ${eventData.lon?.toFixed(4)} | Şiddet: ${perplexityAnalysis.severity_assessment} | Yarıçap: ${perplexityAnalysis.affected_radius_km}km`,
                it: `[MedAlert] ${eventType} | Pos: ${eventData.lat?.toFixed(4)}, ${eventData.lon?.toFixed(4)} | Gravità: ${perplexityAnalysis.severity_assessment} | Raggio: ${perplexityAnalysis.affected_radius_km}km`,
                he: `[MedAlert] ${eventType} | מיקום: ${eventData.lat?.toFixed(4)}, ${eventData.lon?.toFixed(4)} | חומרה: ${perplexityAnalysis.severity_assessment} | רדיוס: ${perplexityAnalysis.affected_radius_km} ק"מ`
            },
            assessment: {
                severity: perplexityAnalysis.severity_assessment,
                urgency: 'HIGH',
                certainty: 'LIKELY',
                response_type: 'MONITOR'
            }
        };

        return {
            success: true,
            messages: fallbackMessages,
            generated_at: new Date().toISOString(),
            fallback: true,
            error: error.message
        };
    }
}

async function translateCustomMessage(message, targetLanguages = LANGUAGE_CODES) {
    try {
        const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });

        const prompt = `Translate the following emergency alert message into these languages: ${targetLanguages.join(', ')}.

MESSAGE:
${message}

RESPOND IN THIS EXACT JSON FORMAT (no markdown):
{
  ${targetLanguages.map(lang => `"${lang}": "translated message"`).join(',\n  ')}
}`;

        const result = await model.generateContent({
            contents: [{ role: 'user', parts: [{ text: prompt }] }],
            generationConfig: {
                temperature: 0.2,
                maxOutputTokens: 1000
            }
        });

        const content = result.response.text();
        let jsonStr = content;
        if (content.includes('```')) {
            jsonStr = content.split('```')[1].split('```')[0].replace('json', '').trim();
        }

        return JSON.parse(jsonStr);

    } catch (error) {
        console.error('Translation error:', error.message);
        // Return original message for all languages as fallback
        return targetLanguages.reduce((acc, lang) => {
            acc[lang] = message;
            return acc;
        }, {});
    }
}

module.exports = { generateAlertOptions, translateCustomMessage, generatePostVerificationTemplates };
