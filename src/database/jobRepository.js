'use strict';

const supabase = require('./supabaseClient');
const logger = require('../utils/logger');
const { getCompanyByName, ensureCompany } = require('./companyRepository');

const REQUIRED_JOB_COLUMNS = ['company_id', 'title', 'apply_url'];

function normalizeJobPayload(job) {
  if (!job || typeof job !== 'object') return null;

  return {
    company_id: job.company_id || null,
    title: job.title || null,
    location: job.location || null,
    experience: job.experience || null,
    employment_type: job.employment_type || null,
    work_mode: job.work_mode || null,
    salary: job.salary || null,
    description: job.description || null,
    summary: job.summary || null,
    skills: job.skills || null,
    apply_url: job.apply_url || null,
    source: job.source || 'ATS',
    posted_date: job.posted_date || null,
    expiry_date: job.expiryDate || job.expiry_date || null,
    status: job.status || 'active',
    is_active: job.is_active !== false,
    external_job_id: job.external_job_id || job.positionId || job.position_id || null,
  };
}

async function resolveCompanyIdForJob(job, repository = { getCompanyByName, ensureCompany }) {
  if (!job || typeof job !== 'object') {
    return null;
  }

  if (job.company_id) {
    return job.company_id;
  }

  const companyName = String(job.company || job.company_name || job.source || '').trim();
  if (!companyName) {
    logger.warn('Company resolution skipped because no company name was available');
    return null;
  }

  const existingCompany = await repository.getCompanyByName(companyName);
  if (existingCompany?.id) {
    logger.info(`Company Found: ${companyName} -> ${existingCompany.id}`);
    return existingCompany.id;
  }

  const createdCompany = await repository.ensureCompany({
    name: companyName,
    enabled: true,
    career_url: null,
  });

  if (createdCompany?.id) {
    logger.info(`Company Created: ${companyName} -> ${createdCompany.id}`);
    return createdCompany.id;
  }

  logger.warn(`Company resolution failed for ${companyName}`);
  return null;
}

async function prepareJobsForInsert(jobs) {
  const preparedJobs = [];
  const inputJobs = Array.isArray(jobs) ? jobs : [];

  for (const job of inputJobs) {
    const normalizedJob = normalizeJobPayload(job);
    if (!normalizedJob) {
      continue;
    }

    if (!normalizedJob.company_id) {
      const companyId = await resolveCompanyIdForJob(job);
      if (companyId) {
        normalizedJob.company_id = companyId;
      } else {
        continue;
      }
    }

    const missingColumns = REQUIRED_JOB_COLUMNS.filter((column) => {
      const value = normalizedJob[column];
      return value == null || (typeof value === 'string' && value.trim() === '');
    });

    if (missingColumns.length > 0) {
      continue;
    }

    preparedJobs.push(normalizedJob);
  }

  return preparedJobs;
}

async function insertJobs(jobs) {
  const preparedJobs = await prepareJobsForInsert(jobs);

  if (!preparedJobs.length) {
    return { data: [], error: null, stats: { fetched: Array.isArray(jobs) ? jobs.length : 0, prepared: 0, inserted: 0, skippedDuplicates: 0, failed: 0 } };
  }

  try {
    const { data, error } = await supabase
      .from('jobs')
      .upsert(preparedJobs, { onConflict: 'apply_url' })
      .select('id,apply_url');

    if (error) {
      logger.error(`Jobs insert failed: ${error.message}`);
      if (error.details) {
        logger.error(`Jobs insert details: ${error.details}`);
      }
      return {
        data: null,
        error,
        stats: {
          fetched: Array.isArray(jobs) ? jobs.length : 0,
          prepared: preparedJobs.length,
          inserted: 0,
          skippedDuplicates: 0,
          failed: preparedJobs.length,
        },
      };
    }

    const insertedRows = Array.isArray(data) ? data : [];
    const insertedApplyUrls = new Set(insertedRows.map((row) => row?.apply_url).filter(Boolean));
    const skippedDuplicates = preparedJobs.filter((job) => !insertedApplyUrls.has(job.apply_url)).length;

    return {
      data: insertedRows,
      error: null,
      stats: {
        fetched: Array.isArray(jobs) ? jobs.length : 0,
        prepared: preparedJobs.length,
        inserted: insertedRows.length,
        skippedDuplicates,
        failed: 0,
      },
    };
  } catch (error) {
    logger.error(`Jobs insert failed: ${error.message}`);
    return {
      data: null,
      error,
      stats: {
        fetched: Array.isArray(jobs) ? jobs.length : 0,
        prepared: preparedJobs.length,
        inserted: 0,
        skippedDuplicates: 0,
        failed: preparedJobs.length,
      },
    };
  }
}

async function upsertJobs(jobs) {
  const preparedJobs = await prepareJobsForInsert(jobs);
  return supabase.from('jobs').upsert(preparedJobs);
}

async function deleteExpiredJobs(companyId) {
  return supabase.from('jobs').delete().eq('company_id', companyId);
}

async function getJobsBySourceAndApplyUrls(source, applyUrls) {
  if (!Array.isArray(applyUrls) || applyUrls.length === 0) {
    return { data: [] };
  }

  const { data, error } = await supabase
    .from('jobs')
    .select('*')
    .eq('source', source)
    .in('apply_url', applyUrls);

  return { data: data || [], error };
}

async function getAllJobsBySource(source) {
  const { data, error } = await supabase
    .from('jobs')
    .select('*')
    .eq('source', source);

  return { data: data || [], error };
}

async function saveJobs(jobs) {
  const filteredJobs = (jobs || []).filter(Boolean);
  return insertJobs(filteredJobs);
}

async function updateJobs(jobs) {
  const preparedJobs = await prepareJobsForInsert(jobs);
  const { data, error } = await supabase.from('jobs').upsert(preparedJobs);
  return { data, error };
}

async function markJobsInactive(jobIds) {
  if (!Array.isArray(jobIds) || jobIds.length === 0) {
    return { data: [], error: null };
  }

  const { data, error } = await supabase
    .from('jobs')
    .update({ is_active: false })
    .in('id', jobIds);

  return { data: data || [], error };
}

module.exports = {
  insertJobs,
  upsertJobs,
  deleteExpiredJobs,
  getJobsBySourceAndApplyUrls,
  getAllJobsBySource,
  saveJobs,
  updateJobs,
  markJobsInactive,
  resolveCompanyIdForJob,
};
