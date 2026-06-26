const logger = require('./utils/logger');
const { scheduleJobs, runJobPipeline } = require('./scheduler/cron');

async function main() {
  try {
    logger.info('Job bot backend starting');
    scheduleJobs();

    if (process.env.RUN_ONCE === 'true') {
      await runJobPipeline();
    }
  } catch (error) {
    logger.error(`Application failed to start: ${error.message}`);
    process.exit(1);
  }
}

main();
