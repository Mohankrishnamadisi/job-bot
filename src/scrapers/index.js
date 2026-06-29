const { scrapeCompanyJobs } = require('./companyScraper');
const { scrapeAccentureJobs } = require('./accenture');
const { scrapeWiproJobs } = require('./wipro');
const logger = require('../utils/logger');

const SCRAPER_REGISTRY = {
  accenture: scrapeAccentureJobs,
  amazon: async () => [],
  microsoft: async () => [],
  wipro: scrapeWiproJobs,
};

async function runScrapers(urls = []) {
  if (!Array.isArray(urls) || urls.length === 0) {
    logger.warn('No scraper URLs provided');
    return [];
  }

  const results = [];

  for (const item of urls) {
    try {
      const key = String(item).trim().toLowerCase();
      const registeredScraper = SCRAPER_REGISTRY[key];

      if (registeredScraper) {
        logger.info(`Starting registered scraper for ${key}`);
        const response = await registeredScraper();
        const jobs = Array.isArray(response?.result) ? response.result : [];
        logger.info(`Scraper finished for ${key}: ${jobs.length} jobs found`);
        results.push(...jobs);
        continue;
      }

      logger.info(`Starting scraper for ${item}`);
      const jobs = await scrapeCompanyJobs(item);
      logger.info(`Scraper finished for ${item}: ${jobs.length} jobs found`);
      results.push(...jobs);
    } catch (error) {
      logger.error(`Scraper error for ${item}: ${error.message}`);
    }
  }

  return results;
}

module.exports = {
  runScrapers,
};
