const axios = require('axios');
const logger = require('../utils/logger');
const {
  getJobsBySourceAndApplyUrls,
  saveJobs,
  updateJobs,
  markJobsInactive,
  getAllJobsBySource,
} = require('../database/jobRepository');

const SEARCH_ENDPOINT = 'https://apply.careers.microsoft.com/api/pcsx/search';
const DETAILS_ENDPOINT = 'https://apply.careers.microsoft.com/api/pcsx/position_details';
const DOMAIN = 'microsoft.com';
const DEFAULT_LIMIT = 20;
const MAX_SEARCH_PAGES = 2;
const SEARCH_RETRY_MAX = 5;
const SEARCH_RETRY_BASE_MS = 1000;
const SEARCH_DELAY_MIN_MS = 1000;
const SEARCH_DELAY_MAX_MS = 2000;
const DETAIL_CONCURRENCY = 2;
const DETAIL_DELAY_MIN_MS = 300;
const DETAIL_DELAY_MAX_MS = 500;
const DETAIL_RETRY_MAX = 3;
const DETAIL_RETRY_BASE_MS = 3000;
const SOURCE = 'Microsoft';

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function parseRetryAfter(headerValue) {
  if (!headerValue) return null;
  const seconds = parseInt(headerValue, 10);
  if (!Number.isNaN(seconds) && seconds > 0) return seconds * 1000;
  const timestamp = Date.parse(headerValue);
  if (!Number.isNaN(timestamp)) return Math.max(timestamp - Date.now(), 0);
  return null;
}

function normalizeJob(position) {
  const positionId = position.position_id || position.id || null;
  const title = position.title || position.name || null;
  const location = Array.isArray(position.locations) ? position.locations[0] : position.location || null;
  const workType = position.work_type || position.workLocationOption || null;
  const postedDate = position.posted_date || position.postedTs || null;
  const positionUrl = position.positionUrl || position.position_url || position.offsetUrl || null;
  const applyUrl = positionUrl ? `https://apply.careers.microsoft.com${positionUrl}` : null;

  return {
    positionId,
    title,
    source: SOURCE,
    location,
    work_mode: workType,
    posted_date: postedDate,
    description: null,
    apply_url: applyUrl,
    status: 'open',
    is_active: true,
  };
}

function normalizeDetails(data) {
  if (!data || typeof data !== 'object') return {};
  return {
    description: data.jobDescription || data.job_description || data.description || null,
    publicUrl: data.publicUrl || data.public_url || null,
  };
}

function extractPositions(responseData) {
  if (!responseData || typeof responseData !== 'object') return [];
  const positions = responseData.data?.positions || responseData.positions || [];
  return Array.isArray(positions) ? positions : [];
}

async function fetchSearchPage(start, limit, query = '', location = '') {
  const response = await axios.get(SEARCH_ENDPOINT, {
    params: { domain: DOMAIN, query, location, start, limit },
    headers: { Accept: 'application/json, text/javascript, */*; q=0.01' },
    timeout: 60000,
  });
  return response.data;
}

async function fetchSearchPageWithRetries(start, limit, query = '', location = '') {
  for (let attempt = 1; attempt <= SEARCH_RETRY_MAX; attempt += 1) {
    try {
      const data = await fetchSearchPage(start, limit, query, location);
      return { data, error: null };
    } catch (err) {
      const status = err?.response?.status;
      const retryAfterMs = parseRetryAfter(err?.response?.headers?.['retry-after']);

      if (status === 429) {
        const waitMs = retryAfterMs != null ? retryAfterMs : SEARCH_RETRY_BASE_MS * Math.pow(2, attempt - 1);
        logger.warn(`Waiting ${Math.round(waitMs / 1000)} seconds due to rate limit...`);
        await delay(waitMs);
        logger.info('Retrying page...');
        if (attempt >= SEARCH_RETRY_MAX) {
          return { data: null, error: err };
        }
        continue;
      }

      return { data: null, error: err };
    }
  }

  return { data: null, error: new Error('Search page retry limit exceeded') };
}

async function fetchPositionDetailsWithRetries(positionId) {
  if (!positionId) return { error: 'no-id' };

  for (let attempt = 1; attempt <= DETAIL_RETRY_MAX; attempt += 1) {
    try {
      const res = await axios.get(DETAILS_ENDPOINT, {
        params: { position_id: positionId, domain: DOMAIN, hl: 'en' },
        headers: { Accept: 'application/json, text/javascript, */*; q=0.01' },
        timeout: 60000,
      });

      return { data: res.data, error: null };
    } catch (err) {
      const status = err?.response?.status;

      if (status === 403) {
        return { data: null, error: { code: 403, message: 'Forbidden' } };
      }

      if (status === 429) {
        const retryAfterMs = parseRetryAfter(err.response?.headers?.['retry-after']);
        const backoff = retryAfterMs != null ? retryAfterMs : DETAIL_RETRY_BASE_MS * Math.pow(2, attempt - 1);
        if (attempt >= DETAIL_RETRY_MAX) {
          return { data: null, error: { code: 429, message: 'Too Many Requests' } };
        }
        await delay(backoff);
        continue;
      }

      return { data: null, error: { code: status || 0, message: err.message || 'unknown' } };
    }
  }

  return { data: null, error: { code: 0, message: 'max retries reached' } };
}

function chunkArray(array, size) {
  const chunks = [];
  for (let i = 0; i < array.length; i += size) chunks.push(array.slice(i, i + size));
  return chunks;
}

async function fetchAllSearchJobs(query = '', location = '', fullSync = false) {
  const allJobs = [];
  const seen = new Set();
  let start = 0;
  let page = 1;
  let pageSize = 0;
  let totalCount = -1;
  const pageLimit = fullSync ? Number.MAX_SAFE_INTEGER : MAX_SEARCH_PAGES;
  const pageLimitLabel = fullSync ? 'full' : MAX_SEARCH_PAGES;

  while (page <= pageLimit) {
    const { data, error } = await fetchSearchPageWithRetries(start, DEFAULT_LIMIT, query, location);
    if (error) {
      logger.warn(`Skipping page ${page} after repeated search failures.`);
      break;
    }

    const positions = extractPositions(data);
    if (page === 1) {
      totalCount = Number(data.data?.count ?? data.count ?? -1);
      pageSize = positions.length;
    }

    if (!positions.length) {
      logger.info(`No jobs found on page ${page}. Ending search.`);
      break;
    }

    const jobs = positions.map(normalizeJob).filter((j) => j.positionId && j.title && j.apply_url);
    jobs.forEach((j) => {
      if (!seen.has(j.apply_url)) {
        seen.add(j.apply_url);
        allJobs.push(j);
      }
    });

    logger.info(`Downloaded page ${page}/${pageLimitLabel}`);

    if (pageSize === 0 || (totalCount > 0 && start + pageSize >= totalCount)) {
      break;
    }

    await delay(Math.floor(Math.random() * (SEARCH_DELAY_MAX_MS - SEARCH_DELAY_MIN_MS + 1)) + SEARCH_DELAY_MIN_MS);
    start += pageSize;
    page += 1;
  }

  logger.info('Finished search successfully.');
  logger.info(`Search pages: ${page - 1}`);
  logger.info(`Total search jobs: ${allJobs.length}`);
  return { allJobs, pageCount: page - 1, totalCount };
}

async function enrichOnlyNewJobs(allJobs) {
  const applyUrls = allJobs.map((j) => j.apply_url).filter(Boolean);
  const existing = await getJobsBySourceAndApplyUrls(SOURCE, applyUrls);
  const existingUrls = new Set((existing.data || []).map((r) => r.apply_url));

  const newJobs = allJobs.filter((j) => !existingUrls.has(j.apply_url));
  logger.info(`New jobs to enrich: ${newJobs.length}`);

  if (!newJobs.length) return { enriched: [], success: 0, failed: 0, skipped: allJobs.length };

  const chunks = chunkArray(newJobs, DETAIL_CONCURRENCY);
  const enriched = [];
  let success = 0;
  let failed = 0;
  let fetched = 0;

  for (const chunk of chunks) {
    const promises = chunk.map(async (job) => {
      await delay(Math.floor(Math.random() * (DETAIL_DELAY_MAX_MS - DETAIL_DELAY_MIN_MS + 1)) + DETAIL_DELAY_MIN_MS);
      const { data, error } = await fetchPositionDetailsWithRetries(job.positionId);
      fetched += 1;
      logger.info(`Downloaded details ${fetched}/${newJobs.length}`);

      if (error) {
        failed += 1;
        return job;
      }

      const details = normalizeDetails(data.data || data);
      success += 1;
      return {
        ...job,
        description: details.description || job.description,
        apply_url: details.publicUrl || job.apply_url,
      };
    });

    const results = await Promise.all(promises);
    enriched.push(...results);
  }

  return { enriched, success, failed, skipped: allJobs.length - newJobs.length };
}

async function scrapeMicrosoftJobs(query = '', location = '', fullSync = false) {
  const { allJobs, pageCount, totalCount } = await fetchAllSearchJobs(query, location, fullSync);

  const applyUrls = allJobs.map((j) => j.apply_url).filter(Boolean);
  const applyUrlSet = new Set(applyUrls);

  const existingResp = await getJobsBySourceAndApplyUrls(SOURCE, applyUrls);
  const existingRows = existingResp.data || [];
  const existingMap = new Map(existingRows.map((r) => [r.apply_url, r]));

  const allSourceResp = await getAllJobsBySource(SOURCE);
  const allSourceRows = allSourceResp.data || [];

  const newJobs = allJobs.filter((j) => !existingMap.has(j.apply_url));
  const existingMatches = allJobs
    .filter((j) => existingMap.has(j.apply_url))
    .map((j) => ({ db: existingMap.get(j.apply_url), search: j }));
  const removedRows = allSourceRows.filter((r) => !applyUrlSet.has(r.apply_url));

  logger.info(`Found ${newJobs.length} new, ${existingMatches.length} existing, ${removedRows.length} removed (source total ${allSourceRows.length})`);

  let enrichmentSummary = { enriched: [], success: 0, failed: 0, skipped: 0 };
  try {
    enrichmentSummary = await enrichOnlyNewJobs(newJobs);
    if (enrichmentSummary.enriched.length) {
      const saveResult = await saveJobs(enrichmentSummary.enriched);
      if (saveResult.error) logger.error(`Failed to save enriched new jobs: ${saveResult.error.message}`);
    }
  } catch (err) {
    logger.error(`Enrichment failed: ${err.message}`);
  }

  const updates = [];
  for (const pair of existingMatches) {
    const { db, search } = pair;
    const changed = {};
    if ((search.title || '') !== (db.title || '')) changed.title = search.title;
    if ((search.location || '') !== (db.location || '')) changed.location = search.location;
    if ((search.work_mode || '') !== (db.work_mode || '')) changed.work_mode = search.work_mode;
    if ((search.posted_date || '') !== (db.posted_date || '')) changed.posted_date = search.posted_date;
    if ((search.apply_url || '') !== (db.apply_url || '')) changed.apply_url = search.apply_url;
    if (db.is_active === false) changed.is_active = true;

    if (Object.keys(changed).length) {
      changed.id = db.id;
      updates.push(changed);
    }
  }

  if (updates.length) {
    try {
      await updateJobs(updates);
      logger.info(`Updated ${updates.length} existing jobs.`);
    } catch (err) {
      logger.error(`Updating existing jobs failed: ${err.message}`);
    }
  }

  const removedApplyUrls = removedRows.map((r) => r.apply_url).filter(Boolean);
  if (removedApplyUrls.length) {
    try {
      await markJobsInactive(SOURCE, removedApplyUrls);
      logger.info(`Marked ${removedApplyUrls.length} removed jobs inactive.`);
    } catch (err) {
      logger.error(`Failed to mark removed jobs inactive: ${err.message}`);
    }
  }

  logger.info(`Search pages: ${pageCount}`);
  logger.info(`Total jobs: ${allJobs.length}`);
  logger.info(`New jobs (enriched): ${enrichmentSummary.enriched.length}`);
  logger.info(`Details fetched successfully: ${enrichmentSummary.success}`);
  logger.info(`Details failed: ${enrichmentSummary.failed}`);

  const enrichedMap = new Map((enrichmentSummary.enriched || []).map((j) => [j.apply_url, j]));
  const result = allJobs.map((j) => enrichedMap.get(j.apply_url) || j);
  return { result, stats: { pageCount, totalCount, totalFound: allJobs.length, newCount: newJobs.length, updatedCount: updates.length, removedCount: removedApplyUrls.length } };
}

module.exports = { scrapeMicrosoftJobs };
