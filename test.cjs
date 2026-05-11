const https = require('https');
https.get('https://4-28-mate-acc-google.vercel.app/api/settings', (res) => {
  let data = '';
  res.on('data', (chunk) => { data += chunk; });
  res.on('end', () => { console.log(res.statusCode, data); });
}).on('error', (err) => { console.log("Error: " + err.message); });
