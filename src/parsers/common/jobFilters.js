'use strict';

function isIndiaJob(location) {
  if (!location) return false;

  return location.toLowerCase().includes('india');
}

function isRemoteJob(job) {
  const text = `
    ${job.location || ''}
    ${job.work_mode || ''}
    ${job.description || ''}
  `.toLowerCase();

  return (
    text.includes('remote') ||
    text.includes('work from home') ||
    text.includes('home office')
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

module.exports = {
  isIndiaJob,
  isRemoteJob,
  shouldSaveJob,
};
