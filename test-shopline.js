import axios from 'axios';

async function test() {
  const urls = [
    'https://kolaich.myshopline.com/admin/openapi/v20240301/products.json?limit=1',
    'https://kolaich.myshopline.com/admin/openapi/v20240301/products/list.json?limit=1',
    'https://kolaich.myshopline.com/admin/openapi/v20240301/orders.json?limit=1',
    'https://kolaich.myshopline.com/admin/openapi/v20240301/orders/list.json?limit=1'
  ];
  
  for (const url of urls) {
    try {
      const res = await axios.get(url, { headers: { 'Authorization': 'Bearer test' }, validateStatus: () => true });
      console.log(`GET ${url} -> ${res.status}`);
      const res2 = await axios.post(url, {}, { headers: { 'Authorization': 'Bearer test' }, validateStatus: () => true });
      console.log(`POST ${url} -> ${res2.status}`);
    } catch(e) {
      console.log(e.message);
    }
  }
}
test();
