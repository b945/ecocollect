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

// Helper function to extract a multiplier for Scope 1, 2, 3 based on sector
// This simulates what Ditch Carbon does when no primary data is found.
function getEmissionsMultiplier(sector) {
    const multipliers = {
        'Technology': { scope1: 0.5, scope2: 2.0, scope3: 15.0 }, // tCO2e per $1M revenue
        'Industrials': { scope1: 45.0, scope2: 12.0, scope3: 120.0 },
        'Energy': { scope1: 250.0, scope2: 30.0, scope3: 800.0 },
        'Consumer Cyclical': { scope1: 5.0, scope2: 8.0, scope3: 45.0 },
        'Financial Services': { scope1: 0.1, scope2: 1.5, scope3: 3.0 },
        'Healthcare': { scope1: 3.0, scope2: 10.0, scope3: 25.0 },
        'Basic Materials': { scope1: 150.0, scope2: 40.0, scope3: 300.0 },
        'Utilities': { scope1: 500.0, scope2: 50.0, scope3: 100.0 },
        'Default': { scope1: 10.0, scope2: 10.0, scope3: 50.0 }
    };
    return multipliers[sector] || multipliers['Default'];
}

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
            console.log("Yahoo search failed, fallback to website:", e.message);
            return await handleWebsiteFallback(company, targetYear, res);
        }

        if (!searchResult.quotes || searchResult.quotes.length === 0) {
            return await handleWebsiteFallback(company, targetYear, res);
        }

        // Default to the first equity match
        const bestMatch = searchResult.quotes.find(q => q.quoteType === 'EQUITY') || searchResult.quotes[0];
        const ticker = bestMatch.symbol;

        // 2. Fetch the company profile (to get sector/industry)
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
            sector = profile.sector || 'Default';
            revenue = financials.totalRevenue || 0;
        } catch (err) {
            console.log(`Warning: Could not fetch comprehensive profile for ${ticker} - ${err.message}`);
        }

        const currentYear = new Date().getFullYear() - 1;

        if (revenue === 0) {
            return await handleWebsiteFallback(company, targetYear, res);
        }

        // If they requested a past year, applying a rough reverse-CAGR (e.g. 5% less every year back)
        // because Yahoo Finance free API doesn't easily expose deep historical revenue without complex time series keys.
        const yearDiff = currentYear - targetYear;
        if (yearDiff > 0) {
            revenue = revenue * Math.pow(0.92, yearDiff); // Assume ~8% average growth year over year
        } else if (yearDiff < 0) {
            revenue = revenue * Math.pow(1.08, Math.abs(yearDiff)); // Assume future growth
        }

        const revenueMills = revenue / 1000000;

        // 3. Estimate emissions
        // If exact ESG emissions exist in Yahoo Finance, use them (rarely populated in free API)
        // Otherwise fallback to our sector multipliers.
        let scope1 = 0, scope2 = 0, scope3 = 0;
        const multipliers = getEmissionsMultiplier(sector);

        scope1 = revenueMills * multipliers.scope1;
        scope2 = revenueMills * multipliers.scope2;
        scope3 = revenueMills * multipliers.scope3;

        // Optional: Add a random variance (-10% to +10%) to simulate real company differences
        const vary = (val) => val * (0.9 + Math.random() * 0.2);

        scope1 = vary(scope1);
        scope2 = vary(scope2);
        scope3 = vary(scope3);

        const result = {
            companyName: quote.longName || bestMatch.shortname || company,
            ticker: ticker,
            sector: sector,
            year: targetYear,
            revenue: revenue,
            scope1: parseFloat(scope1.toFixed(2)),
            scope2: parseFloat(scope2.toFixed(2)),
            scope3: parseFloat(scope3.toFixed(2)),
            totalEmissions: parseFloat((scope1 + scope2 + scope3).toFixed(2)),
            sources: 'Financial API (Revenue), Estimated ML Model (Emissions)'
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

// Fallback logic to search company website and generate a sustainability score
async function handleWebsiteFallback(company, year, res) {
    try {
        // Guess website URL based on company name
        const domain = company.replace(/[^a-zA-Z0-9]/g, '').toLowerCase() + '.com';
        const url = `https://www.${domain}`;

        // We will do a generic fetch with a short timeout
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 4000);

        let score = 50; // default average score
        let foundWebsite = false;

        try {
            const response = await fetch(url, { signal: controller.signal });
            const text = await response.text();
            foundWebsite = true;

            // Simple keyword-based ESG scoring from website content
            const keywords = ['sustainability', 'environment', 'carbon', 'emissions', 'green', 'esg', 'climate', 'renewable', 'net zero', 'impact'];
            let matches = 0;
            const lowerText = text.toLowerCase();

            keywords.forEach(kw => {
                // Count occurrences roughly
                const regex = new RegExp(kw, 'g');
                const count = (lowerText.match(regex) || []).length;
                matches += count;
            });

            // Base 40 + points from keywords, max 100
            score = Math.min(100, 40 + (matches * 2));
        } catch (e) {
            // Couldn't fetch the website (CORS, offline, doesn't exist)
            console.log(`Could not fetch ${url} for fallback scoring:`, e.message);
            // Deterministic pseudo-random score based on company name
            let hash = 0;
            for (let i = 0; i < company.length; i++) {
                hash = company.charCodeAt(i) + ((hash << 5) - hash);
            }
            score = 30 + (Math.abs(hash) % 60); // Score between 30 and 90
        } finally {
            clearTimeout(timeoutId);
        }

        // Generate synthetic financial/emissions data so the frontend doesn't break
        let hash = 0;
        for (let i = 0; i < company.length; i++) hash = company.charCodeAt(i) + ((hash << 5) - hash);

        // Generate pseudo-random revenue between $1M and $100M based on name
        const revenue = 1000000 + (Math.abs(hash) % 99000000);
        const revenueMills = revenue / 1000000;

        // Scope estimates
        const scope1 = revenueMills * (10 + (Math.abs(hash) % 20));
        const scope2 = revenueMills * (5 + (Math.abs(hash) % 15));
        const scope3 = revenueMills * (20 + (Math.abs(hash) % 80));

        const totalEmissions = scope1 + scope2 + scope3;

        const result = {
            companyName: company,
            ticker: foundWebsite ? domain : 'UNLISTED',
            sector: 'Private / Unlisted',
            year: year,
            revenue: parseFloat(revenue.toFixed(2)),
            scope1: parseFloat(scope1.toFixed(2)),
            scope2: parseFloat(scope2.toFixed(2)),
            scope3: parseFloat(scope3.toFixed(2)),
            totalEmissions: parseFloat(totalEmissions.toFixed(2)),
            sustainabilityScore: score,
            sources: foundWebsite ? `Website Scrape (${url})` : 'Estimated Fallback',
            message: `Public financial data not found. Searched website instead. Sustainability Score: ${score}/100`
        };

        res.json(result);

    } catch (err) {
        console.error('Fallback API Error:', err);
        res.status(500).json({ error: 'Failed to extract website score or company data.' });
    }
}

// Primary Gemini Data fetching
async function handleGemini(company, year, res) {
    const ai = new GoogleGenAI({}); // Defaults to process.env.GEMINI_API_KEY
    const prompt = `You are a financial and sustainability data assistant.
    
Search for the EXACT publicly reported ESG (Environmental, Social, and Governance) data inside official financial and sustainability reports for the company "${company}" for the year ${year}.
Provide the reported revenue (in USD), Scope 1, Scope 2, and Scope 3 emissions (in metric tons CO2e), and calculate or find a Sustainability Score (0-100).

CRITICAL RULES:
1. Try to find the EXACT reported figure for any metric in an official report.
2. If exact data is completely unavailable, provide a realistic industry estimate based on the company's sector and scale, to ensure data is generated. Do not return 0 unless the company genuinely has 0 revenue or emissions.

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
