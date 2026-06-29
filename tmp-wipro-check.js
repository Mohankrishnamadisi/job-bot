const https = require('https');

function postPage(pageNumber) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify({ locale: 'en_US', pageNumber, keywords: '', location: 'india', sortBy: '', facetFilters: {} });
    const req = https.request({
      hostname: 'careers.wipro.com',
      path: '/services/recruiting/v1/jobs',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        'User-Agent': 'Mozilla/5.0',
        'Content-Length': Buffer.byteLength(payload),
      },
    }, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (err) {
          reject(err);
        }
      });
    });

    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

(async () => {
  for (const pageNumber of [0, 1, 2, 3]) {
    const body = await postPage(pageNumber);
    const jobs = body.jobSearchResult || [];
    const first = jobs[0]?.response;
    const last = jobs[jobs.length - 1]?.response;
    console.log(JSON.stringify({
      pageNumber,
      count: jobs.length,
      firstId: first?.id || null,
      lastId: last?.id || null,
      firstTitle: first?.unifiedStandardTitle || null,
      lastTitle: last?.unifiedStandardTitle || null,
    }));
  }
})();
