const { scrapeCompanyJobs } = require('./companyScraper');
const logger = require('../utils/logger');

async function runScrapers(urls = []) {
  if (!Array.isArray(urls) || urls.length === 0) {
    logger.warn('No scraper URLs provided');
    return [];
  }

  const results = [];

  for (const url of urls) {
    try {
      logger.info(`Starting scraper for ${url}`);
      const jobs = await scrapeCompanyJobs(url);
      logger.info(`Scraper finished for ${url}: ${jobs.length} jobs found`);
      results.push(...jobs);
    } catch (error) {
      logger.error(`Scraper error for ${url}: ${error.message}`);
    }
  }

  return results;
}

module.exports = {
  runScrapers,
};
