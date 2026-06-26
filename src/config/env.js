const dotenv = require('dotenv');
const path = require('path');

const envFound = dotenv.config({ path: path.resolve(__dirname, '../../.env') });

if (envFound.error) {
  throw new Error('Unable to load .env file. Please create one at the repository root.');
}

const {
  SUPABASE_URL,
  SUPABASE_KEY,
  PLAYWRIGHT_HEADLESS,
  PLAYWRIGHT_BROWSER,
  PLAYWRIGHT_LAUNCH_TIMEOUT,
  PLAYWRIGHT_PAGE_TIMEOUT,
  PLAYWRIGHT_LAUNCH_RETRIES,
  PLAYWRIGHT_LAUNCH_RETRY_DELAY,
  COMPANY_CAREERS_URLS,
  JOB_SCRAPE_CRON,
  LOG_LEVEL,
} = process.env;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  throw new Error('SUPABASE_URL and SUPABASE_KEY must be defined in .env');
}

module.exports = {
  supabaseUrl: SUPABASE_URL,
  supabaseKey: SUPABASE_KEY,
  playwrightHeadless: PLAYWRIGHT_HEADLESS !== 'false',
  playwrightBrowser: PLAYWRIGHT_BROWSER || 'chromium',
  playwrightLaunchTimeout: Number(PLAYWRIGHT_LAUNCH_TIMEOUT) || 30000,
  playwrightPageTimeout: Number(PLAYWRIGHT_PAGE_TIMEOUT) || 30000,
  playwrightLaunchRetries: Number(PLAYWRIGHT_LAUNCH_RETRIES) || 3,
  playwrightLaunchRetryDelay: Number(PLAYWRIGHT_LAUNCH_RETRY_DELAY) || 1000,
  companyCareerUrls:
    COMPANY_CAREERS_URLS?.split(',').map((value) => value.trim()).filter(Boolean) || [],
  jobScrapeCron: JOB_SCRAPE_CRON || '0 0 * * *',
  logLevel: LOG_LEVEL || 'info',
};
