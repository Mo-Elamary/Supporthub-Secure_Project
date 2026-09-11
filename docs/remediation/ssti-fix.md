# Server-Side Template Injection (SSTI) Remediation

## Remediation Summary

| Field | Details |
|---|---|
| Application | SupportHub — Secured Edition |
| Vulnerability | Server-Side Template Injection (SSTI) |
| Severity Before Remediation | High |
| CWE | CWE-1336 |
| Fixed Feature | Template Studio |
| Fixed Endpoint | `POST /api/templates/render` |
| Removed Component | Nunjucks runtime template evaluation |
| Primary Protection | Allowlisted placeholder replacement |
| Additional Protection | HTML output encoding |
| Verification | Normal template, arithmetic, internal field, statement, and HTML tests |

## Scope

This remediation fixes the Server-Side Template Injection vulnerability in the SupportHub Template Studio.

The vulnerable implementation passed complete user-controlled text to the Nunjucks `renderString()` function. This caused the server to compile and evaluate expressions supplied by an authenticated user.

The secured implementation does not compile user input with a template engine. It treats the submitted template as text and replaces only four explicitly approved placeholders.

The original vulnerable implementation remains inside the source files as commented training code. It is no longer executed by the application.

## Affected Files

```text
src/security/safe-template.js
src/routes/template.routes.js
public/js/app.js
public/dashboard.html
package.json
package-lock.json
docs/remediation/ssti-fix.md
```

## Original Vulnerable Behavior

The vulnerable implementation created a Nunjucks environment:

```js
// const templateEnvironment = new nunjucks.Environment(null, {
//   autoescape: false,
//   throwOnUndefined: false
// });
```

It then passed complete user-controlled text to:

```js
// const rendered = templateEnvironment.renderString(template, {
//   customerName: 'Youssef Adel',
//   ticketId: '#SH-2048',
//   status: 'In Progress',
//   agentName: req.session.user.name,
//   internalNote:
//     'Escalate billing failures to team-alpha'
// });
```

A harmless arithmetic payload:

```text
{{ 7 * 7 }}
```

was evaluated by the server and returned:

```text
49
```

The following payload accessed a server-side value that was not listed in the user interface:

```text
{{ internalNote }}
```

It returned:

```text
Escalate billing failures to team-alpha
```

These results confirmed that user-controlled content was being compiled as a server-side template.

## Security Design

The secured rendering process follows this flow:

```text
User-provided template
        |
        v
Confirm the body is present
        |
        v
Apply maximum length
        |
        v
Identify placeholder syntax
        |
        v
Allow only four approved field names
        |
        v
Reject expressions, statements, and comments
        |
        v
Replace approved placeholders as plain text
        |
        v
HTML-encode the result in the browser
```

No user-controlled value is passed to Nunjucks or another general-purpose template engine.

## Approved Placeholder Allowlist

The secured application permits only:

```text
customerName
ticketId
status
agentName
```

The allowlist is defined as:

```js
const APPROVED_FIELDS = new Set([
  'customerName',
  'ticketId',
  'status',
  'agentName'
]);
```

Internal values such as `internalNote` are not included in the rendering context or the allowlist.

## Safe Placeholder Recognition

The application recognizes only simple variable placeholders:

```js
const PLACEHOLDER_PATTERN =
  /\{\{\s*([a-zA-Z][a-zA-Z0-9]*)\s*\}\}/g;
```

Examples of valid placeholders:

```text
{{ customerName }}
{{ticketId}}
{{ status }}
{{ agentName }}
```

Expressions, property access, function calls, filters, loops, and template statements are not accepted.

## Template Validation

The secured renderer rejects empty templates:

```js
if (!template.trim()) {
  throw validationError(
    'Template body is required.'
  );
}
```

It also limits the template length:

```js
if (template.length > 5000) {
  throw validationError(
    'Template body is too long.'
  );
}
```

This prevents unexpected or excessively large template submissions.

## Approved Field Replacement

Each recognized placeholder is checked against the allowlist:

```js
const rendered = template.replace(
  PLACEHOLDER_PATTERN,
  (original, fieldName) => {
    if (!APPROVED_FIELDS.has(fieldName)) {
      throw validationError(
        'Template contains an unsupported field.'
      );
    }

    return String(values[fieldName] ?? '');
  }
);
```

An unapproved field receives:

```http
HTTP/1.1 400 Bad Request
```

```json
{
  "error": "Template contains an unsupported field.",
  "requestId": "generated-reference-id"
}
```

## Expression and Statement Rejection

After the approved placeholders are replaced, the renderer checks for remaining template-engine opening syntax:

```js
if (/\{[{%#]/.test(rendered)) {
  throw validationError(
    'Template contains unsupported syntax.'
  );
}
```

This rejects syntax including:

```text
{{ expression }}
{% statement %}
{# comment #}
```

The arithmetic expression below is therefore rejected rather than evaluated:

```text
{{ 7 * 7 }}
```

## Secure Route Implementation

The secured route calls only the restricted renderer:

```js
const rendered = renderApprovedTemplate(template, {
  customerName: 'Youssef Adel',
  ticketId: '#SH-2048',
  status: 'In Progress',
  agentName: req.session.user.name
});
```

The internal value used by the vulnerable edition was removed:

```text
internalNote
```

The submitted text is never passed to `renderString()` or another runtime template compiler.

## Title Validation

The report title is trimmed and limited to 120 characters:

```js
const title = String(
  req.body.title || 'Ticket Resolution Summary'
).trim();

if (title.length > 120) {
  return res.status(400).json({
    error: 'Template title is too long.'
  });
}
```

An empty title falls back to:

```text
Ticket Resolution Summary
```

## Nunjucks Removal

Nunjucks is no longer required by the secured implementation.

The package was removed using:

```powershell
npm uninstall nunjucks
```

The following files were updated:

```text
package.json
package-lock.json
```

The removal also deleted Nunjucks-specific transitive dependencies that were no longer needed.

Keeping an unused general-purpose template engine out of the application reduces the available attack surface.

## Front-End Output Encoding

The vulnerable front end inserted the rendered result directly into `innerHTML`:

```js
// <p>${data.rendered.replaceAll('\n', '<br>')}</p>
```

Even after preventing SSTI, inserting user-controlled HTML without encoding could create a separate browser-side injection risk.

The secured front end encodes the result first:

```js
const safeRendered = escapeHtml(data.rendered)
  .replaceAll('\n', '<br>');
```

It then inserts the encoded value:

```js
document.querySelector('#templateResult').innerHTML =
  `<span class="document-logo">S</span>
   <h3>${escapeHtml(data.title)}</h3>
   <p>${safeRendered}</p>
   <footer>Generated by SupportHub · Internal use</footer>`;
```

The `<br>` elements are generated by trusted application code. HTML supplied by the user is displayed as text rather than interpreted by the browser.

## Manual Verification

### Normal Template Test

The following approved template was submitted:

```text
Hello {{ customerName }},

Your ticket {{ ticketId }} has been reviewed.

Status: {{ status }}
Assigned agent: {{ agentName }}
```

Observed result:

```text
Hello Youssef Adel,

Your ticket #SH-2048 has been reviewed.

Status: In Progress
Assigned agent: Authenticated User
```

This confirms that the legitimate Template Studio functionality continues to work.

### Arithmetic Expression Retest

The original detection payload was submitted:

```text
SSTI calculation result: {{ 7 * 7 }}
```

Observed result:

```http
HTTP/1.1 400 Bad Request
```

```json
{
  "error": "Template contains unsupported syntax.",
  "requestId": "generated-reference-id"
}
```

The application did not return:

```text
49
```

### Internal Context Retest

The following value was submitted:

```text
Internal note: {{ internalNote }}
```

Observed result:

```http
HTTP/1.1 400 Bad Request
```

```json
{
  "error": "Template contains an unsupported field.",
  "requestId": "generated-reference-id"
}
```

The internal value below was not disclosed:

```text
Escalate billing failures to team-alpha
```

### Template Statement Test

The following Nunjucks statement was submitted:

```text
{% for item in [1, 2, 3] %}
{{ item }}
{% endfor %}
```

Observed result:

```text
Template contains unsupported syntax.
```

No loop or template statement was executed.

### HTML Output Test

The following HTML was submitted:

```html
Hello <img src="invalid" onerror="alert('TEMPLATE_XSS')">
```

Observed result:

- No JavaScript alert appeared.
- The `<img>` markup was displayed as text.
- No image element was created.
- The event handler did not execute.

This confirms that the rendered output is encoded before being inserted into the page.

## Regression Verification

The following commands complete successfully:

```powershell
npm run check
npm run test:sql-injection
```

The SQL Injection regression suite continues to report:

```text
pass 6
fail 0
```

The Information Disclosure, OS Command Injection, CSRF, and SSRF remediations continue to work during manual testing.

## Security Impact After Remediation

Authenticated users can continue creating ticket summaries using approved placeholders.

They can no longer use Template Studio to:

- Evaluate arbitrary template expressions.
- Execute Nunjucks statements or loops.
- Access unapproved server-side context variables.
- Invoke filters or template-engine functionality.
- Use the server as a general-purpose template interpreter.
- Insert executable HTML through the template result.

## Verification Criteria

The vulnerability is considered fixed because:

- User-controlled text is not compiled by Nunjucks.
- Nunjucks was removed from application dependencies.
- Only four approved placeholders are supported.
- Unapproved fields are rejected.
- Arithmetic expressions are rejected.
- Template statements are rejected.
- Template comments are rejected.
- The internal note is no longer provided to the renderer.
- Template and title lengths are limited.
- Output is HTML encoded.
- The original payload does not produce `49`.
- Normal approved templates still render correctly.

## Conclusion

The Server-Side Template Injection vulnerability in SupportHub Template Studio was successfully remediated.

The general-purpose Nunjucks evaluation of user-controlled templates was replaced with a restricted allowlist-based placeholder renderer. Internal context data was removed, unsupported syntax is rejected, and the final output is encoded before browser rendering.

Manual retesting confirmed that normal approved templates continue to work while arithmetic expressions, internal fields, Nunjucks statements, and executable HTML are rejected or displayed safely.