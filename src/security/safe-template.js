const APPROVED_FIELDS = new Set([
  'customerName',
  'ticketId',
  'status',
  'agentName'
]);

const PLACEHOLDER_PATTERN =
  /\{\{\s*([a-zA-Z][a-zA-Z0-9]*)\s*\}\}/g;

function validationError(message) {
  const error = new Error(message);
  error.status = 400;
  return error;
}

function renderApprovedTemplate(input, values) {
  const template = String(input || '');

  if (!template.trim()) {
    throw validationError(
      'Template body is required.'
    );
  }

  if (template.length > 5000) {
    throw validationError(
      'Template body is too long.'
    );
  }

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

  // After approved fields are replaced, any remaining Nunjucks opening
  // syntax represents an expression, statement, or comment that users
  // are not permitted to execute.
  if (/\{[{%#]/.test(rendered)) {
    throw validationError(
      'Template contains unsupported syntax.'
    );
  }

  return rendered;
}

module.exports = {
  renderApprovedTemplate,
  APPROVED_FIELDS
};