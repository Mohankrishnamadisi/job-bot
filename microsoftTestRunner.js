require('dotenv').config();
const { scrapeMicrosoftJobs } = require('./src/scrapers/microsoft');

(async () => {
  try {
    const { result, stats } = await scrapeMicrosoftJobs();
    console.log('Scrape complete.');
    console.log('Stats:', stats);
    console.log('Sample result count:', Array.isArray(result) ? result.length : 0);
  } catch (err) {
    console.error('Scrape failed:', err);ac
    process.exit(1);
  }
})();
