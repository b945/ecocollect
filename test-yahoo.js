const { default: YahooFinance } = require('yahoo-finance2');

async function testYahoo() {
    const yahooFinance = new YahooFinance();
    try {
        const searchResult = await yahooFinance.search('Apple');
        const bestMatch = searchResult.quotes.find(q => q.quoteType === 'EQUITY') || searchResult.quotes[0];
        console.log("Ticker:", bestMatch.symbol);

        const quoteSummary = await yahooFinance.quoteSummary(bestMatch.symbol, {
            modules: ['assetProfile', 'financialData']
        });

        const profile = quoteSummary.assetProfile || {};
        const financials = quoteSummary.financialData || {};
        console.log("Revenue:", financials.totalRevenue);
    } catch (e) {
        console.error("Error:", e);
    }
}
testYahoo();
