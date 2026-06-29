'use strict';

const { ensureCompany } = require('./companyRepository');

async function seedCompanies() {
  const companies = ['Amazon', 'Microsoft', 'Accenture'];

  for (const name of companies) {
    await ensureCompany({ name });
  }
}

seedCompanies()
  .then(() => {
    console.log('Company seed completed');
  })
  .catch((error) => {
    console.error('Company seed failed:', error.message);
  });
