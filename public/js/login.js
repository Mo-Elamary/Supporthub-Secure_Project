const loginForm = document.querySelector('#loginForm');
const passwordInput = document.querySelector('#password');
const passwordToggle = document.querySelector('.password-toggle');
const loginError = document.querySelector('#loginError');
const toastRegion = document.querySelector('#toastRegion');

passwordToggle.addEventListener('click', () => {
  const showing = passwordInput.type === 'text';
  passwordInput.type = showing ? 'password' : 'text';
  passwordToggle.setAttribute('aria-label', showing ? 'Show password' : 'Hide password');
});

document.querySelector('#forgotPassword').addEventListener('click', (event) => {
  event.preventDefault();
  showToast('Password recovery is disabled in the training environment.', 'info');
});

loginForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  loginError.textContent = '';

  const email = document.querySelector('#email').value.trim();
  const password = passwordInput.value;
  const submitButton = loginForm.querySelector('button[type="submit"]');

  if (!email || !password) {
    loginError.textContent = 'Please enter your email and password.';
    return;
  }

  submitButton.disabled = true;
  submitButton.innerHTML = '<span class="button-spinner"></span> Signing in...';

  try {
    // VULNERABILITY HOOK (SQL Injection): Part 3 connects this request to the
    // intentionally unsafe SQLite login query in the Node.js back-end.
    const response = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    });

    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Sign in failed.');
    window.location.href = '/dashboard.html';
  } catch (error) {
    loginError.textContent = error.message;
    submitButton.disabled = false;
    submitButton.innerHTML = 'Sign in <span aria-hidden="true">→</span>';
  }
});

function showToast(message, type = 'success') {
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.textContent = message;
  toastRegion.appendChild(toast);
  window.setTimeout(() => toast.classList.add('show'), 10);
  window.setTimeout(() => {
    toast.classList.remove('show');
    window.setTimeout(() => toast.remove(), 250);
  }, 3000);
}
