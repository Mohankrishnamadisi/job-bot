const { chromium, firefox, webkit } = require('playwright');
const { playwrightHeadless, playwrightBrowser } = require('../config/env');
const logger = require('../utils/logger');

const browsers = {
  chromium,
  firefox,
  webkit,
};

async function createBrowser() {
  const browserType = browsers[playwrightBrowser];

  if (!browserType) {
    throw new Error(`Unsupported PLAYWRIGHT_BROWSER value: ${playwrightBrowser}`);
  }

  return browserType.launch({ headless: playwrightHeadless });
}

async function companyScraper() {
  const browser = await createBrowser();
  const page = await browser.newPage();

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
    await browser.close().catch(() => {});
  }
}

module.exports = companyScraper;
