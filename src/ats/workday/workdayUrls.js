'use strict';

function normalizePath(externalPath) {
  if (!externalPath) return null;
  return externalPath.startsWith('/job/') ? externalPath.substring(5) : externalPath;
}

function buildBasePath(config) {
  const tenant = config.tenant || config.company || config.name || '';
  const careerSite = config.careerSite || '';
  const apiVersion = config.apiVersion || 'cxs';
  return [apiVersion, tenant, careerSite].filter(Boolean).join('/');
}

function buildSearchApi(config) {
  if (!config) return null;

  const basePath = buildBasePath(config);
  return `${config.baseUrl}/wday/${basePath}/jobs`;
}

function buildDetailApi(config, externalPath) {
  if (!config) return null;

  const cleanPath = normalizePath(externalPath);
  if (!cleanPath) return null;

  const basePath = buildBasePath(config);
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
