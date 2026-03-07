const { default: YahooFinance } = require('yahoo-finance2');

async function testYahooESG() {
    const yahooFinance = new YahooFinance();
    try {
        console.log("Fetching AAPL...");
        const quoteSummary = await yahooFinance.quoteSummary('AAPL', {
            modules: ['esgScores', 'financialData']
        });

        console.log("ESG Data:", JSON.stringify(quoteSummary.esgScores, null, 2));
    } catch (e) {
        console.error("Error:", e);
    }
}
testYahooESG();
