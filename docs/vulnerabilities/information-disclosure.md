# Information Disclosure Vulnerability

## Vulnerability Summary

| Field | Details |
|---|---|
| Application | SupportHub — Vulnerable Edition |
| Vulnerability | Information Disclosure |
| Severity | Medium |
| CWE | CWE-200 and CWE-209 |
| Affected Feature | System Information and Error Diagnostics |
| Authentication Required | Yes |
| Testing Environment | Local training environment |

## Description

SupportHub exposes excessive internal application information through the System Information API and detailed error responses.

An authenticated user can access information that is not required for normal support operations, including the server runtime version, operating system, platform, hostname, working directory, database location, debug configuration, session secret, and a demonstration API key.

The application also returns complete error stack traces to the browser. These traces reveal internal file paths, source filenames, function names, installed components, and implementation details.

Although the exposed secrets in this project are fictional, this behavior would be dangerous in a production application.

## Affected Endpoints

```text
GET /api/system/info
GET /api/system/error-test
```

## Affected Files

```text
src/routes/system.routes.js
src/app.js
```

## Preconditions

- SupportHub is running locally.
- The tester is signed in to a valid SupportHub account.
- The test is performed only inside the authorized training environment.

## Steps to Reproduce

### Test 1: Exposed System Information

1. Start the application:

   ```powershell
   npm run dev
   ```

2. Open the application:

   ```text
   http://127.0.0.1:3000
   ```

3. Sign in using a demonstration account.

4. Open the `System Info` page from the sidebar.

5. Open the browser Developer Tools using `F12`.

6. Select the `Network` tab.

7. Click the `Refresh` button on the System Info page.

8. Select the following request:

   ```text
   /api/system/info
   ```

9. Open the response body.

## Observed Response

The response exposes unnecessary internal information similar to the following:

```json
{
  "application": "SupportHub 1.0.0-dev",
  "environment": "development",
  "runtime": "v24.x.x",
  "platform": "win32 x64",
  "hostname": "INTERNAL-HOSTNAME",
  "workingDirectory": "C:\\Users\\REDACTED\\Projects\\supporthub-vulnerable",
  "database": "SQLite — C:\\Users\\REDACTED\\Projects\\supporthub-vulnerable\\data\\supporthub.db",
  "debugMode": true,
  "demoApiKey": "sh_demo_7F9K2X1_NOT_REAL",
  "sessionSecret": "supporthub-training-secret"
}
```

## Test 2: Verbose Error Disclosure

1. Remain on the `System Info` page.

2. Click:

   ```text
   Generate test error
   ```

3. Inspect the displayed error output.

4. In the Network tab, select:

   ```text
   /api/system/error-test
   ```

5. Review the response body.

## Observed Result

The application returns an HTTP `500 Internal Server Error` response containing:

- The internal error name.
- The original exception message.
- A complete server-side stack trace.
- The application working directory.
- Source filenames and function names.
- Internal database-related implementation details.

## Expected Secure Behavior

The application should return only a generic error response, such as:

```json
{
  "error": "An unexpected error occurred."
}
```

Detailed error information should be written only to protected server-side logs and must not be returned to the browser.

The System Information endpoint should expose only the minimum operational information required by the authorized user.

## Vulnerable Code

The System Information route returns sensitive runtime and configuration values:

```js
res.json({
  application: 'SupportHub 1.0.0-dev',
  environment: process.env.NODE_ENV || 'development',
  runtime: process.version,
  platform: `${process.platform} ${process.arch}`,
  hostname: os.hostname(),
  workingDirectory: process.cwd(),
  database: `SQLite — ${databasePath}`,
  debugMode: true,
  demoApiKey: 'sh_demo_7F9K2X1_NOT_REAL',
  sessionSecret: process.env.SESSION_SECRET
});
```

The global error handler also returns the complete exception stack:

```js
res.status(error.status || 500).json({
  error: error.message,
  name: error.name,
  stack: error.stack,
  path: req.originalUrl,
  workingDirectory: process.cwd()
});
```

## Root Cause

The vulnerability is caused by returning debugging, configuration, environment, and exception details directly to the client.

The application does not separate information intended for server-side logs from information safe to display to users.

## Security Impact

An attacker could use the disclosed information to:

- Identify the server operating system and runtime.
- Locate application and database files.
- Understand the internal project structure.
- Discover installed technologies and implementation details.
- Obtain exposed configuration values or secrets.
- Build more accurate attacks against other application components.

Information Disclosure may not directly compromise the system, but it can significantly assist further attacks.

## Evidence

### System Information Response

![System information disclosure](../screenshots/information-disclosure-system-info.png)

### Detailed Error Response

![Verbose error response](../screenshots/information-disclosure-error-response.png)

## Recommended Remediation

The secured edition should:

1. Remove secrets, internal paths, hostnames, and runtime details from API responses.
2. Return generic error messages to users.
3. Store detailed errors only in protected server-side logs.
4. Disable debug output outside local development.
5. Restrict administrative diagnostic endpoints using server-side authorization.
6. Never return session secrets, API keys, database paths, or environment variables.
7. Use different error behavior for development and production environments.

## Verification Criteria for the Secured Edition

The vulnerability will be considered fixed when:

- `/api/system/info` returns only approved non-sensitive health information.
- `/api/system/error-test` returns a generic error message.
- Stack traces are not visible in browser responses.
- Internal paths and hostnames are not returned.
- Session secrets and API keys never appear in API responses.
- Detailed diagnostic information is available only through protected server-side logs.

## Conclusion

The Information Disclosure vulnerability was successfully reproduced in the SupportHub vulnerable edition.

The application exposed internal system information and detailed exception data that should remain private. The collected screenshots demonstrate both the excessive system information response and the verbose error response.