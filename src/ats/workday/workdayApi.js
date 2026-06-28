'use strict';

const axios = require('axios');
const { buildSearchApi } = require('./workdayUrls');

async function fetchJobs(config, options = {}) {
  const endpoint = buildSearchApi(config);

  const response = await axios.post(endpoint, {
    appliedFacets: {
      locationHierarchy1: [config.countryFacet],
    },
    limit: config.pageSize,
    offset: options.offset || 0,
    searchText: options.searchText || config.defaultSearch,
  }, {
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      Origin: config.baseUrl,
      Referer: `${config.baseUrl}/${config.careerSite || ''}`,
      'User-Agent': 'Mozilla/5.0',
    },
  });

  return response.data;
}

module.exports = {
  fetchJobs,
};
