# Server-Side Request Forgery (SSRF) Remediation

## Remediation Summary

| Field | Details |
|---|---|
| Application | SupportHub — Secured Edition |
| Vulnerability | Server-Side Request Forgery (SSRF) |
| Severity Before Remediation | High |
| CWE | CWE-918 |
| Fixed Feature | URL Preview |
| Fixed Endpoint | `POST /api/tools/preview` |
| Authentication Required | Yes |
| Primary Protections | URL validation, IP-range blocking, DNS pinning, and disabled redirects |
| Verification | Public URL and restricted destination testing |

## Scope

This remediation fixes the SSRF vulnerability in the SupportHub URL Preview feature.

The vulnerable implementation accepted a complete URL from an authenticated user and sent a server-side HTTP request without validating the protocol, destination port, hostname, resolved IP address, or redirect destination.

The secured implementation permits only approved public HTTP and HTTPS destinations. Internal and restricted network addresses are rejected before an outbound connection is created.

The original vulnerable code remains inside the source file as commented training code. It is no longer executed by the application.

## Affected Files

```text
src/security/safe-url.js
src/routes/tool.routes.js
public/dashboard.html
package.json
docs/remediation/ssrf-fix.md
```

## Original Vulnerable Behavior

The vulnerable implementation passed the submitted URL directly to Axios:

```js
// const response = await axios.get(url, {
//   timeout: 4000,
//   maxContentLength: 200000,
//   responseType: 'text',
//   validateStatus: () => true
// });
```

The application did not validate:

- The URL protocol.
- Embedded username or password values.
- The destination port.
- The destination hostname.
- Resolved IPv4 or IPv6 addresses.
- Loopback and private network ranges.
- Link-local and reserved destinations.
- Redirect destinations.
- Whether the connected IP matched the validated IP.

An authenticated user could submit:

```text
http://127.0.0.1:3000/internal/ops-note
```

The server retrieved the internal resource and returned:

```text
INTERNAL ONLY: Demo backup code = SH-LAB-4821
```

This confirmed that a user could control the destination of a server-side request and access an internal resource.

## Security Design

The secured URL Preview follows this validation flow:

```text
User-provided URL
        |
        v
Parse and normalize URL
        |
        v
Allow only HTTP or HTTPS
        |
        v
Reject embedded credentials
        |
        v
Allow only ports 80 and 443
        |
        v
Resolve all destination addresses
        |
        v
Reject restricted IPv4 or IPv6 addresses
        |
        v
Select a validated public address
        |
        v
Pin the connection to that exact address
        |
        v
Send the request without redirects or proxies
```

The outbound request is created only after every validation stage succeeds.

## URL Parsing

The secured implementation parses the submitted value using the standard `URL` class:

```js
parsedUrl = new URL(input);
```

Malformed URLs are rejected with:

```json
{
  "error": "Invalid URL."
}
```

## Protocol Restrictions

Only these protocols are accepted:

```text
http:
https:
```

The following condition rejects all other protocols:

```js
if (
  parsedUrl.protocol !== 'http:' &&
  parsedUrl.protocol !== 'https:'
) {
  throw validationError(
    'Only HTTP and HTTPS URLs are allowed.'
  );
}
```

URLs using protocols such as `file:`, `ftp:`, and other unsupported schemes cannot reach the HTTP client.

## Embedded Credential Protection

URLs containing a username or password are rejected:

```js
if (parsedUrl.username || parsedUrl.password) {
  throw validationError(
    'URLs containing credentials are not allowed.'
  );
}
```

Example rejected URL:

```text
http://user:password@example.com/
```

This prevents ambiguous URL formats and credential-related parsing behavior.

## Port Restrictions

The secured implementation allows only:

```text
80
443
```

The effective destination port is determined from the explicit URL port or the protocol default:

```js
const effectivePort =
  parsedUrl.port ||
  (parsedUrl.protocol === 'https:' ? '443' : '80');
```

Unexpected ports receive:

```json
{
  "error": "The requested URL port is not allowed."
}
```

This reduces the feature's ability to probe arbitrary services.

## DNS Resolution

The application resolves every IP address associated with the hostname:

```js
addresses = await dns.lookup(hostname, {
  all: true,
  verbatim: true
});
```

The URL is rejected if it cannot be resolved or if no addresses are returned.

The application examines all returned addresses rather than trusting only the first DNS result.

## Restricted Network Protection

The secured implementation uses Node.js `net.BlockList` to block non-public destinations.

Blocked IPv4 ranges include:

```text
0.0.0.0/8
10.0.0.0/8
100.64.0.0/10
127.0.0.0/8
169.254.0.0/16
172.16.0.0/12
192.0.0.0/24
192.0.2.0/24
192.168.0.0/16
198.18.0.0/15
198.51.100.0/24
203.0.113.0/24
224.0.0.0/4
240.0.0.0/4
```

Blocked IPv6 ranges include:

```text
::/128
::1/128
100::/64
2001:db8::/32
fc00::/7
fe80::/10
ff00::/8
```

The blocked ranges cover:

- Unspecified addresses.
- Loopback destinations.
- Private networks.
- Carrier-grade NAT.
- Link-local addresses.
- Unique-local IPv6 addresses.
- Documentation and testing ranges.
- Benchmark networks.
- Multicast networks.
- Reserved address space.

Node.js `BlockList` automatically applies the IPv4 restrictions to IPv4-mapped IPv6 representations. A separate `::ffff:0:0/96` entry is intentionally not used because it would also cause public IPv4 destinations to be rejected by Node's internal address normalization.

## Mixed DNS Response Protection

The application rejects the complete hostname if any returned address belongs to a restricted network:

```js
if (
  addresses.some((record) =>
    isBlockedAddress(record.address)
  )
) {
  throw validationError(
    'Private or restricted network addresses are not allowed.'
  );
}
```

This prevents a hostname from passing validation using one public address while also resolving to an internal address.

## DNS Rebinding Protection

Checking a hostname and then allowing Axios to resolve it again would create a time-of-check/time-of-use risk.

An attacker-controlled hostname could return a public IP during validation and a private IP during the connection.

The secured implementation prevents this by creating a custom HTTP or HTTPS agent:

```js
const agent = createPinnedAgent(
  validated.protocol,
  validated.address,
  validated.family
);
```

The agent's `lookup()` function returns the exact address that already passed validation:

```js
lookup(hostname, options, callback) {
  if (options?.all) {
    return callback(null, [
      {
        address,
        family
      }
    ]);
  }

  callback(null, address, family);
}
```

The HTTP client therefore connects to the validated address instead of performing a second uncontrolled DNS lookup.

## Redirect Protection

Automatic redirects are disabled:

```js
maxRedirects: 0
```

A public URL cannot redirect the server to:

```text
localhost
127.0.0.1
Private network addresses
Link-local metadata addresses
Internal services
```

A redirect response may be displayed as a `3xx` result, but SupportHub does not follow the new destination.

Supporting redirects securely in the future would require repeating the full protocol, port, DNS, and IP validation for every redirect hop.

## Proxy Protection

Axios environment proxy behavior is disabled:

```js
proxy: false
```

This ensures that the outbound connection uses the validated and pinned destination instead of being rerouted through an uncontrolled proxy configuration.

## Request Limits

The secured request retains defensive resource limits:

```js
timeout: 4000,
maxContentLength: 200000,
maxBodyLength: 200000
```

These controls limit connection time and response size.

They reduce denial-of-service risk but do not replace destination validation.

## Secure Request

The final secured request uses:

```js
const response = await axios.get(validated.url, {
  timeout: 4000,
  maxContentLength: 200000,
  maxBodyLength: 200000,
  responseType: 'text',
  validateStatus: () => true,
  maxRedirects: 0,
  proxy: false,
  ...agentOptions
});
```

The response reports the validated URL as both the requested and final URL because automatic redirects are disabled.

## Manual Verification

### Public URL Test

The following public URL was submitted:

```text
https://example.com
```

Observed result:

```text
Status 200
Example Domain
```

This confirms that the legitimate URL Preview functionality continues to work.

### Original SSRF Payload Retest

The original internal URL was submitted:

```text
http://127.0.0.1:3000/internal/ops-note
```

If SupportHub uses another port, the corresponding local port was used.

Observed result:

```http
HTTP/1.1 400 Bad Request
```

```json
{
  "error": "Private or restricted network addresses are not allowed.",
  "requestId": "generated-reference-id"
}
```

The internal value below was not returned:

```text
SH-LAB-4821
```

### Additional Restricted Destinations

The following destinations were tested:

```text
http://localhost:3000/internal/ops-note
http://127.0.0.1/
http://10.0.0.1/
http://192.168.1.1/
http://169.254.169.254/
http://[::1]/
```

Every destination was rejected before an outbound connection was created.

### Unsupported Protocol Tests

The following URLs were rejected:

```text
file:///C:/Windows/System32/drivers/etc/hosts
ftp://127.0.0.1/
```

Observed result:

```text
Only HTTP and HTTPS URLs are allowed.
```

### Restricted Port Test

The following URL was rejected:

```text
http://example.com:3000/
```

Observed result:

```text
The requested URL port is not allowed.
```

### Embedded Credentials Test

The following URL was rejected:

```text
http://user:password@example.com/
```

Observed result:

```text
URLs containing credentials are not allowed.
```

### Redirect Test

A public redirect response was not followed automatically.

SupportHub returned the original `3xx` response information without connecting to the redirect destination.

## Regression Verification

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

The previously completed Information Disclosure, OS Command Injection, and CSRF fixes continue to work normally.

## Verification Criteria

The vulnerability is considered fixed because:

- Invalid URLs are rejected.
- Only HTTP and HTTPS are accepted.
- Embedded credentials are rejected.
- Only ports 80 and 443 are accepted.
- Every resolved address is inspected.
- Restricted IPv4 addresses are rejected.
- Restricted IPv6 addresses are rejected.
- Mixed public and private DNS results are rejected.
- The connection is pinned to the validated IP address.
- Automatic redirects are disabled.
- Environment proxy routing is disabled.
- The original internal endpoint cannot be retrieved.
- The value `SH-LAB-4821` is not returned.
- Normal public URL previews continue to work.

## Conclusion

The SSRF vulnerability in the SupportHub URL Preview feature was successfully remediated.

The secured implementation validates the complete URL, restricts protocols and ports, resolves and checks all destination addresses, blocks restricted IPv4 and IPv6 networks, pins the connection to the validated IP, and disables automatic redirects and proxy routing.

Manual retesting confirmed that public HTTPS destinations remain accessible while the original internal endpoint and other restricted destinations are rejected before connection.