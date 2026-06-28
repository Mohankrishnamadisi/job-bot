'use strict';

function normalizePath(externalPath) {
  if (!externalPath) return null;
  return externalPath.startsWith('/job/') ? externalPath.substring(5) : externalPath;
}

function buildSearchApi(config) {
  if (!config) return null;

  if (config.apiPath) {
    return `${config.baseUrl}${config.apiPath}`;
  }

  const tenant = config.tenant || config.company || config.name || '';
  const careerSite = config.careerSite || '';
  const apiVersion = config.apiVersion || 'cxs';
  const basePath = [apiVersion, tenant, careerSite].filter(Boolean).join('/');

  return `${config.baseUrl}/wday/${basePath}/jobs`;
}

function buildDetailApi(config, externalPath) {
  if (!config) return null;

  const cleanPath = normalizePath(externalPath);
  if (!cleanPath) return null;

  const tenant = config.tenant || config.company || config.name || '';
  const careerSite = config.careerSite || '';
  const apiVersion = config.apiVersion || 'cxs';
  const basePath = [apiVersion, tenant, careerSite].filter(Boolean).join('/');

  return `${config.baseUrl}/wday/${basePath}/job/${cleanPath}`;
}

function buildPublicJobUrl(config, externalPath) {
  if (!config) return null;

  const cleanPath = normalizePath(externalPath);
  if (!cleanPath) return null;

  const locale = config.locale || 'en-US';
  const careerSite = config.careerSite || '';
  return `${config.baseUrl}/${locale}/${careerSite}/job/${cleanPath}`;
}

module.exports = {
  buildSearchApi,
  buildDetailApi,
  buildPublicJobUrl,
};
