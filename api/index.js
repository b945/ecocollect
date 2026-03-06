const express = require('express');
const cors = require('cors');
const { default: YahooFinance } = require('yahoo-finance2');
require('dotenv').config();
require('dotenv').config({ path: '.env.local' });
const { GoogleGenAI } = require('@google/genai');

const yahooFinance = new YahooFinance();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(require('path').join(__dirname, '..')));

// Removed getEmissionsMultiplier as it provided synthetic baseline figures

app.get('/api/lookup', async (req, res) => {
    try {
        const { company, year } = req.query;
        if (!company) {
            return res.status(400).json({ error: 'Company name is required' });
        }

        const targetYear = parseInt(year) || new Date().getFullYear() - 1;

        // Try Gemini primarily if API key is provided
        if (process.env.GEMINI_API_KEY) {
            try {
                return await handleGemini(company, targetYear, res);
            } catch (err) {
                console.error("Gemini failed, falling back to Yahoo:", err);
            }
        }

        let searchResult;
        try {
            searchResult = await yahooFinance.search(company);
        } catch (e) {
            console.log("Yahoo search failed:", e.message);
            return handleEmptyFallback(company, targetYear, res);
        }

        if (!searchResult.quotes || searchResult.quotes.length === 0) {
            return handleEmptyFallback(company, targetYear, res);
        }

        const bestMatch = searchResult.quotes.find(q => q.quoteType === 'EQUITY') || searchResult.quotes[0];
        const ticker = bestMatch.symbol;

        let profile = {};
        let financials = {};
        let sector = 'Default';
        let revenue = 0;
        let quote = {};

        try {
            quote = await yahooFinance.quote(ticker);
            const quoteSummary = await yahooFinance.quoteSummary(ticker, {
                modules: ['assetProfile', 'financialData']
            });
            profile = quoteSummary.assetProfile || {};
            financials = quoteSummary.financialData || {};
            sector = profile.sector || 'Unspecified';
            revenue = financials.totalRevenue || 0;
        } catch (err) {
            console.log(`Warning: Could not fetch comprehensive profile for ${ticker} - ${err.message}`);
        }

        // If Yahoo Finance couldn't find revenue or emissions, we stop right here.
        // We do NOT synthesize missing data anymore.
        if (revenue === 0) {
            return handleEmptyFallback(quote.longName || bestMatch.shortname || company, targetYear, res, ticker, sector);
        }

        const result = {
            companyName: quote.longName || bestMatch.shortname || company,
            ticker: ticker,
            sector: sector,
            year: targetYear,
            revenue: revenue,
            scope1: 0,
            scope2: 0,
            scope3: 0,
            totalEmissions: 0,
            sustainabilityScore: 0,
            sources: 'Financial API (Revenue Only)',
            message: 'Public financial revenue found, but no explicit ESG data is publicly listed in standard APIs.'
        };

        res.json(result);
    } catch (error) {
        console.error('API Error:', error);
        res.status(500).json({ error: 'Failed to collect data. The company may not be public or the API rate limit was hit.' });
    }
});

// App listen for local development, export for Vercel serverless
if (require.main === module) {
    app.listen(PORT, () => {
        console.log(`EcoCollect backend listening on port ${PORT}`);
    });
}

// Return a completely 0-filled strict fallback instead of generating synthetic hashes.
function handleEmptyFallback(company, year, res, ticker = 'UNLISTED', sector = 'Unknown') {
    const result = {
        companyName: company,
        ticker: ticker,
        sector: sector,
        year: year,
        revenue: 0,
        scope1: 0,
        scope2: 0,
        scope3: 0,
        totalEmissions: 0,
        sustainabilityScore: 0,
        sources: 'No public data found',
        message: 'No official, public reporting found for this company.'
    };
    return res.json(result);
}

// Primary Gemini Data fetching
async function handleGemini(company, year, res) {
    const ai = new GoogleGenAI({}); // Defaults to process.env.GEMINI_API_KEY
    const prompt = `You are a strict financial and sustainability data assistant.
    
Search for the EXACT publicly reported ESG (Environmental, Social, and Governance) data inside official financial and sustainability reports for the company "${company}" for the year ${year}.
Provide the reported revenue (in USD), Scope 1, Scope 2, and Scope 3 emissions (in metric tons CO2e), and calculate or find a Sustainability Score (0-100).

CRITICAL RULES:
1. You MUST find the EXACT reported figure for any metric in an official public report.
2. DO NOT GENERATE OR ESTIMATE FAKE DATA. If exact data is completely unavailable or not publicly reported, you MUST explicitly return 0. Do not guess industry averages.

Return ONLY a valid JSON object with the following keys, without any markdown formatting or extra text: 
{ "companyName": "string", "ticker": "string or 'UNLISTED'", "sector": "string", "revenue": number, "scope1": number, "scope2": number, "scope3": number, "sustainabilityScore": number }`;

    const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: prompt,
        config: {
            tools: [{ googleSearch: {} }]
        }
    });

    const text = response.text;
    const jsonStr = text.replace(/```json/g, '').replace(/```/g, '').trim();
    const data = JSON.parse(jsonStr);

    // Helper to deeply parse formatted string floats (e.g. "300,000", "0.0") into real JS Numbers
    const parseNum = (val) => {
        if (typeof val === 'number') return val;
        if (!val) return 0;
        const clean = String(val).replace(/,/g, '').replace(/[^\d.-]/g, '');
        const parsed = parseFloat(clean);
        return isNaN(parsed) ? 0 : parsed;
    };

    const scope1 = parseNum(data.scope1);
    const scope2 = parseNum(data.scope2);
    const scope3 = parseNum(data.scope3);

    const result = {
        companyName: data.companyName || company,
        ticker: data.ticker || 'UNLISTED',
        sector: data.sector || 'Unknown',
        year: year,
        revenue: parseNum(data.revenue),
        scope1: scope1,
        scope2: scope2,
        scope3: scope3,
        totalEmissions: parseFloat((scope1 + scope2 + scope3).toFixed(2)),
        sustainabilityScore: parseNum(data.sustainabilityScore) || 50,
        sources: 'Gemini AI',
        message: `Data retrieved using Gemini AI. Sustainability Score: ${parseNum(data.sustainabilityScore) || 50}/100`
    };

    return res.json(result);
}

module.exports = app;
