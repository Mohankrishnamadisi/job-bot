const supabase = require('../config/supabase');
const logger = require('../utils/logger');

function buildTitleCompanyKey(job) {
  return `${String(job.title).trim().toLowerCase()}::${String(job.company).trim().toLowerCase()}`;
}

function normalizeJob(job) {
  if (!job || typeof job !== 'object') {
    return null;
  }

  return {
    title: job.title?.trim() || null,
    company: job.company?.trim() || null,
    location: job.location?.trim() || null,
    experience: job.experience || null,
    description: job.description || null,
    applyUrl: job.applyUrl || job.apply_url || null,
  };
}

function validateJob(job) {
  return job && job.title && job.company;
}

function buildDuplicateCondition(jobs) {
  const conditions = [];

  jobs.forEach((job) => {
    if (job.applyUrl) {
      conditions.push(`apply_url.eq.${encodeURIComponent(job.applyUrl)}`);
    }

    if (job.title && job.company) {
      const title = encodeURIComponent(job.title);
      const company = encodeURIComponent(job.company);
      conditions.push(`and(title.eq.${title},company.eq.${company})`);
    }
  });

  return conditions.length ? conditions.join(',') : null;
}

async function fetchExistingJobs(jobs) {
  const conditionString = buildDuplicateCondition(jobs);
  if (!conditionString) {
    return [];
  }

  const { data, error } = await supabase
    .from('jobs')
    .select('id,apply_url,title,company');

  if (error) {
    logger.error(`Error fetching existing jobs for deduplication: ${error.message}`);
    throw error;
  }

  return data || [];
}

async function deduplicateJobs(jobs) {
  const normalizedJobs = jobs
    .map(normalizeJob)
    .filter(validateJob);

  if (normalizedJobs.length === 0) {
    return {
      uniqueJobs: [],
      duplicateJobs: [],
      duplicateCount: 0,
    };
  }

  try {
    logger.info('Checking for duplicate jobs in Supabase');

    const existingJobs = await fetchExistingJobs(normalizedJobs);
    const existingByApplyUrl = new Set(
      existingJobs.filter((row) => row.apply_url).map((row) => row.apply_url)
    );
    const existingByTitleCompany = new Set(
      existingJobs.map((row) => buildTitleCompanyKey(row))
    );

    const uniqueJobs = [];
    const duplicateJobs = [];

    normalizedJobs.forEach((job) => {
      const applyUrlMatch = job.applyUrl && existingByApplyUrl.has(job.applyUrl);
      const titleCompanyMatch = existingByTitleCompany.has(buildTitleCompanyKey(job));

      if (applyUrlMatch || titleCompanyMatch) {
        duplicateJobs.push({
          job,
          reason: applyUrlMatch
            ? 'applyUrl already exists'
            : 'title and company already exists',
        });
      } else {
        uniqueJobs.push(job);
      }
    });

    return {
      uniqueJobs,
      duplicateJobs,
      duplicateCount: duplicateJobs.length,
    };
  } catch (error) {
    logger.error(`Duplicate detection failed: ${error.message}`);
    throw error;
  }
}

module.exports = {
  deduplicateJobs,
};
