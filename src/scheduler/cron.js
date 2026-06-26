const cron = require('node-cron');
const { jobScrapeCron } = require('../config/env');
const logger = require('../utils/logger');
const { runScrapers } = require('../scrapers');
const { deduplicateAndValidate } = require('../services/duplicateService');
const { insertJobs } = require('../database/jobRepository');

async function runJobPipeline() {
  try {
    logger.info('Starting scheduled job pipeline');

    const companies = await runScrapers();
    const validJobs = await deduplicateAndValidate(companies);

    if (validJobs.length === 0) {
      logger.warn('No valid jobs found after deduplication');
      return;
    }

    await insertJobs(validJobs);
    logger.info(`Scheduled pipeline completed with ${validJobs.length} jobs inserted`);
  } catch (error) {
    logger.error(`Scheduled pipeline error: ${error.message}`);
  }
}

function scheduleJobs() {
  logger.info(`Scheduling job pipeline with cron expression: ${jobScrapeCron}`);
  cron.schedule(jobScrapeCron, () => {
    runJobPipeline();
  });
}

module.exports = {
  runJobPipeline,
  scheduleJobs,
};
