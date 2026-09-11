# Information Disclosure Remediation

## Remediation Summary

| Field | Details |
|---|---|
| Application | SupportHub — Secured Edition |
| Vulnerability | Information Disclosure |
| Severity Before Remediation | Medium |
| CWE | CWE-200 and CWE-209 |
| Fixed Endpoints | `GET /api/system/info` and `GET /api/system/error-test` |
| Affected Components | System Information API, Global Error Handler, System Info UI |
| Authentication Required | Yes |
| Verification | Manual security and regression testing |

## Scope

This remediation addresses two Information Disclosure issues in SupportHub:

1. The System Information endpoint returned excessive runtime, host, path, configuration, and secret information.
2. The global error handler returned complete internal exception details to the browser.

The vulnerable implementations remain in the source files as commented training references. They are no longer executed by the application.

## Original Vulnerable Behavior

### Excessive System Information

The vulnerable endpoint returned information including:

```text
Node.js runtime version
Operating-system platform and architecture
Server hostname
Application working directory
SQLite database path
Debug-mode status
Demonstration API key
Session secret
```

This information was not required by the user interface and could assist an attacker in understanding the application's environment.

### Verbose Error Responses

The vulnerable global error handler returned:

```text
Original exception message
Exception name
Complete stack trace
Requested path
Server working directory
Database-related implementation details
```

These details should be available only through protected server-side logs.

## Files Changed

```text
src/routes/system.routes.js
src/app.js
public/js/app.js
docs/remediation/information-disclosure-fix.md
```

## System Information Fix

The affected endpoint is:

```text
GET /api/system/info
```

### Vulnerable Version

The original implementation is retained as comments inside:

```text
src/routes/system.routes.js
```

It returned values such as:

```js
// runtime: process.version,
// platform: `${process.platform} ${process.arch}`,
// hostname: os.hostname(),
// workingDirectory: process.cwd(),
// database: `SQLite — ${databasePath}`,
// demoApiKey: 'sh_demo_7F9K2X1_NOT_REAL',
// sessionSecret: process.env.SESSION_SECRET
```

These values exposed unnecessary information about the application's internal environment.

### Secure Version

The secured endpoint returns only the minimum information required by the System Info page:

```js
res.set('Cache-Control', 'no-store');

res.json({
  application: 'SupportHub',
  environment: 'Training Lab',
  serviceStatus: 'Operational',
  databaseStatus: 'Connected',
  diagnostics: 'Protected',
  debugMode: false
});
```

The `Cache-Control: no-store` response header prevents diagnostic information from being stored in browser or intermediary caches.

The secured response does not contain:

```text
runtime
platform
hostname
workingDirectory
databasePath
demoApiKey
sessionSecret
```

The unnecessary `os` and `databasePath` imports were also removed from the active implementation.

## Error Handler Fix

The global error handler is located in:

```text
src/app.js
```

### Vulnerable Version

The old handler is retained as commented code:

```js
// app.use((error, req, res, next) => {
//   res.status(error.status || 500).json({
//     error: error.message,
//     name: error.name,
//     stack: error.stack,
//     path: req.originalUrl,
//     workingDirectory: process.cwd()
//   });
// });
```

This implementation returned internal exception details directly to the browser.

### Secure Version

The secured handler creates a unique reference identifier:

```js
const requestId = crypto.randomUUID();
```

The complete exception information is written only to the server logs:

```js
console.error(`[${requestId}] Request failed`, {
  method: req.method,
  path: req.originalUrl,
  status,
  name: error.name,
  message: error.message,
  stack: error.stack
});
```

For internal server errors, the browser receives only:

```json
{
  "error": "An unexpected error occurred.",
  "requestId": "generated-reference-id"
}
```

The response does not expose the exception name, original message, stack trace, server path, or working directory.

The reference identifier allows an administrator to correlate the generic user-facing response with the protected server-side log entry.

## Status Validation

The secured error handler validates the requested HTTP status:

```js
const requestedStatus = Number(error.status);

const status =
  Number.isInteger(requestedStatus) &&
  requestedStatus >= 400 &&
  requestedStatus <= 599
    ? requestedStatus
    : 500;
```

Invalid or missing error statuses default to:

```text
500 Internal Server Error
```

For server errors, the original exception message is never returned to the client.

## Front-End Fix

The affected front-end file is:

```text
public/js/app.js
```

### System Information Display

The interface now uses only the approved response fields:

```js
const details = [
  data.application,
  data.environment,
  data.serviceStatus,
  data.databaseStatus,
  data.diagnostics,
  data.debugMode ? 'Enabled' : 'Disabled'
];
```

It no longer expects or displays runtime versions, database paths, or hostnames.

### Error Display

The interface now displays the generic message and reference identifier:

```js
output.textContent =
  `${data.error}\nReference ID: ${data.requestId}`;
```

It no longer renders:

```text
Error name
Stack trace
Working directory
Internal exception message
```

A generic fallback is displayed if the request itself cannot be completed:

```text
The error service is temporarily unavailable.
```

## Root Cause

The vulnerability existed because the application:

1. Returned debugging and environment information through a user-accessible API.
2. Included secrets and internal filesystem paths in API responses.
3. Returned complete exception objects to the browser.
4. Did not separate protected server logs from public error responses.
5. Allowed the front end to display unnecessary internal diagnostic details.

## Security Impact

Before remediation, an attacker could use the disclosed information to:

- Identify the server runtime and operating system.
- Discover internal application and database paths.
- Learn the internal project structure.
- Identify source files and function names through stack traces.
- Obtain exposed configuration values or secrets.
- Use the information to plan more targeted attacks.

Information Disclosure may not directly compromise the server, but it can significantly increase the effectiveness of other attacks.

## Manual Verification

### System Information Test

1. Start SupportHub.
2. Sign in using a demonstration account.
3. Open `System Info`.
4. Open browser Developer Tools.
5. Select the `Network` tab.
6. Click `Refresh`.
7. Inspect:

   ```text
   GET /api/system/info
   ```

The secured response contains only:

```json
{
  "application": "SupportHub",
  "environment": "Training Lab",
  "serviceStatus": "Operational",
  "databaseStatus": "Connected",
  "diagnostics": "Protected",
  "debugMode": false
}
```

No secrets, internal paths, runtime versions, or hostnames are returned.

### Error Response Test

1. Remain on the `System Info` page.
2. Click `Generate test error`.
3. Inspect:

   ```text
   GET /api/system/error-test
   ```

The browser receives:

```json
{
  "error": "An unexpected error occurred.",
  "requestId": "generated-reference-id"
}
```

The response has HTTP status:

```text
500 Internal Server Error
```

The response does not contain:

```text
stack
name
path
workingDirectory
SELECT * FROM tickets
SQLITE_ERROR
```

### Server Log Verification

The Terminal contains the complete error information and the same `requestId`.

This confirms that diagnostic details remain available to the developer without being exposed to the browser.

### Regression Verification

The following commands complete successfully:

```powershell
npm run check
npm run test:sql-injection
```

The existing SQL Injection regression suite continues to report:

```text
pass 6
fail 0
```

This confirms that the Information Disclosure remediation did not break the previous security fix.

## Verification Criteria

The vulnerability is considered fixed because:

- `/api/system/info` returns only approved operational information.
- Runtime and operating-system details are not returned.
- Internal paths and hostnames are not returned.
- Session secrets and API keys are not returned.
- Internal server errors use a generic client-facing message.
- Stack traces are not returned to the browser.
- Detailed error information is available only in server logs.
- Each error response includes a correlation identifier.
- The System Info interface continues to work.
- Previous SQL Injection regression tests still pass.

## Conclusion

The Information Disclosure vulnerability was successfully remediated in the SupportHub secured edition.

The System Information endpoint now follows data-minimization principles and returns only approved operational values. The global error handler separates protected diagnostic logs from generic public responses.

Manual retesting confirmed that internal paths, secrets, runtime details, stack traces, and database-related exception information are no longer exposed to the browser.