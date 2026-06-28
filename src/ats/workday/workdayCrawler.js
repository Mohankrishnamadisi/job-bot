'use strict';

const { fetchJobs } = require('./workdayApi');
const { fetchJobDetails } = require('./workdayJobDetails');
const { parseJobs } = require('./workdayParser');

async function crawlCompany(config) {
  const allJobs = [];
  let offset = 0;
  let total = 0;

  const firstResponse = await fetchJobs(config, { offset });
  const firstJobPostings = Array.isArray(firstResponse && firstResponse.jobPostings)
    ? firstResponse.jobPostings
    : [];

  const firstJobs = [];
  for (const jobPosting of firstJobPostings) {
    const detail = await fetchJobDetails(config, jobPosting);
    const mergedJob = detail ? { ...jobPosting, ...detail } : jobPosting;
    firstJobs.push(...parseJobs(mergedJob, config));
  }
  allJobs.push(...firstJobs);

  total = Number(firstResponse && firstResponse.total) || 0;

  while (offset < total) {
    offset += config.pageSize;
    if (offset >= total) break;

    const response = await fetchJobs(config, { offset });
    const jobPostings = Array.isArray(response && response.jobPostings) ? response.jobPostings : [];

    for (const jobPosting of jobPostings) {
      const detail = await fetchJobDetails(config, jobPosting);
      const mergedJob = detail ? { ...jobPosting, ...detail } : jobPosting;
      allJobs.push(...parseJobs(mergedJob, config));
    }
  }

  return allJobs;
}

module.exports = {
  crawlCompany,
};
