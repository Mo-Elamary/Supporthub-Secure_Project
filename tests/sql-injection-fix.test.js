const { after, before, test } = require('node:test');
const assert = require('node:assert/strict');

const app = require('../src/app');
const { db } = require('../src/database/database');

let server;
let baseUrl;
let sessionCookie;

before(async () => {
  await new Promise((resolve) => {
    server = app.listen(0, '127.0.0.1', resolve);
  });

  const address = server.address();
  baseUrl = `http://127.0.0.1:${address.port}`;
});

after(async () => {
  await new Promise((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
  db.close();
});

async function postJson(path, body) {
  return fetch(`${baseUrl}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
}

test('the database stores password hashes instead of raw passwords', () => {
  const columns = db.prepare('PRAGMA table_info(users)').all().map((column) => column.name);
  assert.equal(columns.includes('password_hash'), true);
  assert.equal(columns.includes('password'), false);

  const record = db.prepare('SELECT password_hash FROM users WHERE id = 1').get();
  assert.match(record.password_hash, /^scrypt\$[a-f0-9]+\$[a-f0-9]+$/);
  assert.equal(record.password_hash.includes('Admin@123'), false);
});

test('valid demonstration credentials still sign in', async () => {
  const response = await postJson('/api/auth/login', {
    email: 'mohamed.elamary@supporthub.test',
    password: 'Admin@123'
  });

  assert.equal(response.status, 200);
  const data = await response.json();
  assert.equal(data.user.email, 'mohamed.elamary@supporthub.test');

  sessionCookie = response.headers.get('set-cookie').split(';', 1)[0];
});

test('invalid credentials are rejected', async () => {
  const response = await postJson('/api/auth/login', {
    email: 'mohamed.elamary@supporthub.test',
    password: 'not-the-password'
  });

  assert.equal(response.status, 401);
});

test('the former login SQL injection payload is rejected', async () => {
  const response = await postJson('/api/auth/login', {
    email: "' OR 1=1 --",
    password: 'SQLI_TEST'
  });

  assert.equal(response.status, 401);
  const data = await response.json();
  assert.equal(data.error, 'Invalid email or password.');
});

test('normal ticket search still returns the expected match', async () => {
  assert.ok(sessionCookie, 'A valid login must create a session cookie.');

  const response = await fetch(`${baseUrl}/api/tickets/search?q=analytics`, {
    headers: { Cookie: sessionCookie }
  });

  assert.equal(response.status, 200);
  const data = await response.json();
  assert.equal(data.tickets.length, 1);
  assert.equal(data.tickets[0].id, 2048);
});

test('the former ticket-search SQL injection payload returns no unrelated records', async () => {
  const payload = encodeURIComponent("' OR 1=1 --");
  const response = await fetch(`${baseUrl}/api/tickets/search?q=${payload}`, {
    headers: { Cookie: sessionCookie }
  });

  assert.equal(response.status, 200);
  const data = await response.json();
  assert.equal(data.tickets.length, 0);
});
