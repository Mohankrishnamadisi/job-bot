'use strict';

const companies = require('./companyConfig');
const { crawlCompany } = require('./workdayCrawler');

async function main() {
  const company = companies[0];

  console.log(`Company: ${company.name}`);

  try {
    const jobs = await crawlCompany(company);

    console.log('Total Jobs:');
    console.log(jobs.length);
    console.log('First 5 Jobs:');
    console.log(jobs.slice(0, 5));
    console.log('Last Job:');
    console.log(jobs[jobs.length - 1]);
  } catch (error) {
    console.error(error);
  }
}

main();
