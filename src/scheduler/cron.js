const cron = require('node-cron');
const logger = require('../utils/logger');
const { companyCareerUrls } = require('../config/env');
const { runScrapers } = require('../scrapers');
const { deduplicateJobs } = require('../services/duplicateService');
const { saveJobs } = require('../database/jobRepository');
const { importArbeitnowJobs } = require('../services/jobs/fetchArbeitnowJobs');

const JOB_SCHEDULES = ['0 8 * * *', '0 13 * * *', '0 18 * * *'];

function normalizeJobKey(job) {
  const applyUrl = job.applyUrl?.trim().toLowerCase();
  const titleCompany = `${job.title?.trim().toLowerCase() || ''}::${job.company?.trim().toLowerCase() || ''}`;
  return applyUrl || titleCompany;
}

function deduplicateScrapedJobs(jobs) {
  const seen = new Set();
  return jobs.filter((job) => {
    const key = normalizeJobKey(job);
    if (!key || seen.has(key)) {
      return false;
    }

    seen.add(key);
    return true;
  });
}

async function runJobPipeline() {
  logger.info('Starting scheduled job pipeline');

  try {
    const arbeitnowStats = await importArbeitnowJobs({ maxPages: process.env.ARBEITNOW_MAX_PAGES || 5 });
    logger.info(`Arbeitnow import stats: fetched=${arbeitnowStats.fetched}, inserted=${arbeitnowStats.inserted}, skipped=${arbeitnowStats.skipped}, failed=${arbeitnowStats.failed}`);
  } catch (error) {
    logger.error(`Arbeitnow import failed: ${error.message}`);
  }

  if (!Array.isArray(companyCareerUrls) || companyCareerUrls.length === 0) {
    logger.warn('No company career URLs configured for scheduler');
    return;
  }

  try {
    const scrapedJobs = await runScrapers(companyCareerUrls);
    const uniqueScrapedJobs = deduplicateScrapedJobs(scrapedJobs);

    if (uniqueScrapedJobs.length === 0) {
      logger.warn('No jobs found after scraping');
      return;
    }

    const { uniqueJobs, duplicateJobs, duplicateCount } = await deduplicateJobs(uniqueScrapedJobs);

    if (duplicateCount > 0) {
      logger.info(`Duplicate detection skipped ${duplicateCount} jobs`);
    }

    if (uniqueJobs.length === 0) {
      logger.info('No new jobs to save after duplicate detection');
      return;
    }

    const result = await saveJobs(uniqueJobs);
    if (result.error) {
      logger.error(`Failed to save jobs: ${result.error.message}`);
      return;
    }

    logger.info(`Scheduled pipeline completed: ${result.data.length} new jobs saved`);
  } catch (error) {
    logger.error(`Scheduled pipeline error: ${error.message}`);
  }
}

function scheduleJobs() {
  JOB_SCHEDULES.forEach((cronExpression) => {
    cron.schedule(cronExpression, () => {
      runJobPipeline();
    });
    logger.info(`Scheduled job pipeline for cron expression: ${cronExpression}`);
  });
}

module.exports = {
  runJobPipeline,
  scheduleJobs,
};
