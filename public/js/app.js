let tickets = [];
let currentUser = null;

const pageTitles = {
  overview: 'Overview', tickets: 'Tickets', 'url-preview': 'URL Preview', diagnostics: 'Diagnostics',
  templates: 'Template Studio', system: 'System Info', profile: 'Profile'
};

const sidebar = document.querySelector('#sidebar');
const sidebarOverlay = document.querySelector('#sidebarOverlay');
const ticketModal = document.querySelector('#ticketModal');
const toastRegion = document.querySelector('#toastRegion');

document.querySelector('#menuButton').addEventListener('click', openSidebar);
document.querySelector('#sidebarClose').addEventListener('click', closeSidebar);
sidebarOverlay.addEventListener('click', closeSidebar);

document.querySelectorAll('[data-page-link]').forEach((link) => {
  link.addEventListener('click', (event) => {
    event.preventDefault();
    openPage(link.dataset.pageLink);
  });
});

function openPage(name) {
  const target = document.querySelector(`[data-page="${name}"]`);
  if (!target) return;
  document.querySelectorAll('.page').forEach((page) => page.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach((item) => item.classList.toggle('active', item.dataset.pageLink === name));
  target.classList.add('active');
  document.querySelector('#pageTitle').textContent = pageTitles[name];
  document.querySelector('#breadcrumbCurrent').textContent = pageTitles[name];
  window.location.hash = name;
  window.scrollTo({ top: 0, behavior: 'smooth' });
  closeSidebar();
  if (name === 'system') loadSystemInfo();
  if (name === 'profile') loadProfile();
}

function openSidebar() { sidebar.classList.add('open'); sidebarOverlay.classList.add('show'); }
function closeSidebar() { sidebar.classList.remove('open'); sidebarOverlay.classList.remove('show'); }
function priorityClass(priority) { return `badge-${String(priority).toLowerCase()}`; }
function statusClass(status) { return `status-${String(status).toLowerCase().replace(' ', '-')}`; }
function getInitials(name) { return String(name).split(/\s+/).slice(0, 2).map((part) => part[0]?.toUpperCase() || '').join(''); }
function escapeHtml(value) { const span = document.createElement('span'); span.textContent = String(value); return span.innerHTML; }

async function api(url, options = {}) {
  const response = await fetch(url, options);
  let data;
  try { data = await response.json(); } catch { data = { error: 'The server returned an unreadable response.' }; }
  if (response.status === 401) { window.location.href = '/'; throw new Error('Your session has expired.'); }
  if (!response.ok) throw new Error(data.error || `Request failed (${response.status}).`);
  return data;
}

async function loadTickets(search = '') {
  try {
    // VULNERABILITY HOOK (SQL Injection): Part 3 makes the server-side search query unsafe.
    const path = search ? `/api/tickets/search?q=${encodeURIComponent(search)}` : '/api/tickets';
    const data = await api(path);
    tickets = data.tickets;
    renderPriorityTickets();
    renderTicketTable();
  } catch (error) { showToast(error.message, 'info'); }
}

function renderPriorityTickets() {
  document.querySelector('#priorityTicketList').innerHTML = tickets.slice(0, 4).map((ticket) => `
    <button class="ticket-row" data-ticket-jump>
      <span class="priority-line ${String(ticket.priority).toLowerCase()}"></span>
      <span class="ticket-main"><small>#SH-${ticket.id}</small><strong>${escapeHtml(ticket.subject)}</strong><span>${escapeHtml(ticket.customer)} · ${escapeHtml(ticket.updated)}</span></span>
      <span class="badge ${priorityClass(ticket.priority)}">${escapeHtml(ticket.priority)}</span><span class="ticket-arrow">›</span>
    </button>`).join('');
  document.querySelectorAll('[data-ticket-jump]').forEach((button) => button.addEventListener('click', () => openPage('tickets')));
}

function renderTicketTable() {
  const search = document.querySelector('#ticketSearch').value.toLowerCase();
  const status = document.querySelector('#statusFilter').value;
  const priority = document.querySelector('#priorityFilter').value;
  const filtered = tickets.filter((ticket) => {
    const matchesText = `${ticket.id} ${ticket.subject} ${ticket.customer}`.toLowerCase().includes(search);
    return matchesText && (status === 'all' || ticket.status === status) && (priority === 'all' || ticket.priority === priority);
  });

  document.querySelector('#ticketTableBody').innerHTML = filtered.map((ticket) => `
    <tr><td><span class="ticket-cell"><small>#SH-${ticket.id}</small><strong>${escapeHtml(ticket.subject)}</strong></span></td>
    <td><span class="customer-cell"><span class="avatar avatar-soft">${getInitials(ticket.customer)}</span>${escapeHtml(ticket.customer)}</span></td>
    <td><span class="status-label ${statusClass(ticket.status)}"><i></i>${escapeHtml(ticket.status)}</span></td>
    <td><span class="badge ${priorityClass(ticket.priority)}">${escapeHtml(ticket.priority)}</span></td>
    <td><span class="assignee"><span class="avatar avatar-indigo">${getInitials(ticket.assignee)}</span>${escapeHtml(ticket.assignee)}</span></td>
    <td class="muted-cell">${escapeHtml(ticket.updated)}</td><td><button class="icon-button">•••</button></td></tr>`).join('');
  document.querySelector('#ticketCount').textContent = `Showing ${filtered.length} of ${tickets.length} tickets`;
}

document.querySelector('#ticketSearch').addEventListener('input', renderTicketTable);
document.querySelector('#statusFilter').addEventListener('input', renderTicketTable);
document.querySelector('#priorityFilter').addEventListener('input', renderTicketTable);
document.querySelector('#globalSearch').addEventListener('keydown', (event) => {
  if (event.key === 'Enter') {
    document.querySelector('#ticketSearch').value = event.target.value;
    loadTickets(event.target.value);
    openPage('tickets');
  }
});

document.addEventListener('keydown', (event) => {
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') { event.preventDefault(); document.querySelector('#globalSearch').focus(); }
  if (event.key === 'Escape') { closeModal(); closeSidebar(); }
});

document.querySelectorAll('[data-open-ticket-modal]').forEach((button) => button.addEventListener('click', openModal));
document.querySelectorAll('[data-close-modal]').forEach((button) => button.addEventListener('click', closeModal));
function openModal() { ticketModal.classList.add('show'); ticketModal.setAttribute('aria-hidden', 'false'); document.querySelector('#newTicketSubject').focus(); }
function closeModal() { ticketModal.classList.remove('show'); ticketModal.setAttribute('aria-hidden', 'true'); }

document.querySelector('#newTicketForm').addEventListener('submit', async (event) => {
  event.preventDefault();
  try {
    await api('/api/tickets', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ subject: document.querySelector('#newTicketSubject').value.trim(), customer: document.querySelector('#newTicketCustomer').value.trim(), priority: document.querySelector('#newTicketPriority').value, description: document.querySelector('#newTicketDescription').value.trim() })
    });
    closeModal(); event.target.reset(); await loadTickets(); showToast('Ticket created successfully.'); openPage('tickets');
  } catch (error) { showToast(error.message, 'info'); }
});

document.querySelector('#commentForm').addEventListener('submit', async (event) => {
  event.preventDefault();
  const value = document.querySelector('#commentInput').value.trim();
  if (!value) return;
  try {
    const data = await api('/api/tickets/2048/comments', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ body: value }) });
    // INTENTIONALLY VULNERABLE (Stored XSS): data.comment.body came from the user,
    // was stored by the server, and is inserted as HTML without output encoding.
    document.querySelector('#conversation').insertAdjacentHTML('beforeend', `<div class="message staff"><span class="avatar avatar-indigo">${escapeHtml(currentUser.initials)}</span><div><div class="message-meta"><strong>${escapeHtml(currentUser.name)}</strong><small>Just now</small></div><div class="message-bubble">${data.comment.body}</div></div></div>`);
    event.target.reset(); showToast('Reply added to the conversation.');
  } catch (error) { showToast(error.message, 'info'); }
});

async function loadComments() {
  try {
    const data = await api('/api/tickets/2048/comments');
    // INTENTIONALLY VULNERABLE (Stored XSS): stored comment bodies are rendered
    // directly as HTML. Refreshing the page retrieves the malicious value again.
    document.querySelector('#conversation').innerHTML = data.comments.map((comment) => `
      <div class="message ${comment.role === 'staff' ? 'staff' : ''}">
        <span class="avatar ${comment.role === 'staff' ? 'avatar-indigo' : 'avatar-cyan'}">${getInitials(comment.author)}</span>
        <div><div class="message-meta"><strong>${escapeHtml(comment.author)}</strong><small>${escapeHtml(comment.createdAt)}</small></div>
        <div class="message-bubble">${comment.body}</div></div>
      </div>`).join('');
  } catch (error) { showToast(error.message, 'info'); }
}

async function loadTeam() {
  try {
    const data = await api('/api/profile/team');
    const avatarClasses = ['avatar-indigo', 'avatar-cyan', 'avatar-orange', 'avatar-indigo', 'avatar-cyan'];
    document.querySelector('#teamList').innerHTML = data.members.map((member, index) => `
      <div class="team-person">
        <span class="avatar ${avatarClasses[index % avatarClasses.length]}">${escapeHtml(member.initials)}<i></i></span>
        <span><strong>${escapeHtml(member.fullName)}</strong><small>${escapeHtml(member.role)} · ${member.activeTickets} active tickets</small></span>
        <span class="presence ${index === 3 ? 'away' : 'online'}">${index === 3 ? 'Reviewing' : 'Online'}</span>
      </div>`).join('');
  } catch (error) { showToast(error.message, 'info'); }
}

document.querySelector('#urlPreviewForm').addEventListener('submit', async (event) => {
  event.preventDefault();
  const url = document.querySelector('#previewUrl').value.trim();
  const result = document.querySelector('#urlPreviewResult');
  result.innerHTML = '<div class="loading-state"><span class="loader"></span><p>Fetching page metadata...</p></div>';
  try {
    const data = await api('/api/tools/preview', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url }) });
    result.innerHTML = `<div class="preview-browser"><div class="browser-bar"><span></span><span></span><span></span><small>${escapeHtml(data.finalUrl)}</small></div><div class="preview-content"><span class="preview-logo">S</span><span class="eyebrow">Fetched preview</span><h3>${escapeHtml(data.title)}</h3><p>${escapeHtml(data.description)}</p><a href="#">${escapeHtml(data.requestedUrl)}</a></div></div><div class="response-strip"><span>Status <strong>${data.status}</strong></span><span>Content type <strong>${escapeHtml(data.contentType)}</strong></span></div>`;
  } catch (error) { result.innerHTML = `<div class="empty-state"><span class="empty-icon">!</span><h3>Preview failed</h3><p>${escapeHtml(error.message)}</p></div>`; }
});

document.querySelectorAll('.recent-values button').forEach((button) => button.addEventListener('click', () => { document.querySelector('#diagnosticHost').value = button.textContent; }));
document.querySelector('#diagnosticForm').addEventListener('submit', async (event) => {
  event.preventDefault();
  const host = document.querySelector('#diagnosticHost').value.trim();
  const output = document.querySelector('#terminalOutput');
  output.textContent = `Running connectivity test for ${host}...`;
  try { const data = await api('/api/tools/ping', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ host }) }); output.textContent = `$ ${data.command}\n${data.output}`; }
  catch (error) { output.textContent = error.message; }
});
document.querySelector('#clearTerminal').addEventListener('click', () => { document.querySelector('#terminalOutput').innerHTML = '<span class="terminal-muted">Ready. Run a diagnostic to see the result.</span>'; });

document.querySelectorAll('[data-variable]').forEach((button) => button.addEventListener('click', () => {
  const textarea = document.querySelector('#templateBody'); const start = textarea.selectionStart;
  textarea.value = `${textarea.value.slice(0, start)}${button.dataset.variable}${textarea.value.slice(textarea.selectionEnd)}`;
  textarea.focus(); textarea.selectionStart = textarea.selectionEnd = start + button.dataset.variable.length;
}));

document.querySelector('#templateForm').addEventListener('submit', async (event) => {
  event.preventDefault();
  try {
    const data = await api('/api/templates/render', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title: document.querySelector('#templateTitle').value, template: document.querySelector('#templateBody').value }) });
    document.querySelector('#templateResult').innerHTML = `<span class="document-logo">S</span><h3>${escapeHtml(data.title)}</h3><p>${data.rendered.replaceAll('\n', '<br>')}</p><footer>Generated by SupportHub · Internal use</footer>`;
    showToast('Template rendered by the server.');
  } catch (error) { showToast(error.message, 'info'); }
});
document.querySelector('#resetTemplate').addEventListener('click', () => { document.querySelector('#templateForm').reset(); showToast('Template reset.', 'info'); });

async function loadSystemInfo() {
  try {
    const data = await api('/api/system/info');
    const values = document.querySelectorAll('.details-panel dd');
    const details = [data.application, data.environment, data.runtime, data.database, data.hostname, data.debugMode ? 'Enabled' : 'Disabled'];
    values.forEach((element, index) => { element.textContent = details[index]; });
  } catch (error) { showToast(error.message, 'info'); }
}

document.querySelector('#refreshSystem').addEventListener('click', async () => { await loadSystemInfo(); showToast('System status refreshed.'); });
document.querySelector('#triggerError').addEventListener('click', async () => {
  const output = document.querySelector('#errorOutput'); output.hidden = false;
  const response = await fetch('/api/system/error-test');
  const data = await response.json();
  output.textContent = `${data.name}: ${data.error}\n${data.stack || ''}\nWorking directory: ${data.workingDirectory || 'unknown'}`;
});

async function loadProfile() {
  try {
    const data = await api('/api/profile'); const profile = data.profile;
    Object.entries(profile).forEach(([key, value]) => { const input = document.querySelector(`[name="${key}"]`); if (input) input.value = value; });
    document.querySelector('#profileFullName').textContent = profile.fullName;
    document.querySelector('#profileRole').textContent = profile.role;
    document.querySelector('#profileInitials').firstChild.nodeValue = profile.initials;
    document.querySelector('#profileResolved').textContent = profile.resolvedCount;
    document.querySelector('#profileJoined').textContent = new Date(profile.joinedAt).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  } catch (error) { showToast(error.message, 'info'); }
}

document.querySelector('#profileForm').addEventListener('submit', async (event) => {
  event.preventDefault();
  const body = Object.fromEntries(new FormData(event.target).entries());
  try {
    // INTENTIONALLY VULNERABLE (CSRF): no CSRF token is sent with this state change.
    await api('/api/profile/update', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    showToast('Profile changes saved.');
  } catch (error) { showToast(error.message, 'info'); }
});

document.querySelector('#notificationButton').addEventListener('click', () => showToast('You have 3 new ticket updates.', 'info'));
document.querySelector('#sidebarUser').addEventListener('click', () => openPage('profile'));
function showToast(message, type = 'success') { const toast = document.createElement('div'); toast.className = `toast ${type}`; toast.textContent = message; toastRegion.appendChild(toast); requestAnimationFrame(() => toast.classList.add('show')); window.setTimeout(() => { toast.classList.remove('show'); window.setTimeout(() => toast.remove(), 250); }, 3000); }

(async function initializeApp() {
  try {
    const auth = await api('/api/auth/me');
    currentUser = auth.user;
    document.querySelector('#currentUserName').textContent = currentUser.name;
    document.querySelector('#currentUserRole').textContent = currentUser.role;
    document.querySelector('#currentUserInitials').textContent = currentUser.initials;
    document.querySelector('#welcomeMessage').textContent = `Good morning, ${currentUser.name.split(' ')[0]}.`;
    await Promise.all([loadTickets(), loadComments(), loadTeam()]);
    openPage(window.location.hash.slice(1) || 'overview');
  }
  catch { window.location.href = '/'; }
})();
