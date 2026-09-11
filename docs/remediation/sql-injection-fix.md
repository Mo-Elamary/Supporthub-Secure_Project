# SQL Injection Remediation

## Remediation Summary

| Field | Details |
|---|---|
| Application | SupportHub — Secured Edition |
| Vulnerability | SQL Injection |
| CWE | CWE-89 |
| Fixed Endpoints | `POST /api/auth/login` and `GET /api/tickets/search` |
| Password Protection | Salted scrypt hashes |
| Verification | Automated positive and negative regression tests |

## Scope

This remediation fixes both SQL Injection locations identified in SupportHub:

1. Authentication bypass through the login email and password fields.
2. Query manipulation through the ticket-search field.

The vulnerable implementations remain in the source files as commented training
references. They are not executed by the secured application.

## Root Cause

The vulnerable edition inserted untrusted request values directly into SQL strings.
This allowed quotes, Boolean operators, and SQL comments supplied by a user to
change the structure and logic of a database query.

The login implementation also stored and compared reusable passwords as plain
text, increasing the impact of any database disclosure.

## Login Fix

### Vulnerable behavior retained as comments

The old implementation constructed the authentication statement using string
interpolation:

```js
// const sql = `
//   SELECT id, full_name, email, role, initials
//   FROM users
//   WHERE email = '${email}' AND password = '${password}' AND status = 'Active'
// `;
// const user = db.prepare(sql).get();
```

The email and password could therefore become executable SQL syntax.

### Secure implementation

The secured route retrieves an active user with a bound parameter:

```js
const user = db.prepare(`
  SELECT id, full_name, email, role, initials, password_hash
  FROM users
  WHERE email = ? AND status = 'Active'
`).get(String(email).trim().toLowerCase());
```

The raw password is not included in a SQL statement. It is verified against the
stored salted scrypt hash:

```js
if (!user || !verifyPassword(String(password), user.password_hash)) {
  return res.status(401).json({ error: 'Invalid email or password.' });
}
```

The same generic response is used when the account is missing or the password is
incorrect.

## Password-Storage Fix

The vulnerable database column was:

```sql
password TEXT NOT NULL
```

The secured schema uses:

```sql
password_hash TEXT NOT NULL
```

`src/security/password.js` generates a unique random salt for every password and
uses Node.js `scrypt` to derive a 64-byte hash. Verification uses
`crypto.timingSafeEqual()`.

The `setup-db` command now rebuilds the local training tables before seeding them.
This provides a deterministic migration from the vulnerable schema and removes
any stored training payloads. The initial passwords in the setup script are
demonstration credentials only; only their salted hashes are written to SQLite.

## Ticket-Search Fix

### Vulnerable behavior retained as comments

The old implementation inserted the search value directly into each `LIKE`
condition:

```js
// WHERE t.subject LIKE '%${query}%'
//    OR t.description LIKE '%${query}%'
//    OR c.contact_name LIKE '%${query}%'
```

This allowed the search value to change the `WHERE` clause.

### Secure implementation

The secured implementation builds a data value and binds it to three placeholders:

```js
const searchPattern = `%${query}%`;

const tickets = db.prepare(`
  SELECT ...
  FROM tickets t
  JOIN customers c ON c.id = t.customer_id
  LEFT JOIN users u ON u.id = t.assignee_id
  WHERE t.subject LIKE ?
     OR t.description LIKE ?
     OR c.contact_name LIKE ?
  ORDER BY t.id DESC
`).all(searchPattern, searchPattern, searchPattern);
```

SQLite treats the complete search pattern as data. Quotes, comments, and Boolean
operators inside the value cannot alter the SQL statement. The route also rejects
search values longer than 200 characters.

## Files Changed

```text
src/routes/auth.routes.js
src/routes/ticket.routes.js
src/security/password.js
scripts/setup-db.js
tests/sql-injection-fix.test.js
package.json
docs/remediation/sql-injection-fix.md
```

## Automated Verification

Run:

```powershell
npm run check
npm run test:sql-injection
```

The SQL Injection regression suite verifies that:

- The database contains `password_hash` and no raw `password` column.
- A valid demonstration account can still sign in.
- An invalid password is rejected.
- The previous authentication-bypass payload receives HTTP `401`.
- A normal ticket search still returns the expected ticket.
- The previous ticket-search payload returns no unrelated records.

## Manual Retest

### Authentication bypass

Submit the former payload in the email field:

```text
' OR 1=1 --
```

Enter any non-empty password and click `Sign in`.

Expected result:

```text
Invalid email or password.
```

The user must remain signed out.

### Normal login regression

Sign in with a valid demonstration email and its correct initial password.

Expected result: the dashboard opens normally.

### Ticket-search injection

After a valid login, submit the former search payload:

```text
' OR 1=1 --
```

Expected result: the value is processed as literal search text and does not return
all tickets.

### Normal search regression

Search for:

```text
analytics
```

Expected result: ticket `#SH-2048` is returned.

## Evidence to Capture

Add the following screenshots after the manual retest:

```text
docs/screenshots/remediation/SQL-Injection/SQL-Injection-Fix_Part-1.png
docs/screenshots/remediation/SQL-Injection/SQL-Injection-Fix_Part-2.png
docs/screenshots/remediation/SQL-Injection/SQL-Injection-Fix_Part-3.png
docs/screenshots/remediation/SQL-Injection/SQL-Injection-Fix_Part-4.png
```

Recommended evidence:

1. The former login payload being rejected.
2. A valid login succeeding after the fix.
3. The former search payload returning no unrelated tickets.
4. The automated test suite passing.

## Result

SQL Injection is remediated in both affected endpoints. User-controlled values no
longer become part of executable SQL, passwords are stored as salted one-way
hashes, legitimate login and search behavior is preserved, and the former payloads
are covered by repeatable regression tests.
