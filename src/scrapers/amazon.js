const axios = require('axios');
const logger = require('../utils/logger');
const { newPage } = require('./browser');
const {
  getJobsBySourceAndApplyUrls,
  saveJobs,
  updateJobs,
  markJobsInactive,
  getAllJobsBySource,
} = require('../database/jobRepository');

const DETAIL_CONCURRENCY = 2;
const DETAIL_DELAY_MIN_MS = 300;
const DETAIL_DELAY_MAX_MS = 500;
const SOURCE = 'Amazon';
const SEARCH_URL = "https://www.amazon.jobs/en/search?base_query=Software&loc_query=India";

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

function parseEmploymentType(value) {
  if (!value) return null;
  const raw = String(value).trim();
  const normalized = raw.replace(/_/g, ' ').toLowerCase();
  if (/full[- ]?time/i.test(normalized) || normalized === 'full time') return 'Full-Time';
  if (/part[- ]?time/i.test(normalized) || normalized === 'part time') return 'Part-Time';
  if (/contract/i.test(normalized)) return 'Contract';
  if (/intern/i.test(normalized)) return 'Intern';
  return raw.replace(/_/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase());
}

function extractExperience(text) {
  if (!text || typeof text !== 'string') return null;
  const match = text.match(/(\d+\+?\s*years?)(?:\s*(?:of\s*)?experience)?/i);
  if (!match) return null;
  return match[1].replace(/\s+/g, ' ').trim();
}

function extractSalary(text) {
  if (!text || typeof text !== 'string') return null;
  const match = text.match(/(USD\s*\$[\d,]+\s*-\s*\$[\d,]+\s*per year|\$[\d,]+\s*-\s*\$[\d,]+\s*per year|USD\s*\$[\d,]+\s*-\s*\$[\d,]+)/i);
  if (!match) return null;
  return match[1].trim();
}

function normalizePostedDate(value) {
    if (!value) return null;
    const date = new Date(value);
    if (isNaN(date.getTime())) {
        return null;
    }
    return date.toISOString();
}

function extractWorkMode(text) {
  if (!text || typeof text !== "string") return "onsite";

  const value = text.toLowerCase();

  if (
    value.includes("100% remote") ||
    value.includes("fully remote") ||
    value.includes("remote only") ||
    value.includes("work from home") ||
    value.includes("remote")
  ) {
    return "remote";
  }

  if (
    value.includes("hybrid") ||
    value.includes("flexible work") ||
    value.includes("flexible workplace")
  ) {
    return "hybrid";
  }

  return "onsite";
}

function extractSkillsFromText(text) {
  if (!text || typeof text !== 'string') return [];

  const skillBlockMatch = text.match(/Top skills\s*([\s\S]{1,200})/i);
  if (!skillBlockMatch) return [];

  const rawLines = skillBlockMatch[1]
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean);

  const skills = [];
  for (const line of rawLines) {
    if (/^(Previously worked as|Insights from previous hires|Powered by|This site|Job description|Company and benefits|Job number|Date posted|Work site|Travel|Profession|Discipline|Role type|Employment type)$/i.test(line)) {
      break;
    }
    if (/^Top skills$/i.test(line)) {
      continue;
    }
    skills.push(line);
  }

  return skills;
}

async function scrapeJobDetailPage(applyUrl) {
  if (!applyUrl) return { bodyText: null, ldJsonScripts: [], topSkills: [] };

  let page;
  try {
    page = await newPage();
    await page.goto(applyUrl, { waitUntil: 'networkidle', timeout: 60000 });

    const [bodyText, ldJsonScripts, topSkills] = await Promise.all([
      page.evaluate(() => document.body.innerText),
      page.$$eval('script[type="application/ld+json"]', (nodes) => nodes.map((node) => node.textContent || '')),
      page.evaluate(() => {
        const heading = Array.from(document.querySelectorAll('*')).find((el) => el.innerText && el.innerText.trim().toLowerCase() === 'top skills');
        if (!heading) return [];
        const section = heading.parentElement || heading;
        const lines = section.innerText.split(/\n+/).map((line) => line.trim()).filter(Boolean);
        const startIndex = lines.findIndex((line) => /^top skills$/i.test(line));
        if (startIndex === -1) return [];
        return lines.slice(startIndex + 1).filter((line) => !/^(Previously worked as|Insights from previous hires|Powered by|This site|Job description|Company and benefits|Job number|Date posted|Work site|Travel|Profession|Discipline|Role type|Employment type)$/i.test(line));
      }),
    ]);

    return { bodyText, ldJsonScripts, topSkills };
  } catch (error) {
    logger.warn(`Playwright detail scrape failed for ${applyUrl}: ${error.message}`);
    return { bodyText: null, ldJsonScripts: [], topSkills: [] };
  } finally {
    if (page) {
      await page.close().catch(() => {});
    }
  }
}

async function normalizeDetails(data, applyUrl) {
  if (!data || typeof data !== 'object') return {};

  const apiDescription =
    data.description ||
    data.description_short ||
    data.jobDescription ||
    data.job_description ||
    null;
  const publicUrl = data.publicUrl || data.public_url || null;
  const apiEmploymentType = data.job_schedule_type || data.employmentType || data.employment_type || null;
  const details = {
    description: apiDescription,
    publicUrl,
    employment_type: parseEmploymentType(apiEmploymentType),
    experience: extractExperience(apiDescription || ""),
    salary: extractSalary(apiDescription || ""),
    skills: [],
    work_mode: null,
  };

  const pageDetails = await scrapeJobDetailPage(applyUrl);

  for (const rawJson of pageDetails.ldJsonScripts) {
    if (!rawJson) continue;
    try {
      const parsed = JSON.parse(rawJson);
      if (!details.employment_type && parsed.employmentType) {
        details.employment_type = parseEmploymentType(parsed.employmentType);
      }
      if (!details.experience && parsed.description) {
        details.experience = extractExperience(parsed.description);
      }
      if (!details.salary && parsed.description) {
        details.salary = extractSalary(parsed.description);
      }
    } catch (error) {
      // ignore invalid JSON blocks
    }
  }

  if ((!details.skills || !details.skills.length) && pageDetails.topSkills.length) {
    details.skills = pageDetails.topSkills;
  }

  if ((!details.skills || !details.skills.length) && pageDetails.bodyText) {
    details.skills = extractSkillsFromText(pageDetails.bodyText);
  }

  if (!details.experience && pageDetails.bodyText) {
    details.experience = extractExperience(pageDetails.bodyText);
  }

  if (!details.salary && pageDetails.bodyText) {
    details.salary = extractSalary(pageDetails.bodyText);
  }

  details.work_mode = extractWorkMode(
    `${apiDescription || ""}\n${pageDetails.bodyText || ""}`
);

if (pageDetails.bodyText) {
  details.description = pageDetails.bodyText;
}

  return details;
}


function isIndiaJob(location) {
  if (!location) return false;

  return location.toLowerCase().includes("india");
}

function isRemoteJob(job) {
  const text = `
    ${job.location || ""}
    ${job.work_mode || ""}
    ${job.description || ""}
  `.toLowerCase();

  return (
    text.includes("remote") ||
    text.includes("work from home") ||
    text.includes("home office")
  );
}

function shouldSaveJob(job) {
  if (isIndiaJob(job.location)) {
    return true;
  }

  if (isRemoteJob(job)) {
    return true;
  }

  return false;
}

function chunkArray(array, size) {
  const chunks = [];
  for (let i = 0; i < array.length; i += size) chunks.push(array.slice(i, i + size));
  return chunks;
}

async function fetchAmazonSearchJobs(offset = 0, limit = 10) {

    const params = new URLSearchParams();

    params.append("radius", "24km");

    [
        "normalized_country_code",
        "normalized_state_name",
        "normalized_city_name",
        "location",
        "business_category",
        "category",
        "schedule_type_id",
        "employee_class",
        "normalized_location",
        "job_function_id",
        "is_manager",
        "is_intern"
    ].forEach(f => params.append("facets[]", f));

    params.append("offset", offset);
    params.append("result_limit", limit);

    params.append("sort", "relevant");

    params.append("latitude", "");
    params.append("longitude", "");
    params.append("loc_group_id", "");

    params.append("loc_query", "India");
    params.append("base_query", "Software");

    params.append("city", "");
    params.append("country", "");
    params.append("region", "");
    params.append("county", "");
    params.append("query_options", "");

    const url =
        "https://www.amazon.jobs/en/search.json?" +
        params.toString();

    logger.info(`Downloading Amazon jobs : offset=${offset}`);

    const response = await axios.get(url, {
        timeout: 60000,
        headers: {
            Accept: "application/json"
        }
    });

    return response.data;
}

async function fetchAllSearchJobs() {

    logger.info("Downloading Amazon search results...");

    const response = await fetchAmazonSearchJobs();

    const jobs = response.jobs || [];

    const normalized = jobs.map(job => ({
        positionId: job.id,
        title: job.title,
        location: job.location,
        apply_url: job.job_path ? `https://www.amazon.jobs${job.job_path}` : job.url_next_step,
        source: SOURCE,
        description: job.description_short || job.description || null,
        posted_date: normalizePostedDate(job.posted_date),
        work_mode: null,
        experience: null,
        salary: null,
        employment_type: job.job_schedule_type,
        skills: [],
        status: "open",
        is_active: true
    }));

    logger.info(`Jobs found : ${normalized.length}`);
    return {
        allJobs: normalized,
        pageCount: 1,
        totalCount: response.hits || normalized.length
    };
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
      const details = await normalizeDetails(job, job.apply_url);
      fetched += 1;
      logger.info(`Downloaded details ${fetched}/${newJobs.length}`);

      success += 1;
      return {
        ...job,
        description: details.description || job.description,
        apply_url: details.publicUrl || job.apply_url,
        employment_type: details.employment_type || job.employment_type,
        experience: details.experience || job.experience,
        salary: details.salary || job.salary,
        skills: details.skills.length ? details.skills : job.skills,
      };
    });

    const results = await Promise.all(promises);
    enriched.push(...results);
  }

  return { enriched, success, failed, skipped: allJobs.length - newJobs.length };
}

async function scrapeAmazonJobs(query = '', location = '', fullSync = false) {
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

    // Remote jobs india code
    // const jobsToSave = enrichmentSummary.enriched.filter(job => shouldSaveJob(job));
    // logger.info(`Jobs after India/Remote filter: ${jobsToSave.length}`);
    // const saveResult = await saveJobs(jobsToSave);

    logger.info(`Saving all enriched jobs: ${enrichmentSummary.enriched.length}`);
    const jobsToSave =
    enrichmentSummary.enriched.filter(shouldSaveJob);
    await saveJobs(jobsToSave);
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

    const filteredResult = result.filter((job) => shouldSaveJob(job));

    return {
    result: filteredResult,
    stats: { pageCount, totalCount, totalFound: allJobs.length, newCount: newJobs.length, updatedCount: updates.length, removedCount: removedApplyUrls.length } };
    }

module.exports = { scrapeAmazonJobs };
