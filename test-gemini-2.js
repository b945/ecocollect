const { GoogleGenAI } = require('@google/genai');
require('dotenv').config({ path: '.env.local' });

async function testGeminiNoSearch() {
    try {
        const ai = new GoogleGenAI({});
        const company = "Apple";
        const year = 2023;

        const prompt = `You are a strict financial and sustainability data assistant.
        
Provide the EXACT publicly reported ESG (Environmental, Social, and Governance) data inside official financial and sustainability reports for the company "${company}" for the year ${year}.
Provide the reported revenue (in USD), Scope 1, Scope 2, and Scope 3 emissions (in metric tons CO2e), and calculate or find a Sustainability Score (0-100).

CRITICAL RULES:
1. You MUST provide the EXACT reported figure for any metric from their official public report.
2. DO NOT GENERATE OR ESTIMATE FAKE DATA. If exact data is completely unavailable or not publicly reported, you MUST explicitly return 0. Do not guess industry averages.

Return ONLY a valid JSON object with the following keys, without any markdown formatting or extra text: 
{ "companyName": "string", "ticker": "string or 'UNLISTED'", "sector": "string", "revenue": number, "scope1": number, "scope2": number, "scope3": number, "sustainabilityScore": number }`;

        console.log("Sending to Gemini (No Search)...");
        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: prompt
        });

        console.log("Raw Response:", response.text);
    } catch (e) {
        console.error("Error:", e);
    }
}
testGeminiNoSearch();
