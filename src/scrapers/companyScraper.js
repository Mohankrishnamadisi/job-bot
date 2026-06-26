const logger = require('../utils/logger');
const { newPage } = require('./browser');

async function companyScraper() {
  const page = await newPage();

  try {
    logger.info('Running company scraper');
    await page.goto('https://example.com', { waitUntil: 'domcontentloaded' });

    const companies = await page.$$eval('.company-item', (nodes) =>
      nodes.map((node) => ({
        name: node.querySelector('.company-name')?.textContent?.trim() || 'Unknown',
        location: node.querySelector('.company-location')?.textContent?.trim() || 'Unknown',
        website: node.querySelector('a')?.href || null,
      }))
    );

    return companies;
  } catch (error) {
    logger.error(`Company scraper failed: ${error.message}`);
    throw error;
  } finally {
    await page.close().catch(() => {});
  }
}

module.exports = companyScraper;
