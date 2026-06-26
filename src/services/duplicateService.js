const logger = require('../utils/logger');

function removeDuplicateJobs(jobs) {
  const seen = new Map();

  return jobs.filter((job) => {
    const key = `${job.title}:${job.company}:${job.location}`.toLowerCase();
    if (seen.has(key)) {
      return false;
    }

    seen.set(key, true);
    return true;
  });
}

function validateJobs(jobs) {
  return jobs.filter((job) => job.title && job.company && job.location);
}

async function deduplicateAndValidate(jobs) {
  try {
    logger.info('Deduplicating and validating jobs');
    const validJobs = validateJobs(jobs);
    return removeDuplicateJobs(validJobs);
  } catch (error) {
    logger.error(`Duplicate service failed: ${error.message}`);
    throw error;
  }
}

module.exports = {
  deduplicateAndValidate,
};
