const express = require('express');
const cors = require('cors');
const { default: YahooFinance } = require('yahoo-finance2');
const axios = require('axios');
const cheerio = require('cheerio');
require('dotenv').config();
require('dotenv').config({ path: '.env.local' });


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

        // Try ScraperAPI if the API key is provided
        if (!process.env.SCRAPERAPI_KEY) {
            return res.status(400).json({ error: 'Missing Configuration: You must add SCRAPERAPI_KEY to your .env.local file. Get one for free at scraperapi.com.' });
        }

        try {
            return await handleScraperAPI(company, targetYear, res);
        } catch (err) {
            console.error("ScraperAPI failed:", err.message);
            // Fallthrough to Yahoo Finance 0-fallback if the scraper totally fails
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

// Web Scraping using ScraperAPI to bypass CAPTCHAs
async function handleScraperAPI(company, year, res) {
    const apiKey = process.env.SCRAPERAPI_KEY;

    // Using DuckDuckGo via Scraper API since it has highly readable HTML snippets
    const query = `"${company}" ESG report ${year} "Scope 1" "Scope 2" "Scope 3" emissions "metric tons CO2e" revenue`;
    const targetUrl = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
    const scraperUrl = `http://api.scraperapi.com?api_key=${apiKey}&url=${encodeURIComponent(targetUrl)}`;

    const response = await axios.get(scraperUrl);

    if (response.status !== 200) {
        throw new Error(`Scraper Error: ${response.status}`);
    }

    // Load raw HTML and aggregate snippets
    const $ = cheerio.load(response.data);
    let combinedText = '';

    // In duckduckgo HTML, snippets are usually in a.result__snippet
    $('.result__snippet').each((i, el) => {
        combinedText += $(el).text() + ' ';
    });

    // Helper functions to find numbers close to keywords via Regex
    const extractMetric = (text, keyword) => {
        // Looks for keyword, followed by up to 40 chars of text, then captures a number (with optional commas/decimals)
        const regex = new RegExp(`${keyword}.{0,50}?(\\d{1,3}(?:,\\d{3})*(?:\\.\\d+)?)`, 'i');
        const match = text.match(regex);
        if (match && match[1]) {
            const clean = match[1].replace(/,/g, '');
            const parsed = parseFloat(clean);
            return isNaN(parsed) ? 0 : parsed;
        }
        return 0;
    };

    const extractRevenue = (text) => {
        // Similar to extractMetric but looks for revenue/sales and an optional billion/million indicator
        const regex = /(?:revenue|sales).{0,30}?\$?\s?(\d{1,3}(?:,\d{3})*(?:\.\d+)?)\s?(billion|B|million|M)?/i;
        const match = text.match(regex);
        if (match && match[1]) {
            const num = parseFloat(match[1].replace(/,/g, ''));
            const multiplierStr = match[2] ? match[2].toLowerCase() : '';

            let finalVal = num;
            if (multiplierStr.startsWith('b')) finalVal = num * 1000000000;
            if (multiplierStr.startsWith('m')) finalVal = num * 1000000;
            return finalVal;
        }
        return 0; // Hand off to Yahoo Finance if raw string search fails
    };

    let scope1 = extractMetric(combinedText, 'Scope 1');
    let scope2 = extractMetric(combinedText, 'Scope 2');
    let scope3 = extractMetric(combinedText, 'Scope 3');
    let revenue = extractRevenue(combinedText);

    // Get ticker from Yahoo Finance to complete the payload
    let ticker = 'UNLISTED';
    let sector = 'Unknown';
    let companyName = company;

    try {
        const sr = await yahooFinance.search(company);
        if (sr.quotes && sr.quotes.length > 0) {
            const best = sr.quotes.find(q => q.quoteType === 'EQUITY') || sr.quotes[0];
            ticker = best.symbol;
            companyName = best.shortname || best.longname || company;

            // if Scraper missed revenue, grab it from yahoo
            if (revenue === 0) {
                const quoteSummary = await yahooFinance.quoteSummary(ticker, { modules: ['assetProfile', 'financialData'] });
                const fin = quoteSummary.financialData || {};
                revenue = fin.totalRevenue || 0;
                sector = quoteSummary.assetProfile?.sector || 'Unknown';
            }
        }
    } catch (e) {
        // ignore yahoo fails
    }

    const result = {
        companyName: companyName,
        ticker: ticker,
        sector: sector,
        year: year,
        revenue: revenue,
        scope1: scope1,
        scope2: scope2,
        scope3: scope3,
        totalEmissions: parseFloat((scope1 + scope2 + scope3).toFixed(2)),
        sustainabilityScore: 50, // Static fallback as search APIs cannot dynamically score
        sources: 'ScraperAPI Web Scrape',
        message: 'Data retrieved algorithmically via ScraperAPI. Note: Regex extraction can mistake years/page numbers as emissions.'
    };

    return res.json(result);
}

module.exports = app;
