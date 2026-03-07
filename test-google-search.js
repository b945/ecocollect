const apiKey = "AIzaSyCO8Kv_aLD8XcF79tKB9BfatvF5VJVgNr4";
const cx = "b128795da1f1e428c"; // Publicly available global test CX for web searching (or similar open CX if possible)

async function testGoogleSearch() {
    const query = `"Apple" ESG report 2023 "Scope 1"`;
    const url = `https://www.googleapis.com/customsearch/v1?q=${encodeURIComponent(query)}&cx=${cx}&key=${apiKey}`;

    try {
        console.log("Fetching:", url.replace(apiKey, "HIDDEN_KEY"));
        const searchRes = await fetch(url);
        const searchData = await searchRes.json();

        if (!searchRes.ok) {
            console.error("API Error:", searchData.error?.message);
            return;
        }

        console.log("Success! Found", searchData.items?.length || 0, "results.");
        if (searchData.items && searchData.items.length > 0) {
            console.log("Snippet 1:", searchData.items[0].snippet);
        }
    } catch (e) {
        console.error("Fetch Error:", e);
    }
}
testGoogleSearch();
