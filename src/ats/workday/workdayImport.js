'use strict';

const companies = require('./companyConfig');
const { crawlCompany } = require('./workdayCrawler');
const { mapJob } = require('../../database/jobMapper');
const { insertJobs } = require('../../database/jobRepository');
const { getCompanyByName } = require('../../database/companyRepository');

async function main() {
  try {
    const companyName = process.argv[2];

    if (!companyName) {
      console.log('Usage: node src/ats/workday/workdayImport.js <companyName>');
      return;
    }

    const config = companies.find(
      (companyConfig) => companyConfig.name.toLowerCase() === companyName.toLowerCase()
    );

    if (!config) {
      console.log('Available companies:');
      companies.forEach((companyConfig) => {
        console.log(`- ${companyConfig.name}`);
      });
      return;
    }

    const company = await getCompanyByName(config.name);

    if (!company) {
      console.log('Company not found in database.');
      return;
    }

    const jobs = await crawlCompany(config);
    const mappedJobs = jobs.map((job) => mapJob(company, job));

    console.log('Company Name:', company.name);
    console.log('Company Id:', company.id);
    console.log('Fetched Jobs:', jobs.length);

    await insertJobs(mappedJobs);

    console.log('Inserted Jobs:', mappedJobs.length);
  } catch (error) {
    console.error(error);
  }
}

main();
