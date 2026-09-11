require('dotenv').config();

const app = require('./src/app');

const HOST = process.env.HOST || '127.0.0.1';
const PORT = Number(process.env.PORT || 3000);

if (process.env.LAB_MODE !== 'vulnerable') {
  console.error('Refusing to start: set LAB_MODE=vulnerable in your local .env file.');
  process.exit(1);
}

// SAFETY BOUNDARY: The vulnerable edition must stay on the local machine.
// Do not change this to 0.0.0.0 and do not deploy this application publicly.
if (!['127.0.0.1', 'localhost', '::1'].includes(HOST)) {
  console.error('Refusing to expose the vulnerable lab outside localhost.');
  process.exit(1);
}

app.listen(PORT, HOST, () => {
  console.log(`SupportHub vulnerable lab: http://${HOST}:${PORT}`);
  console.log('Local training use only. Press Ctrl+C to stop.');
});
