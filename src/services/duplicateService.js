const supabase = require('../config/supabase');
const logger = require('../utils/logger');

function normalizeJob(job) {
  if (!job || typeof job !== 'object') {
    return null;
  }

  return {
    title: job.title?.trim() || null,
    location: job.location?.trim() || null,
    experience: job.experience || null,
    description: job.description || null,
    applyUrl: job.applyUrl || job.apply_url || null,
    source: job.source || null,
  };
}

function validateJob(job) {
  return job && job.applyUrl;
}

async function fetchExistingJobs(jobs) {
  const applyUrls = [];

  jobs.forEach((job) => {
    if (job.applyUrl) {
      applyUrls.push(job.applyUrl);
    }
  });

  if (!applyUrls.length) {
    return [];
  }

  const chunks = [];
  const batchSize = 100;
  for (let i = 0; i < applyUrls.length; i += batchSize) {
    chunks.push(applyUrls.slice(i, i + batchSize));
  }

  const rows = [];

  for (const chunk of chunks) {
    const { data, error } = await supabase
      .from('jobs')
      .select('id,apply_url,source')
      .in('apply_url', chunk);

    if (error) {
      logger.error(`Error fetching existing jobs for deduplication: ${error.message}`);
      throw error;
    }

    rows.push(...(data || []));
  }

  return rows;
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

    const uniqueJobs = [];
    const duplicateJobs = [];

    normalizedJobs.forEach((job) => {
      const applyUrlMatch = job.applyUrl && existingByApplyUrl.has(job.applyUrl);

      if (applyUrlMatch) {
        duplicateJobs.push({
          job,
          reason: 'applyUrl already exists',
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
