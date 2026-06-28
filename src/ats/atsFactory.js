'use strict';

const { crawlCompany: crawlWorkday } = require('./workday/workdayCrawler');

function getCrawler(atsType) {
  switch (atsType) {
    case 'workday':
      return crawlWorkday;
    default:
      throw new Error(`Unsupported ATS type: ${atsType}`);
  }
}

module.exports = {
  getCrawler,
};
