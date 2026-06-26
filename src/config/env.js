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
  jobScrapeCron: JOB_SCRAPE_CRON || '0 0 * * *',
  logLevel: LOG_LEVEL || 'info',
};
