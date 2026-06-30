const express = require('express');
const logger = require('./utils/logger');
const { scheduleJobs, runJobPipeline } = require('./scheduler/cron');
const { importArbeitnowJobs } = require('./services/jobs/fetchArbeitnowJobs');

const app = express();
app.use(express.json());

app.post('/admin/jobs/import/arbeitnow', async (req, res) => {
  try {
    const maxPages = req.body?.maxPages ?? process.env.ARBEITNOW_MAX_PAGES ?? 5;
    const stats = await importArbeitnowJobs({ maxPages });
    res.status(200).json({ success: true, stats });
  } catch (error) {
    logger.error(`Admin Arbeitnow import failed: ${error.message}`);
    res.status(500).json({ success: false, error: error.message });
  }
});

async function main() {
  try {
    logger.info('Job bot backend starting');
    scheduleJobs();

    if (process.env.RUN_ONCE === 'true') {
      await runJobPipeline();
    }

    const port = Number(process.env.PORT || 3000);
    app.listen(port, () => {
      logger.info(`Job bot backend listening on port ${port}`);
    });
  } catch (error) {
    logger.error(`Application failed to start: ${error.message}`);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

module.exports = app;
