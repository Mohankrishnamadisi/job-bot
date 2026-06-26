const supabase = require('../config/supabase');
const logger = require('../utils/logger');

function normalizeTimestamp(value) {
  if (value == null) return null;
  if (value instanceof Date) return value.toISOString();

  const asNumber = typeof value === 'number' ? value : Number(String(value).trim());
  const isNumericString = typeof value === 'string' && /^[0-9]+$/.test(value.trim());

  if (typeof asNumber === 'number' && Number.isFinite(asNumber)) {
    if (asNumber >= 0 && asNumber < 1e12) {
      return new Date(asNumber * 1000).toISOString();
    }
    return new Date(asNumber).toISOString();
  }

  if (typeof value === 'string') {
    const parsed = Date.parse(value);
    if (!Number.isNaN(parsed)) {
      return new Date(parsed).toISOString();
    }
  }

  return null;
}

const companyIdCache = new Map();

function normalizeCompanyText(value) {
  if (!value) return null;
  const normalized = String(value).trim();
  return normalized.length === 0 ? null : normalized;
}

function getCompanyCacheKey(source, name) {
    const normalizedName = normalizeCompanyText(name) || "";
    return normalizedName.toLowerCase();
}

async function findOrCreateCompanyId(source, name) {
  const companySource = normalizeCompanyText(source) || null;
  const companyName = normalizeCompanyText(name || source) || null;

  if (!companyName) {
    return null;
  }

  const cacheKey = getCompanyCacheKey(companySource, companyName);
  if (companyIdCache.has(cacheKey)) {
    return companyIdCache.get(cacheKey);
  }

  try {
    const { data: existing, error: lookupError } = await supabase
      .from('companies')
      .select('id')
      .eq('name', companyName)
      .maybeSingle();

    if (lookupError) {
      logger.error(`Company lookup failed for ${companySource}/${companyName}: ${lookupError.message}`);
    }

    let companyId = existing?.id || null;

    if (!companyId) {
      const { data: inserted, error: insertError } = await supabase
        .from('companies')
        .insert([{ name: companyName }])
        .select('id')
        .maybeSingle();

      if (insertError) {
        logger.error(`Company insert failed for ${companySource}/${companyName}: ${insertError.message}`);
      }

      companyId = inserted?.id || null;
    }

    if (companyId) {
      companyIdCache.set(cacheKey, companyId);
    }

    return companyId;
  } catch (error) {
    logger.error(`findOrCreateCompanyId unexpected failure for ${companySource}/${companyName}: ${error.message}`);
    return null;
  }
}

function normalizeJobPayload(job, companyId = null) {
  if (!job || typeof job !== 'object') return null;

  const payload = {
    title: job.title || null,
    location: job.location || null,
    experience: job.experience || null,
    employment_type: job.employment_type || job.employmentType || null,
    work_mode: job.work_mode || job.workMode || job.work_type || null,
    salary: job.salary || null,
    description: job.description || null,
    summary: job.summary || null,
    skills: job.skills || null,
    apply_url: job.apply_url || job.applyUrl || null,
    source: job.source || null,
    company_id: companyId || job.company_id || null,
    posted_date: normalizeTimestamp(job.posted_date || job.postedDate || null),
    expiry_date: normalizeTimestamp(job.expiry_date || job.expiryDate || null),
    status: job.status || null,
    is_active: job.is_active != null ? job.is_active : job.isActive != null ? job.isActive : true,
  };

  return payload;
}

function handleSupabaseError(error) {
  const duplicate = /duplicate|unique constraint|23505/i.test(error?.message || error?.details || '');
  return {
    error,
    conflict: duplicate,
    message: duplicate ? 'Duplicate record detected.' : error.message || 'Supabase request failed.',
  };
}

async function saveJobs(jobs) {
  if (!Array.isArray(jobs) || jobs.length === 0) {
    const error = new Error('Job list must be a non-empty array.');
    logger.warn(error.message);
    return { data: [], error, conflict: false };
  }

  const companyKeys = jobs.map((job) => {
    const source = normalizeCompanyText(job.source) || null;
    const name = normalizeCompanyText(job.company) || normalizeCompanyText(job.companyName) || normalizeCompanyText(job.company_name) || source;
    return {
      key: getCompanyCacheKey(source, name),
      source,
      name,
    };
  });

  const companyIds = {};
  for (const companyInfo of companyKeys) {
    if (!companyInfo.name) {
      continue;
    }

    if (!companyIds[companyInfo.key]) {
      companyIds[companyInfo.key] = await findOrCreateCompanyId(companyInfo.source, companyInfo.name);
    }
  }

  const payloads = jobs
    .map((job, index) => {
      const companyId = companyIds[companyKeys[index].key] || null;
      return normalizeJobPayload(job, companyId);
    })
    .filter((p) => p && p.apply_url && p.company_id);

  if (payloads.length === 0) {
    const error = new Error('No valid jobs to save.');
    logger.warn(error.message);
    return { data: [], error, conflict: false };
  }

  try {
    logger.info(`Upserting ${payloads.length} jobs to Supabase`);
    const { data, error } = await supabase.from('jobs').upsert(payloads, {
      onConflict: ['apply_url'],
      returning: 'representation',
    });

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

async function getJobsByApplyUrls(applyUrls) {
  if (!Array.isArray(applyUrls) || applyUrls.length === 0) {
    return { data: [], error: null };
  }

  const batchSize = 100;
  const rows = [];

  for (let i = 0; i < applyUrls.length; i += batchSize) {
    const chunk = applyUrls.slice(i, i + batchSize);
    const { data, error } = await supabase
      .from('jobs')
      .select('id,apply_url,source,title,description,location,experience,employment_type,work_mode,salary,summary,skills,posted_date,expiry_date,status,is_active')
      .in('apply_url', chunk);

    if (error) {
      logger.error(`getJobsByApplyUrls failed: ${error.message}`);
      return { data: [], error };
    }

    rows.push(...(data || []));
  }

  return { data: rows, error: null };
}

async function getJobsBySourceAndApplyUrls(source, applyUrls) {
  if (!source || !Array.isArray(applyUrls) || applyUrls.length === 0) {
    return { data: [], error: null };
  }

  const batchSize = 100;
  const rows = [];

  for (let i = 0; i < applyUrls.length; i += batchSize) {
    const chunk = applyUrls.slice(i, i + batchSize);
    const { data, error } = await supabase
      .from('jobs')
      .select('*')
      .eq('source', source)
      .in('apply_url', chunk);

    if (error) {
      logger.error(`getJobsBySourceAndApplyUrls failed: ${error.message}`);
      return { data: [], error };
    }

    rows.push(...(data || []));
  }

  return { data: rows, error: null };
}

async function getAllJobsBySource(source) {
  if (!source) {
    return { data: [], error: null };
  }

  try {
    const { data, error } = await supabase.from('jobs').select('*').eq('source', source);
    if (error) {
      logger.error(`getAllJobsBySource failed: ${error.message}`);
      return { data: [], error };
    }

    return { data: data || [], error: null };
  } catch (error) {
    logger.error(`getAllJobsBySource unexpected error: ${error.message}`);
    return { data: [], error };
  }
}

async function updateJob(id, updates = {}) {
  if (!id) {
    return { data: null, error: new Error('Job id is required for update.') };
  }

  if (!updates || typeof updates !== 'object' || Object.keys(updates).length === 0) {
    return { data: null, error: new Error('Update payload must contain at least one field.') };
  }

  const payload = normalizeJobPayload(updates);

  try {
    const { data, error } = await supabase.from('jobs').update(payload).eq('id', id).select().maybeSingle();
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

async function updateJobs(jobs) {
  const results = [];

  for (const job of jobs) {
    if (!job.id) continue;
    const res = await updateJob(job.id, job);
    results.push({ id: job.id, res });
  }

  return results;
}

async function markJobsInactive(source, applyUrls) {
  if (!source || !Array.isArray(applyUrls) || applyUrls.length === 0) {
    return { data: [], error: null };
  }

  try {
    const { data, error } = await supabase
      .from('jobs')
      .update({ is_active: false })
      .eq('source', source)
      .in('apply_url', applyUrls)
      .select();

    if (error) {
      logger.error(`markJobsInactive failed: ${error.message}`);
      return { data: [], error };
    }

    return { data: data || [], error: null };
  } catch (error) {
    logger.error(`markJobsInactive unexpected error: ${error.message}`);
    return { data: [], error };
  }
}

module.exports = {
  saveJobs,
  getJobsByApplyUrls,
  getJobsBySourceAndApplyUrls,
  getAllJobsBySource,
  updateJob,
  updateJobs,
  markJobsInactive,
};

