const { scrapeMicrosoftJobs } = require('./src/scrapers/microsoft');

async function runTest() {
  const start = Date.now();

  try {
    console.log('Starting Microsoft scraper test...');
    const { result, stats } = await scrapeMicrosoftJobs();
    const duration = Date.now() - start;

    console.log(`\nSearch pages: ${stats.pageCount}`);
    console.log(`Total jobs found: ${stats.totalFound}`);
    console.log(`New jobs: ${stats.newCount}`);
    console.log(`Updated jobs: ${stats.updatedCount}`);
    console.log(`Removed jobs: ${stats.removedCount}`);

    console.log('\nFirst 5 jobs:');
    result.slice(0, 5).forEach((job, index) => {
      console.log(`\n[${index + 1}]`);
      console.log(`title: ${job.title}`);
      console.log(`location: ${job.location}`);
      console.log(`apply_url: ${job.apply_url}`);
      console.log(`posted_date: ${job.posted_date}`);
      console.log(`description: ${job.description ? job.description.slice(0, 180) + (job.description.length > 180 ? '...' : '') : 'N/A'}`);
    });
    console.log(`\nTotal execution time: ${duration} ms`);
  } catch (error) {
    console.error('Test runner failed:', error);
    process.exit(1);
  }
}

runTest();
