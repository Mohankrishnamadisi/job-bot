const { getCompanyByName, ensureCompany } = require('./src/database/companyRepository');
const { scrapeWiproJobs } = require('./src/scrapers/wipro');

(async () => {
  const before = await getCompanyByName('Wipro');
  const company = await ensureCompany({ name: 'Wipro' });
  const companyState = before ? 'reused' : 'created';
  const first = await scrapeWiproJobs('', '', false);
  const second = await scrapeWiproJobs('', '', false);

  console.log(JSON.stringify({
    companyState,
    companyId: company?.id || null,
    companyName: company?.name || null,
    firstRun: {
      totalFetched: first?.stats?.totalFound ?? null,
      newJobsInserted: first?.stats?.newCount ?? null,
      existingJobsUpdated: first?.stats?.updatedCount ?? null,
      jobsMarkedInactive: first?.stats?.removedCount ?? null,
      databaseErrors: null,
    },
    secondRun: {
      totalFetched: second?.stats?.totalFound ?? null,
      newJobsInserted: second?.stats?.newCount ?? null,
      existingJobsUpdated: second?.stats?.updatedCount ?? null,
      jobsMarkedInactive: second?.stats?.removedCount ?? null,
      databaseErrors: null,
    },
    duplicateDetectionWorking: (second?.stats?.newCount ?? 0) === 0,
  }, null, 2));
})().catch((err) => {
  console.error(err && err.stack || err);
  process.exit(1);
});
