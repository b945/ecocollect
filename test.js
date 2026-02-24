const yf = require('yahoo-finance2').default;
yf.search('Apple').then(console.log).catch(console.error);
