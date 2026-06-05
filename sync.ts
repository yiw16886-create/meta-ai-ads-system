import axios from 'axios';

async function sync() {
  try {
    const today = new Date().toISOString().split('T')[0];
    const past = new Date(Date.now() - 30 * 86400 * 1000).toISOString().split('T')[0];
    console.log(`Syncing from ${past} to ${today}...`);
    // call /api/sync-store
    const startObj = { startDate: past, endDate: today, storeId: "kolaich" };
    console.log('Posting sync', startObj);
    const syncRes = await axios.post('http://localhost:3000/api/sync-store', startObj);
    console.log('Sync result: ', syncRes.status);
    
    // now we can test
    const insightsRes = await axios.get(`http://localhost:3000/api/stores?startDate=${today}&endDate=${today}`);
    console.log('Insights:', insightsRes.status);
  } catch(e) {
    if(e.response) {
      console.log('Error', e.response.status, e.response.data);
    } else {
      console.log('Error', e.message);
    }
  }
}
sync();
