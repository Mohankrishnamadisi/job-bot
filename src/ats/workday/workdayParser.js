'use strict';

function stripHtml(text) {
  if (!text) return null;

  const withoutTags = String(text).replace(/<[^>]+>/g, ' ');
  const decoded = withoutTags
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&rsquo;/gi, "'")
    .replace(/&ldquo;/gi, '"')
    .replace(/&rdquo;/gi, '"');

  return decoded.replace(/\s+/g, ' ').trim();
}

function parsePostedDate(value) {
  if (!value) return null;

  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }

  if (typeof value === 'number') {
    return Number.isNaN(value) ? null : new Date(value);
  }

  const text = String(value).trim();
  if (!text) return null;

  const isoDate = Date.parse(text);
  if (!Number.isNaN(isoDate)) {
    return new Date(isoDate);
  }

  const relativeMatch = text.match(/posted\s+(today|yesterday|(?:(\d+)\+?\s*days?)\s+ago)/i);
  if (!relativeMatch) return null;

  const [, keyword, dayCount] = relativeMatch;
  const now = new Date();

  if (/today/i.test(keyword)) {
    return new Date(now);
  }

  if (/yesterday/i.test(keyword)) {
    return new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
  }

  const days = Number(dayCount);
  if (Number.isNaN(days)) return null;

  return new Date(now.getFullYear(), now.getMonth(), now.getDate() - days);
}

function buildApplyUrl(jobPosting, config) {
  const job = jobPosting && typeof jobPosting === 'object' ? jobPosting : {};
  const detailInfo = job.jobPostingInfo && typeof job.jobPostingInfo === 'object' ? job.jobPostingInfo : {};

  const directUrl = job.externalUrl || job.url || job.applyUrl || job.apply_url
    || detailInfo.externalUrl || detailInfo.url || detailInfo.applyUrl || detailInfo.apply_url;

  if (directUrl && /^https?:\/\//i.test(String(directUrl))) {
    return String(directUrl);
  }

  if (config && config.baseUrl && detailInfo.externalPath) {
    return `${config.baseUrl}/en-US/NVIDIAExternalCareerSite/job/${detailInfo.externalPath}`;
  }

  return null;
}

function parseJobs(response, config) {
  const jobPostings = Array.isArray(response && response.jobPostings)
    ? response.jobPostings
    : (response && typeof response === 'object' ? [response] : []);

  if (!jobPostings.length) {
    return [];
  }

  return jobPostings.map((jobPosting) => {
    const job = jobPosting && typeof jobPosting === 'object' ? jobPosting : {};
    const applyUrl = buildApplyUrl(job, config);

    return {
      title: job.title || null,
      location: job.locationsText || job.location || job.locationText || null,
      employment_type: job.timeType || null,
      description: stripHtml(job.jobDescription || job.description || null),
      posted_date: parsePostedDate(job.postedOn),
      apply_url: applyUrl,
      external_job_id: job.jobReqId || null,
      status: 'active',
      source: 'ATS',
      url: applyUrl,
      postedDate: parsePostedDate(job.postedOn),
      jobId: job.jobReqId || null,
    };
  });
}

module.exports = {
  parseJobs,
};
