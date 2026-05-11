const urlStr = "postgresql://neondb_owner:npg_WsojQ8G9Hxag@ep-steep-surf-amc6q8wv-pooler.c-5.us-east-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require";
const parsedUrl = new URL(urlStr);
if (parsedUrl.hostname.includes('pooler.c-5') || parsedUrl.hostname.includes('neon.tech')) {
  parsedUrl.searchParams.set('pgbouncer', 'true');
  parsedUrl.searchParams.delete('channel_binding');
}
console.log(parsedUrl.toString());
