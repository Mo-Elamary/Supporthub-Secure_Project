# Cross-Site Request Forgery (CSRF) Remediation

## Remediation Summary

| Field | Details |
|---|---|
| Application | SupportHub — Secured Edition |
| Vulnerability | Cross-Site Request Forgery (CSRF) |
| Severity Before Remediation | High |
| CWE | CWE-352 |
| Fixed Feature | User Profile Update |
| Fixed Endpoint | `POST /api/profile/update` |
| Authentication Required | Yes |
| Primary Protection | Synchronizer CSRF Token |
| Additional Protections | Origin validation and `SameSite=Lax` |
| Verification | Legitimate request, missing token, invalid token, and external PoC tests |

## Scope

This remediation fixes the CSRF vulnerability affecting the SupportHub profile-update operation.

The vulnerable implementation relied only on the authenticated user's session cookie. An external page could therefore submit a forged profile-update form while the victim was signed in.

The secured implementation requires a session-specific CSRF token before performing any profile database operation.

The original vulnerable code remains inside the source files as commented training code. It is no longer executed by the application.

## Affected Files

```text
src/middleware/require-csrf-token.js
src/routes/auth.routes.js
src/routes/profile.routes.js
src/app.js
public/js/app.js
package.json
docs/remediation/csrf-fix.md
```

## Original Vulnerable Behavior

The vulnerable profile endpoint accepted a state-changing request based only on the session cookie:

```js
// router.post('/update', (req, res) => {
//   Profile update performed without CSRF validation.
// });
```

The front end submitted the profile data without a CSRF token:

```js
// await api('/api/profile/update', {
//   method: 'POST',
//   headers: {
//     'Content-Type': 'application/json'
//   },
//   body: JSON.stringify(body)
// });
```

An external page running on another origin could submit:

```html
<form
  action="http://127.0.0.1:3000/api/profile/update"
  method="POST"
>
  <input
    type="hidden"
    name="jobTitle"
    value="CSRF Proof Confirmed"
  >
</form>
```

The browser included the victim's active session cookie, and the server processed the request without confirming that it came from the legitimate SupportHub interface.

## Security Design

The remediation uses the synchronizer-token pattern:

```text
Authenticated login
        |
        v
Server generates a random CSRF token
        |
        v
Token is stored in the user's session
        |
        v
Dashboard retrieves the token
        |
        v
Profile request sends X-CSRF-Token
        |
        v
Server compares the submitted and stored tokens
        |
        v
Request accepted or rejected before database access
```

The token is bound to the authenticated session. An external page may cause the browser to send cookies, but it cannot read the CSRF token from SupportHub because of the browser's Same-Origin Policy.

## Token Generation

The affected login route is located in:

```text
src/routes/auth.routes.js
```

A new cryptographically random token is generated after successful authentication:

```js
req.session.csrfToken =
  crypto.randomBytes(32).toString('hex');
```

The token contains 32 random bytes represented as a hexadecimal string.

A new token is generated whenever a user signs in, preventing reuse of a token from an earlier authenticated session.

## Token Retrieval Endpoint

The dashboard obtains the token from:

```text
GET /api/auth/csrf-token
```

The endpoint requires an authenticated session:

```js
router.get('/csrf-token', (req, res) => {
  if (!req.session.user) {
    return res.status(401).json({
      error: 'Not signed in.'
    });
  }

  if (!req.session.csrfToken) {
    req.session.csrfToken =
      crypto.randomBytes(32).toString('hex');
  }

  res.set('Cache-Control', 'no-store');

  res.json({
    csrfToken: req.session.csrfToken
  });
});
```

The `Cache-Control: no-store` header prevents the response containing the token from being stored in browser or intermediary caches.

The endpoint does not enable cross-origin resource sharing, so an external origin cannot read the response.

## CSRF Validation Middleware

A new middleware was created:

```text
src/middleware/require-csrf-token.js
```

The middleware reads:

- The expected token from the authenticated session.
- The submitted token from the `X-CSRF-Token` request header.

```js
const expectedToken = req.session.csrfToken;
const providedToken = req.get('X-CSRF-Token');
```

Empty tokens and tokens with different lengths are rejected.

Tokens with equal lengths are compared using:

```js
crypto.timingSafeEqual(expected, provided)
```

This avoids a normal string comparison for the security-sensitive token.

Missing or incorrect tokens receive:

```http
HTTP/1.1 403 Forbidden
```

```json
{
  "error": "Invalid or missing CSRF token."
}
```

## Origin Validation

The middleware also validates the browser's `Origin` header when it is present:

```js
const requestOrigin = req.get('Origin');

if (requestOrigin) {
  const expectedOrigin =
    `${req.protocol}://${req.get('host')}`;

  if (requestOrigin !== expectedOrigin) {
    return res.status(403).json({
      error: "Cross-origin request rejected."
    });
  }
}
```

A request from a different port or origin is rejected before the token comparison and before any database operation.

Origin validation is used as defense in depth. The CSRF token remains the primary protection.

## Protected Profile Endpoint

The affected route is located in:

```text
src/routes/profile.routes.js
```

The vulnerable route definition remains as a comment:

```js
// router.post('/update', (req, res) => {
```

The secured route applies the middleware before the update handler:

```js
router.post(
  '/update',
  requireCsrfToken,
  (req, res) => {
    // Profile database operations run only after CSRF validation.
  }
);
```

A missing, invalid, or cross-origin token stops the request before the application reads or updates profile data.

## Session Cookie Hardening

The session configuration is located in:

```text
src/app.js
```

The vulnerable version used:

```js
// saveUninitialized: true,
// cookie: {
//   httpOnly: true,
//   sameSite: false,
//   secure: false
// }
```

The secured configuration uses:

```js
saveUninitialized: false,
cookie: {
  httpOnly: true,
  sameSite: 'lax',
  secure: process.env.NODE_ENV === 'production',
  maxAge: 1000 * 60 * 60 * 4
}
```

The security properties are:

- `httpOnly` prevents browser JavaScript from reading the session cookie.
- `SameSite=Lax` provides additional browser-level CSRF protection.
- `secure` becomes enabled when the application runs in production with HTTPS.
- `saveUninitialized=false` prevents unnecessary empty sessions.

`SameSite` is an additional defense and is not treated as a replacement for the CSRF token.

## Front-End Integration

The dashboard stores the token only in the current page's JavaScript memory:

```js
let csrfToken = null;
```

After confirming the authenticated session, it retrieves the token:

```js
const csrf = await api('/api/auth/csrf-token');
csrfToken = csrf.csrfToken;
```

The legitimate profile request includes:

```js
headers: {
  'Content-Type': 'application/json',
  'X-CSRF-Token': csrfToken
}
```

The token is not placed in the URL, where it could appear in browser history, access logs, or referrer information.

## Manual Verification

### Legitimate Profile Update

1. Start SupportHub.
2. Sign in with a valid demonstration account.
3. Open the Profile page.
4. Change the job title.
5. Click `Save changes`.
6. Inspect `POST /api/profile/update` in the Network panel.

Observed result:

```text
HTTP 200
Profile changes saved.
```

The request headers contain:

```text
X-CSRF-Token: session-specific-random-value
```

This confirms that legitimate profile updates continue to work.

### Missing Token Test

A direct request was submitted without `X-CSRF-Token`.

Observed result:

```http
HTTP/1.1 403 Forbidden
```

```json
{
  "error": "Invalid or missing CSRF token."
}
```

The profile remained unchanged.

### Invalid Token Test

A request was submitted with:

```text
X-CSRF-Token: invalid-token
```

Observed result:

```http
HTTP/1.1 403 Forbidden
```

The profile remained unchanged.

### External PoC Retest

The original CSRF proof-of-concept page was opened from a different origin while the victim remained signed in.

Observed result:

```http
HTTP/1.1 403 Forbidden
```

```json
{
  "error": "Cross-origin request rejected."
}
```

After refreshing the SupportHub Profile page, the job title had not changed to:

```text
CSRF Proof Confirmed
```

This confirms that the original exploit no longer succeeds.

## Regression Verification

The following checks complete successfully:

```powershell
npm run check
npm run test:sql-injection
```

The previous SQL Injection regression suite continues to report:

```text
pass 6
fail 0
```

The Information Disclosure and OS Command Injection fixes also continue to function normally during manual testing.


## Verification Criteria

The vulnerability is considered fixed because:

- A CSRF token is generated after authentication.
- The token is stored in the server-side session.
- The token endpoint requires authentication.
- The token response is not cacheable.
- Legitimate profile requests include the token in a custom header.
- Missing tokens are rejected.
- Incorrect tokens are rejected.
- Cross-origin requests are rejected.
- Token comparison uses `timingSafeEqual()`.
- Session cookies use `SameSite=Lax`.
- The original PoC cannot modify the profile.
- Normal profile updates continue to work.

## Conclusion

The CSRF vulnerability affecting the SupportHub profile-update endpoint was successfully remediated.

The secured implementation uses a session-bound synchronizer token as the primary defense, with Origin validation and hardened cookie settings as additional protections.

Manual testing confirmed that legitimate profile updates succeed while requests with missing tokens, invalid tokens, and the original cross-origin proof of concept are rejected with HTTP `403`.