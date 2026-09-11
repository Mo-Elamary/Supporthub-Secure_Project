# Stored Cross-Site Scripting (XSS) Remediation

## Remediation Summary

| Field | Details |
|---|---|
| Application | SupportHub — Secured Edition |
| Vulnerability | Stored Cross-Site Scripting (Stored XSS) |
| Severity Before Remediation | High |
| CWE | CWE-79 |
| Affected Feature | Ticket Comments |
| Affected Endpoint | `POST /api/tickets/2048/comments` |
| Stored Data Endpoint | `GET /api/tickets/2048/comments` |
| Primary Protection | Safe DOM construction and `textContent` |
| Defense in Depth | Content Security Policy |
| Additional Protection | Server-side and client-side length limits |
| Verification | Normal input, immediate payload, persistence, DOM, and response-header tests |

## Scope

This remediation fixes the Stored Cross-Site Scripting vulnerability in the SupportHub ticket conversation feature.

The vulnerable implementation stored user-controlled comments and later inserted the comment body into the page using HTML-rendering functions such as:

```js
innerHTML
insertAdjacentHTML
```

This allowed an authenticated user to store malicious HTML containing JavaScript event handlers. The payload was executed immediately after submission and again whenever the page loaded the stored comment.

The secured implementation treats ticket comments as plain text. It constructs the message interface using DOM elements and assigns all untrusted values through `textContent`.

The original vulnerable implementation remains in the source files as commented training code, but it is no longer executed.

## Affected Files

```text
src/routes/ticket.routes.js
src/app.js
public/js/app.js
public/dashboard.html
package.json
docs/remediation/xss-fix.md
```

## Original Vulnerable Behavior

The application accepted and stored comment bodies without a length restriction:

```js
// const body = String(req.body.body || '');
```

The submitted comment was returned by the API and inserted directly into the page as HTML:

```js
// document
//   .querySelector('#conversation')
//   .insertAdjacentHTML(
//     'beforeend',
//     `<div class="message-bubble">
//        ${data.comment.body}
//      </div>`
//   );
```

Stored comments were also rendered using `innerHTML` whenever the conversation was loaded:

```js
// conversation.innerHTML = data.comments
//   .map((comment) => `
//     <div class="message">
//       <div class="message-bubble">
//         ${comment.body}
//       </div>
//     </div>
//   `)
//   .join('');
```

Because `comment.body` was controlled by the user, the browser interpreted the stored value as HTML instead of text.

## Proof-of-Concept Payload

The vulnerability was originally confirmed using:

```html
<img src="invalid-image" onerror="alert('XSS_CONFIRMED')">
```

In the vulnerable edition, the browser created an actual `<img>` element. When the image failed to load, its `onerror` event handler executed.

Because the payload was stored in the database, it executed again after closing or refreshing the application.

## Root Cause

The vulnerability was not caused merely by storing HTML-looking text in the database.

The primary security issue occurred when the browser received the stored value and passed it to an unsafe HTML-rendering sink.

The vulnerable data flow was:

```text
User-controlled comment
        |
        v
Stored in the database
        |
        v
Returned by the comments API
        |
        v
Inserted through innerHTML or insertAdjacentHTML
        |
        v
Browser interprets the value as executable HTML
        |
        v
Stored XSS
```

The secured implementation breaks this chain at the browser rendering stage.

## Server-Side Comment Validation

The comment body is converted to a string and trimmed:

```js
const body = String(req.body.body || '').trim();
```

Empty comments are rejected:

```js
if (!body) {
  return res.status(400).json({
    error: 'Comment cannot be empty.'
  });
}
```

Comments longer than 2,000 characters are also rejected:

```js
if (body.length > 2000) {
  return res.status(400).json({
    error: 'Comment cannot exceed 2000 characters.'
  });
}
```

The server retains the submitted text instead of trying to remove selected HTML tags.

This is safe because the browser now renders the value as plain text. It also avoids relying on incomplete blacklists that could be bypassed with alternative HTML elements or event handlers.

## Safe DOM Construction

A dedicated function now creates the DOM structure for each comment:

```js
function createCommentElement(comment) {
  const isStaff = comment.role === 'staff';

  const message = document.createElement('div');
  message.className = isStaff
    ? 'message staff'
    : 'message';

  const avatar = document.createElement('span');
  avatar.className = isStaff
    ? 'avatar avatar-indigo'
    : 'avatar avatar-cyan';

  avatar.textContent = getInitials(comment.author);

  const content = document.createElement('div');

  const metadata = document.createElement('div');
  metadata.className = 'message-meta';

  const author = document.createElement('strong');
  author.textContent = String(comment.author || '');

  const createdAt = document.createElement('small');
  createdAt.textContent = String(comment.createdAt || '');

  metadata.append(author, createdAt);

  const bubble = document.createElement('div');
  bubble.className = 'message-bubble';

  bubble.textContent = String(comment.body || '');

  content.append(metadata, bubble);
  message.append(avatar, content);

  return message;
}
```

All untrusted values are assigned through `textContent`, including:

```text
comment.author
comment.createdAt
comment.body
```

Unlike `innerHTML`, `textContent` does not interpret HTML tags or JavaScript event handlers.

A value such as:

```html
<img src="invalid-image" onerror="alert('XSS_CONFIRMED')">
```

is therefore displayed literally as text.

## Immediate Comment Rendering

After a comment is submitted, the returned value is no longer passed to `insertAdjacentHTML`.

The secured implementation uses:

```js
document
  .querySelector('#conversation')
  .append(createCommentElement(data.comment));
```

This protects the immediate rendering path.

The payload cannot execute directly after the user presses the Send reply button.

## Stored Comment Rendering

When the page loads existing comments, it no longer builds an HTML string using `innerHTML`.

Each stored comment is converted into a safe DOM element:

```js
const commentElements =
  data.comments.map(createCommentElement);

conversation.replaceChildren(...commentElements);
```

This protects the persistent rendering path.

A malicious value already stored in the database is displayed as plain text after refreshing or reopening the application.

## Controlled CSS Classes

CSS class names are selected only from application-controlled values:

```js
const isStaff = comment.role === 'staff';

message.className = isStaff
  ? 'message staff'
  : 'message';

avatar.className = isStaff
  ? 'avatar avatar-indigo'
  : 'avatar avatar-cyan';
```

The application does not copy arbitrary user-controlled strings into class names or HTML attributes.

## Client-Side Length Restriction

The ticket comment field now includes:

```html
<textarea
  id="commentInput"
  maxlength="2000"
  placeholder="Write a reply..."
  required
></textarea>
```

The `maxlength` attribute provides immediate feedback in the browser.

The server-side 2,000-character limit remains the authoritative protection because client-side validation can be bypassed by sending requests directly to the API.

## Content Security Policy

The application now returns a Content Security Policy header:

```http
Content-Security-Policy: default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'
```

The policy is configured using:

```js
res.setHeader(
  'Content-Security-Policy',
  [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data:",
    "connect-src 'self'",
    "object-src 'none'",
    "base-uri 'none'",
    "frame-ancestors 'none'",
    "form-action 'self'"
  ].join('; ')
);
```

Important directives include:

- `script-src 'self'` restricts JavaScript to same-origin external scripts and does not permit inline script event handlers.
- `object-src 'none'` blocks plugin-based embedded content.
- `base-uri 'none'` prevents injected `<base>` elements from changing URL resolution.
- `frame-ancestors 'none'` prevents the application from being embedded in a frame.
- `form-action 'self'` restricts form submissions to the same origin.

The Content Security Policy is a defense-in-depth measure. Safe DOM rendering with `textContent` remains the primary XSS fix.

## Additional Security Headers

The application also returns:

```http
X-Content-Type-Options: nosniff
Referrer-Policy: same-origin
```

`X-Content-Type-Options` prevents MIME-type sniffing, while `Referrer-Policy` limits referrer information sent to other origins.

## API Response Behavior

The comments API may still return the original payload as a JSON string:

```json
{
  "body": "<img src=\"invalid-image\" onerror=\"alert('XSS_CONFIRMED')\">"
}
```

This does not mean the vulnerability remains exploitable.

JSON data is not automatically executed. The security boundary is how the browser handles the value after receiving it.

The secured front end assigns the value through:

```js
bubble.textContent = String(comment.body || '');
```

Therefore, the returned string is displayed as text and is not interpreted as an HTML element.

## Manual Verification

### Normal Comment Test

A normal comment was submitted through the ticket conversation:

```text
This is a normal support reply.
```

Observed result:

- The comment appeared successfully.
- The layout and styling remained correct.
- The comment was stored successfully.
- The comment remained visible after refreshing the page.

This confirms that the legitimate ticket-comment functionality continues to work.

### Immediate XSS Retest

The original payload was submitted:

```html
<img src="invalid-image" onerror="alert('XSS_CONFIRMED')">
```

Observed result:

- No alert appeared.
- The complete payload appeared as visible text.
- No executable image element was created.
- The ticket conversation continued functioning normally.

This confirms that the immediate rendering path is protected.

### Persistence Retest

The page was refreshed after storing the payload.

Observed result:

- No alert appeared after the refresh.
- The stored payload remained visible as plain text.
- The payload did not execute when loaded from the database.

This confirms that the stored rendering path is protected.

### DOM Inspection

The ticket conversation was inspected through the browser developer tools.

Observed result:

- The payload was present as a text node.
- No `<img>` element was created from the payload.
- No `onerror` event handler existed in the rendered DOM.

Expected safe structure:

```html
<div class="message-bubble">
  &lt;img src="invalid-image" onerror="alert('XSS_CONFIRMED')"&gt;
</div>
```

The browser developer tools may display the characters in a normalized form, but they remain text rather than an executable element.

### Security Header Test

The response for `dashboard.html` was inspected in the Network panel.

The response included:

```http
Content-Security-Policy
X-Content-Type-Options: nosniff
Referrer-Policy: same-origin
```

The CSP included:

```text
script-src 'self'
object-src 'none'
base-uri 'none'
frame-ancestors 'none'
form-action 'self'
```

This confirms that browser-level defense-in-depth headers are active.

## Regression Verification

The project syntax checks completed successfully:

```powershell
npm run check
```

The front-end JavaScript is now included in the syntax-check command:

```text
node --check public/js/app.js
```

The existing SQL Injection regression tests also completed successfully:

```powershell
npm run test:sql-injection
```

Observed test summary:

```text
pass 6
fail 0
```

The previously implemented Information Disclosure, OS Command Injection, CSRF, SSRF, and SSTI protections continued to operate during manual testing.


## Security Impact After Remediation

Authenticated users can continue submitting and viewing ticket comments.

They can no longer use the comments feature to:

- Insert executable HTML elements.
- Execute JavaScript event handlers.
- Run a stored payload immediately after submission.
- Run a stored payload after refreshing the page.
- Modify the conversation DOM using submitted markup.
- Inject arbitrary attributes into generated comment elements.
- rely on inline JavaScript if a future unsafe HTML-rendering sink is introduced.

## Verification Criteria

The Stored XSS vulnerability is considered fixed because:

- Comment bodies are rendered through `textContent`.
- Authors and timestamps are rendered through `textContent`.
- Comment elements are constructed using DOM methods.
- User input is no longer passed to `innerHTML`.
- User input is no longer passed to `insertAdjacentHTML`.
- Immediate comment rendering is protected.
- Stored comment rendering after page reload is protected.
- No executable `<img>` element is created from the test payload.
- The original payload is displayed literally.
- A Content Security Policy is active.
- Inline event handlers are not allowed by `script-src`.
- Empty comments are rejected.
- Comments are limited to 2,000 characters on the server.
- The browser field includes a matching length limit.
- Normal comments continue to work.
- Existing regression checks continue to pass.

## Conclusion

The Stored Cross-Site Scripting vulnerability in the SupportHub ticket conversation feature was successfully remediated.

The vulnerable HTML-string rendering operations were replaced with safe DOM construction and `textContent`. Both the immediate submission path and the stored-comment reload path now treat user-controlled values as plain text.

Server-side length validation, a matching browser limit, Content Security Policy, and additional security headers provide further protection.

Manual retesting confirmed that normal comments continue to work while the original XSS payload is displayed safely and cannot execute, including after the page is refreshed.