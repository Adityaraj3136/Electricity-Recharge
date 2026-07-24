const https = require('https');
https.get('https://wss.sbpdcl.co.in/cportal/', (res) => {
  let data = '';
  res.on('data', chunk => data += chunk);
  res.on('end', () => {
    const matches = data.match(/src="(main[^"]*\.js)"/);
    if (matches) {
      https.get('https://wss.sbpdcl.co.in/cportal/' + matches[1], (res2) => {
        let js = '';
        res2.on('data', chunk => js += chunk);
        res2.on('end', () => {
          console.log('Search for accno:', js.includes('accno'));
          console.log('Search for cano:', js.includes('cano'));
          console.log('Search for formcontrolname="accno":', js.includes('formcontrolname="accno"'));
        });
      });
    } else {
      console.log('main.js not found in HTML');
    }
  });
});
