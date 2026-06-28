'use strict';

const axios = require('axios');
const { buildDetailApi } = require('./workdayUrls');

function normalizeDetailPayload(payload) {
  if (!payload || typeof payload !== 'object') {
    return null;
  }

  if (payload.jobPostingInfo && typeof payload.jobPostingInfo === 'object') {
    return payload;
  }

  if (payload.jobPosting && typeof payload.jobPosting === 'object') {
    return payload.jobPosting;
  }

  return null;
}

async function fetchJobDetails(config, jobPosting) {
  if (!config || !jobPosting || typeof jobPosting !== 'object') {
    return null;
  }

  const job = jobPosting;
  const detailInfo = job.jobPostingInfo && typeof job.jobPostingInfo === 'object' ? job.jobPostingInfo : {};
  const externalPath = detailInfo.externalPath || job.externalPath || null;
  const directUrl = job.externalUrl || detailInfo.externalUrl || detailInfo.url || job.url || job.applyUrl || job.apply_url || null;
  const candidates = [];

  if (directUrl) {
    candidates.push({ method: 'get', url: directUrl });
  }

  if (externalPath) {
    const candidateUrl = buildDetailApi(config, externalPath);
    candidates.push({ method: 'get', url: candidateUrl });
  }

  for (const candidate of candidates) {
    try {
      const response = await axios.request({
        method: candidate.method,
        url: candidate.url,
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
          'User-Agent': 'Mozilla/5.0',
        },
      });

      const payload = normalizeDetailPayload(response.data);
      if (!payload) {
        continue;
      }

      return {
        title: payload.title || job.title || null,
        location: payload.locationsText || payload.location || payload.locationText || job.location || null,
        postedOn: payload.postedOn || job.postedOn || null,
        jobPostingInfo: payload.jobPostingInfo || payload.jobPosting || detailInfo,
        externalUrl: payload.externalUrl || directUrl || null,
        jobReqId: payload.jobReqId || job.jobReqId || null,
        jobDescription: payload.jobDescription || job.jobDescription || null,
        timeType: payload.timeType || job.timeType || null,
      };
    } catch (error) {
      console.error('Workday detail request failed:', error.message);
    }
  }

  return null;
}

module.exports = {
  fetchJobDetails,
};
