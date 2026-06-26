const supabase = require('../config/supabase');
const logger = require('../utils/logger');

async function insertJobs(jobs) {
  if (!Array.isArray(jobs) || jobs.length === 0) {
    logger.warn('No jobs to insert');
    return [];
  }

  try {
    logger.info(`Inserting ${jobs.length} jobs into Supabase`);
    const { data, error } = await supabase.from('jobs').upsert(jobs, {
      onConflict: ['title', 'company', 'location'],
    });

    if (error) {
      throw error;
    }

    return data;
  } catch (error) {
    logger.error(`Failed to insert jobs: ${error.message}`);
    throw new Error('Database insert failed');
  }
}

async function fetchRecentJobs(limit = 50) {
  try {
    const { data, error } = await supabase.from('jobs').select('*').order('created_at', { ascending: false }).limit(limit);

    if (error) {
      throw error;
    }

    return data || [];
  } catch (error) {
    logger.error(`Failed to fetch recent jobs: ${error.message}`);
    throw error;
  }
}

module.exports = {
  insertJobs,
  fetchRecentJobs,
};
