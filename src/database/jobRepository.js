const supabase = require('../config/supabase');
const logger = require('../utils/logger');

function normalizeJobPayload(job) {
  if (!job || typeof job !== 'object') {
    return null;
  }

  return {
    title: job.title || job.jobTitle || null,
    company: job.company || null,
    location: job.location || null,
    experience: job.experience || null,
    description: job.description || null,
    apply_url: job.applyUrl || job.apply_url || null,
  };
}

function handleSupabaseError(error) {
  const duplicate = /duplicate|unique constraint|23505/i.test(error?.message || error?.details || '');

  return {
    error,
    conflict: duplicate,
    message: duplicate ? 'Duplicate record detected.' : error.message || 'Supabase request failed.',
  };
}

async function saveJob(job) {
  const payload = normalizeJobPayload(job);

  if (!payload || !payload.title || !payload.company) {
    const error = new Error('Job payload must include at least title and company.');
    logger.warn(error.message);
    return { data: null, error, conflict: false };
  }

  try {
    logger.info('Saving single job to Supabase');
    const { data, error } = await supabase
      .from('jobs')
      .upsert(payload, { onConflict: ['apply_url'], returning: 'representation' });

    if (error) {
      const handled = handleSupabaseError(error);
      logger.error(`saveJob failed: ${handled.message}`);
      return { data: null, error, conflict: handled.conflict };
    }

    return { data: Array.isArray(data) ? data[0] : data, error: null, conflict: false };
  } catch (error) {
    logger.error(`saveJob unexpected error: ${error.message}`);
    return { data: null, error, conflict: false };
  }
}

async function saveJobs(jobs) {
  if (!Array.isArray(jobs) || jobs.length === 0) {
    const error = new Error('Job list must be a non-empty array.');
    logger.warn(error.message);
    return { data: [], error, conflict: false };
  }

  const payloads = jobs
    .map(normalizeJobPayload)
    .filter((job) => job && job.title && job.company && job.apply_url);

  if (payloads.length === 0) {
    const error = new Error('No valid jobs to save.');
    logger.warn(error.message);
    return { data: [], error, conflict: false };
  }

  try {
    logger.info(`Saving ${payloads.length} jobs to Supabase`);
    const { data, error } = await supabase
      .from('jobs')
      .upsert(payloads, { onConflict: ['apply_url'], returning: 'representation' });

    if (error) {
      const handled = handleSupabaseError(error);
      logger.error(`saveJobs failed: ${handled.message}`);
      return { data: [], error, conflict: handled.conflict };
    }

    return { data: data || [], error: null, conflict: false };
  } catch (error) {
    logger.error(`saveJobs unexpected error: ${error.message}`);
    return { data: [], error, conflict: false };
  }
}

async function getJobByApplyUrl(applyUrl) {
  if (!applyUrl) {
    const error = new Error('applyUrl is required.');
    logger.warn(error.message);
    return { data: null, error };
  }

  try {
    const { data, error } = await supabase
      .from('jobs')
      .select('*')
      .eq('apply_url', applyUrl)
      .limit(1)
      .maybeSingle();

    if (error) {
      logger.error(`getJobByApplyUrl failed: ${error.message}`);
      return { data: null, error };
    }

    return { data: data || null, error: null };
  } catch (error) {
    logger.error(`getJobByApplyUrl unexpected error: ${error.message}`);
    return { data: null, error };
  }
}

async function getJobByTitleAndCompany(title, company) {
  if (!title || !company) {
    const error = new Error('Both title and company are required.');
    logger.warn(error.message);
    return { data: null, error };
  }

  try {
    const { data, error } = await supabase
      .from('jobs')
      .select('*')
      .eq('title', title)
      .eq('company', company)
      .limit(1)
      .maybeSingle();

    if (error) {
      logger.error(`getJobByTitleAndCompany failed: ${error.message}`);
      return { data: null, error };
    }

    return { data: data || null, error: null };
  } catch (error) {
    logger.error(`getJobByTitleAndCompany unexpected error: ${error.message}`);
    return { data: null, error };
  }
}

async function updateJob(id, updates = {}) {
  if (!id) {
    const error = new Error('Job id is required for update.');
    logger.warn(error.message);
    return { data: null, error };
  }

  if (!updates || typeof updates !== 'object' || Object.keys(updates).length === 0) {
    const error = new Error('Update payload must contain at least one field.');
    logger.warn(error.message);
    return { data: null, error };
  }

  const payload = normalizeJobPayload(updates);

  try {
    const { data, error } = await supabase
      .from('jobs')
      .update(payload)
      .eq('id', id)
      .select()
      .maybeSingle();

    if (error) {
      logger.error(`updateJob failed: ${error.message}`);
      return { data: null, error };
    }

    return { data: data || null, error: null };
  } catch (error) {
    logger.error(`updateJob unexpected error: ${error.message}`);
    return { data: null, error };
  }
}

async function deleteJob(id) {
  if (!id) {
    const error = new Error('Job id is required for delete.');
    logger.warn(error.message);
    return { data: null, error };
  }

  try {
    const { data, error } = await supabase.from('jobs').delete().eq('id', id).select().maybeSingle();

    if (error) {
      logger.error(`deleteJob failed: ${error.message}`);
      return { data: null, error };
    }

    return { data: data || null, error: null };
  } catch (error) {
    logger.error(`deleteJob unexpected error: ${error.message}`);
    return { data: null, error };
  }
}

module.exports = {
  saveJob,
  saveJobs,
  getJobByApplyUrl,
  getJobByTitleAndCompany,
  updateJob,
  deleteJob,
};
