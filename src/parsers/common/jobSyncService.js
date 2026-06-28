'use strict';

function findJobsForSync(allJobs, existingRows, allSourceRows) {
  const applyUrls = (allJobs || []).map((j) => j.apply_url).filter(Boolean);
  const applyUrlSet = new Set(applyUrls);
  const existingMap = new Map((existingRows || []).map((r) => [r.apply_url, r]));

  const newJobs = (allJobs || []).filter((j) => !existingMap.has(j.apply_url));
  const existingMatches = (allJobs || [])
    .filter((j) => existingMap.has(j.apply_url))
    .map((j) => ({ db: existingMap.get(j.apply_url), search: j }));
  const removedRows = (allSourceRows || []).filter((r) => !applyUrlSet.has(r.apply_url));

  return {
    newJobs,
    existingMatches,
    removedRows,
    removedApplyUrls: removedRows.map((r) => r.apply_url).filter(Boolean),
  };
}

function buildJobUpdates(existingMatches) {
  const updates = [];
  for (const pair of existingMatches || []) {
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

  return updates;
}

async function saveNewJobs(enrichmentSummary, saveJobs, logger) {
  if (!enrichmentSummary || !enrichmentSummary.enriched || !enrichmentSummary.enriched.length) return;

  logger.info(`Saving all enriched jobs: ${enrichmentSummary.enriched.length}`);
  await saveJobs(enrichmentSummary.enriched);
}

async function updateExistingJobs(updates, updateJobs, logger) {
  if (!updates || !updates.length) return;

  try {
    await updateJobs(updates);
    logger.info(`Updated ${updates.length} existing jobs.`);
  } catch (err) {
    logger.error(`Updating existing jobs failed: ${err.message}`);
  }
}

async function markRemovedJobs(removedRows, markJobsInactive, logger, source) {
  const removedApplyUrls = (removedRows || []).map((r) => r.apply_url).filter(Boolean);
  if (!removedApplyUrls.length) return removedApplyUrls;

  try {
    await markJobsInactive(source, removedApplyUrls);
    logger.info(`Marked ${removedApplyUrls.length} removed jobs inactive.`);
  } catch (err) {
    logger.error(`Failed to mark removed jobs inactive: ${err.message}`);
  }

  return removedApplyUrls;
}

module.exports = {
  findJobsForSync,
  buildJobUpdates,
  saveNewJobs,
  updateExistingJobs,
  markRemovedJobs,
};
