'use strict';

const axios = require('axios');

async function fetchJobs(config, options = {}) {
  const baseUrl = config.baseUrl;
  const apiPath = config.apiPath;
  const endpoint = `${baseUrl}${apiPath}`;

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
      Referer: config.baseUrl + '/NVIDIAExternalCareerSite',
      'User-Agent': 'Mozilla/5.0',
    },
  });

  return response.data;
}

module.exports = {
  fetchJobs,
};
