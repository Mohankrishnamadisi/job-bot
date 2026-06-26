const companyScraper = require('./companyScraper');
const logger = require('../utils/logger');

async function runScrapers() {
  try {
    logger.info('Starting scrapers');
    const companies = await companyScraper();
    logger.info(`Scraper finished with ${companies.length} companies`);
    return companies;
  } catch (error) {
    logger.error(`Scraper error: ${error.message}`);
    throw error;
  }
}

module.exports = {
  runScrapers,
};
