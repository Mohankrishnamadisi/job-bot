const axios = require('axios');
const logger = require('../utils/logger');
const {
  getJobsBySourceAndApplyUrls,
  saveJobs,
  updateJobs,
  markJobsInactive,
  getAllJobsBySource,
} = require('../database/jobRepository');
const { ensureCompany } = require('../database/companyRepository');
const {
  delay,
  parseEmploymentType,
  extractExperience,
  extractSalary,
  extractWorkMode,
  chunkArray,
} = require('../parsers/common/jobHelpers');
const { shouldSaveJob } = require('../parsers/common/jobFilters');
const {
  findJobsForSync,
  buildJobUpdates,
  saveNewJobs,
  updateExistingJobs,
  markRemovedJobs,
} = require('../parsers/common/jobSyncService');

const SOURCE = 'Accenture';
const SEARCH_ENDPOINT = 'https://www.accenture.com/api/accenture/elastic/findjobs';
const DEFAULT_MAX_RESULT_SIZE = 12;
const SEARCH_RETRY_MAX = 3;
const SEARCH_RETRY_BASE_MS = 1000;

function parseRetryAfter(headerValue) {
  if (!headerValue) return null;
  const seconds = parseInt(headerValue, 10);
  if (!Number.isNaN(seconds) && seconds > 0) return seconds * 1000;
  const timestamp = Date.parse(headerValue);
  if (!Number.isNaN(timestamp)) return Math.max(timestamp - Date.now(), 0);
  return null;
}

function normalizePostedDate(value) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
}

function buildFormData(startIndex, maxResultSize) {
  const FormData = require('form-data');
  const form = new FormData();

  form.append('startIndex', String(startIndex));
  form.append('maxResultSize', String(maxResultSize));
  form.append('jobKeyword', '');
  form.append('jobCountry', 'India');
  form.append('jobLanguage', 'en');
  form.append('countrySite', 'in-en');
  form.append('sortBy', '2');
  form.append('searchType', 'vectorSearch');
  form.append('enableQueryBoost', 'true');
  form.append('minScore', '0.6');
  form.append('getFeedbackJudgmentEnabled', 'true');
  form.append('useCleanEmbedding', 'true');
  form.append('score', 'true');
  form.append('totalHits', 'true');
  form.append('debugQuery', 'false');
  form.append('jobFilters', '[]');

  return form;
}

function buildJobUrl(rawUrl, countrySite = 'in-en') {
  if (!rawUrl) return null;

  const url = String(rawUrl).trim();
  if (!url) return null;
  if (url.includes('{0}')) {
    return url.replace(/\{0\}/g, countrySite);
  }
  if (url.startsWith('http')) {
    return url;
  }

  return `https://www.accenture.com${url}`;
}

function normalizeJob(job) {
  if (!job || typeof job !== 'object') return null;

  const jobUrl = buildJobUrl(job.jobDetailUrl, job.countrySite || 'in-en');

  const description = job.jobDescriptionClean || job.description || job.jobDescription || null;
  const experience = job.yearsOfExperience || extractExperience(description || '') || null;
  const skills = Array.isArray(job.workdaySkill)
    ? job.workdaySkill.filter(Boolean)
    : (job.workdaySkill ? [job.workdaySkill] : []);

  return {
    positionId: job.requisitionId || job.requisition_id || job.id || null,
    title: job.title || null,
    source: SOURCE,
    location: job.location || job.feedCity || job.city || null,
    country: job.country || null,
    work_mode: extractWorkMode(`${job.remoteType || ''}\n${description || ''}`),
    posted_date: normalizePostedDate(job.updateDate || job.postedDateText || job.postedDate || null),
    description,
    apply_url: jobUrl,
    employment_type: parseEmploymentType(job.employeeType || null),
    experience,
    salary: extractSalary(description || ''),
    skills,
    career_level: job.careerLevel || null,
    category: job.areaOfInterest || null,
    remote_type: job.remoteType || null,
    company: 'Accenture',
    status: 'open',
    is_active: true,
  };
}

function extractJobs(responseData) {
  if (!responseData || typeof responseData !== 'object') return [];

  const jobs = responseData.data || responseData.jobs || [];
  if (!Array.isArray(jobs)) return [];

  return jobs.map((job) => normalizeJob(job)).filter(Boolean);
}

async function fetchSearchPage(startIndex, maxResultSize) {
  const form = buildFormData(startIndex, maxResultSize);
  const response = await axios.post(SEARCH_ENDPOINT, form, {
    headers: {
      ...form.getHeaders(),
      Accept: 'application/json, text/plain, */*',
      'User-Agent': 'Mozilla/5.0',
    },
    timeout: 60000,
  });

  return response.data;
}

async function fetchSearchPageWithRetries(startIndex, maxResultSize) {
  for (let attempt = 1; attempt <= SEARCH_RETRY_MAX; attempt += 1) {
    try {
      const data = await fetchSearchPage(startIndex, maxResultSize);
      return { data, error: null };
    } catch (error) {
      const status = error?.response?.status;
      const retryAfterMs = parseRetryAfter(error?.response?.headers?.['retry-after']);

      if (status === 429) {
        const waitMs = retryAfterMs != null ? retryAfterMs : SEARCH_RETRY_BASE_MS * Math.pow(2, attempt - 1);
        logger.warn(`Accenture waiting ${Math.round(waitMs / 1000)} seconds due to rate limit...`);
        await delay(waitMs);
        logger.info('Accenture retrying page...');
        if (attempt >= SEARCH_RETRY_MAX) {
          return { data: null, error };
        }
        continue;
      }

      return { data: null, error };
    }
  }

  return { data: null, error: new Error('Accenture search page retry limit exceeded') };
}

async function fetchAllSearchJobs(fullSync = false) {
  const allJobs = [];
  const seen = new Set();
  let startIndex = 0;
  let page = 1;
  let totalCount = -1;
  const pageLimit = fullSync ? Number.MAX_SAFE_INTEGER : 10;

  while (page <= pageLimit) {
    const { data, error } = await fetchSearchPageWithRetries(startIndex, DEFAULT_MAX_RESULT_SIZE);
    if (error) {
      logger.warn(`Accenture skipped page ${page} after repeated search failures.`);
      break;
    }

    const pageJobs = extractJobs(data);
    logger.info(`Accenture page ${page} returned ${pageJobs.length} jobs.`);

    if (!pageJobs.length) break;

    const uniquePageJobs = pageJobs.filter((job) => {
      const key = job.apply_url || job.positionId || job.title;
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    allJobs.push(...uniquePageJobs);

    const hits = data?.totalHits || data?.totalHitsCount || data?.total_hits || null;
    if (hits != null) {
      totalCount = Number(hits);
      if (allJobs.length >= totalCount) break;
    }

    if (uniquePageJobs.length < DEFAULT_MAX_RESULT_SIZE) break;

    startIndex += DEFAULT_MAX_RESULT_SIZE;
    page += 1;
  }

  return {
    allJobs,
    pageCount: page,
    totalCount: totalCount >= 0 ? totalCount : allJobs.length,
  };
}

async function scrapeAccentureJobs(query = '', location = '', fullSync = false, options = {}) {
  const dryRun = options?.dryRun === true || process.env.ACCENTURE_DRY_RUN === 'true';
  logger.info('Scraping started');
  const { allJobs, pageCount, totalCount } = await fetchAllSearchJobs(fullSync);

  logger.info(`Jobs fetched: ${allJobs.length}`);

  if (dryRun) {
    logger.info('Accenture dry run enabled; skipping database writes.');
    return {
      result: allJobs.filter((job) => shouldSaveJob(job)),
      stats: {
        pageCount,
        totalCount,
        totalFound: allJobs.length,
        newCount: allJobs.length,
        updatedCount: 0,
        removedCount: 0,
      },
    };
  }

  const company = await ensureCompany({ name: 'Accenture' });

  if (!company) {
    throw new Error('ensureCompany returned no company row for Accenture');
  }

  const applyUrls = allJobs.map((job) => job.apply_url).filter(Boolean);
  const existingResp = await getJobsBySourceAndApplyUrls(SOURCE, applyUrls);
  const existingRows = existingResp.data || [];

  const allSourceResp = await getAllJobsBySource(SOURCE);
  const allSourceRows = allSourceResp.data || [];

  const { newJobs, existingMatches, removedRows, removedApplyUrls } = findJobsForSync(allJobs, existingRows, allSourceRows);

  logger.info(`Accenture found ${newJobs.length} new, ${existingMatches.length} existing, ${removedRows.length} removed (source total ${allSourceRows.length})`);

  let enrichmentSummary = { enriched: [], success: 0, failed: 0, skipped: 0 };
  try {
    const enrichedJobs = newJobs.filter((job) => shouldSaveJob(job));
    enrichmentSummary = {
      enriched: enrichedJobs,
      success: enrichedJobs.length,
      failed: 0,
      skipped: 0,
    };

    if (enrichmentSummary.enriched.length) {
      await saveNewJobs(enrichmentSummary, saveJobs, logger);
    }
  } catch (error) {
    logger.error(`Accenture enrichment failed: ${error.message}`);
  }

  const updates = buildJobUpdates(existingMatches);
  await updateExistingJobs(updates, updateJobs, logger);
  await markRemovedJobs(removedRows, markJobsInactive, logger, SOURCE);

  logger.info(`Search pages: ${pageCount}`);
  logger.info(`Total jobs: ${allJobs.length}`);
  logger.info(`New jobs: ${enrichmentSummary.enriched.length}`);

  const enrichedMap = new Map((enrichmentSummary.enriched || []).map((job) => [job.apply_url, job]));
  const result = allJobs.map((job) => enrichedMap.get(job.apply_url) || job);
  const filteredResult = result.filter((job) => shouldSaveJob(job));

  return {
    result: filteredResult,
    stats: {
      pageCount,
      totalCount,
      totalFound: allJobs.length,
      newCount: newJobs.length,
      updatedCount: updates.length,
      removedCount: removedApplyUrls.length,
    },
  };
}

module.exports = {
  scrapeAccentureJobs,
};
