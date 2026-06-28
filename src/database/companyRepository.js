'use strict';

const supabase = require('./supabaseClient');

async function getCompanyByName(name) {
  const { data, error } = await supabase
    .from('companies')
    .select('*')
    .eq('name', name)
    .maybeSingle();

  if (error) {
    return null;
  }

  return data;
}

async function getEnabledCompanies() {
  const { data, error } = await supabase
    .from('companies')
    .select('*')
    .eq('enabled', true);

  if (error) {
    return [];
  }

  return data || [];
}

module.exports = {
  getCompanyByName,
  getEnabledCompanies,
};
