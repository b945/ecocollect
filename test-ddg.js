const { search, SafeSearchType } = require('duck-duck-scrape');

async function testDDG() {
    const company = "Apple";
    const year = 2023;
    const query = `"${company}" ESG report ${year} "Scope 1" "Scope 2" "Scope 3" emissions "metric tons CO2e" revenue`;

    try {
        console.log("Searching DDG for:", query);
        const searchResults = await search(query, { safeSearch: SafeSearchType.OFF });

        let combinedText = '';
        if (searchResults.results && searchResults.results.length > 0) {
            searchResults.results.forEach(res => {
                combinedText += (res.description || '') + ' ';
            });
        }

        console.log("Combined Snippets:", combinedText);

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

        console.log("Scope 1:", extractMetric(combinedText, 'Scope 1'));
        console.log("Scope 2:", extractMetric(combinedText, 'Scope 2'));
        console.log("Scope 3:", extractMetric(combinedText, 'Scope 3'));
        console.log("Revenue:", extractRevenue(combinedText));

    } catch (e) {
        console.error("Error:", e);
    }
}
testDDG();
