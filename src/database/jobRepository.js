'use strict';

const supabase = require('./supabaseClient');

async function insertJobs(jobs) {
  console.log('Total jobs received.', jobs?.length ?? 0);

  const { data, error } = await supabase.from('jobs').insert(jobs);

  if (error) {
    console.error('Supabase Insert Error:', error);
  } else {
    console.log('Supabase Insert Success');
    console.log('Rows inserted:', data?.length ?? 0);
  }

  return { data, error };
}

async function upsertJobs(jobs) {
  return supabase.from('jobs').upsert(jobs);
}

async function deleteExpiredJobs(companyId) {
  return supabase.from('jobs').delete().eq('company_id', companyId);
}

module.exports = {
  insertJobs,
  upsertJobs,
  deleteExpiredJobs,
};
