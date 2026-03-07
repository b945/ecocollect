const axios = require('axios');
const cheerio = require('cheerio');
require('dotenv').config({ path: '.env.local' });

async function testScraping() {
    const company = "Apple";
    const year = 2023;
    const query = `"${company}" ESG report ${year} "Scope 1" "Scope 2" "Scope 3" emissions "metric tons CO2e" revenue`;

    const url = `https://api.scraperapi.com/structured/google/search?api_key=${process.env.SCRAPERAPI_KEY}&query=${encodeURIComponent(query)}`;

    try {
        console.log("Fetching URL:", url.replace(process.env.SCRAPERAPI_KEY, 'HIDDEN'));

        const response = await axios.get(url);

        const fs = require('fs');

        let combinedText = '';
        if (response.data && response.data.organic_results) {
            response.data.organic_results.forEach(result => {
                combinedText += (result.title + " " + result.snippet + " ");
            });
        }


        fs.writeFileSync('out2.txt', combinedText);
        console.log("Extracted Combined Text:");
        console.log(combinedText.substring(0, 500) + "...\n");

        const extractMetric = (text, keyword) => {
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
            return 0;
        };

        let scope1 = extractMetric(combinedText, 'Scope 1');
        let scope2 = extractMetric(combinedText, 'Scope 2');
        let scope3 = extractMetric(combinedText, 'Scope 3');
        let revenue = extractRevenue(combinedText);

        console.log("Extracted Scope 1:", scope1);
        console.log("Extracted Scope 2:", scope2);
        console.log("Extracted Scope 3:", scope3);
        console.log("Extracted Revenue:", revenue);

    } catch (e) {
        console.error("Scraping Fetch Error:", e.message);
    }
}

testScraping();
