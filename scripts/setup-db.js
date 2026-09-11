require('dotenv').config();

const { db, databasePath } = require('../src/database/database');
const { hashPassword } = require('../src/security/password');

const schema = `
  CREATE TABLE IF NOT EXISTS company_settings (
    id INTEGER PRIMARY KEY,
    company_name TEXT NOT NULL,
    workspace_name TEXT NOT NULL,
    support_email TEXT NOT NULL,
    environment TEXT NOT NULL DEFAULT 'Training Lab'
  );

  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY,
    full_name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE,
    -- VULNERABLE SCHEMA (removed): password TEXT NOT NULL stored raw passwords.
    -- SECURE SCHEMA: only a salted, one-way scrypt representation is persisted.
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL,
    initials TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'Active',
    joined_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS user_profiles (
    user_id INTEGER PRIMARY KEY,
    first_name TEXT NOT NULL,
    last_name TEXT NOT NULL,
    job_title TEXT NOT NULL,
    timezone TEXT NOT NULL,
    bio TEXT NOT NULL,
    resolved_count INTEGER NOT NULL DEFAULT 0,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS customers (
    id INTEGER PRIMARY KEY,
    contact_name TEXT NOT NULL,
    company_name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE,
    plan TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'Active'
  );

  CREATE TABLE IF NOT EXISTS tickets (
    id INTEGER PRIMARY KEY,
    subject TEXT NOT NULL,
    description TEXT NOT NULL,
    customer_id INTEGER NOT NULL,
    status TEXT NOT NULL,
    priority TEXT NOT NULL,
    assignee_id INTEGER,
    created_by INTEGER NOT NULL,
    updated_label TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (customer_id) REFERENCES customers(id),
    FOREIGN KEY (assignee_id) REFERENCES users(id),
    FOREIGN KEY (created_by) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS comments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ticket_id INTEGER NOT NULL,
    user_id INTEGER,
    customer_id INTEGER,
    author_name TEXT NOT NULL,
    author_role TEXT NOT NULL,
    body TEXT NOT NULL,
    created_label TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (ticket_id) REFERENCES tickets(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id),
    FOREIGN KEY (customer_id) REFERENCES customers(id)
  );

  CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email ON users(email);
  CREATE INDEX IF NOT EXISTS idx_tickets_customer_id ON tickets(customer_id);
  CREATE INDEX IF NOT EXISTS idx_tickets_assignee_id ON tickets(assignee_id);
  CREATE INDEX IF NOT EXISTS idx_tickets_status_priority ON tickets(status, priority);
  CREATE INDEX IF NOT EXISTS idx_comments_ticket_id ON comments(ticket_id);
`;

// This command is an explicit training-data reset. Rebuilding the tables makes
// switching from the vulnerable schema (`password`) to the secure schema
// (`password_hash`) deterministic and also removes stored lab payloads.
db.pragma('foreign_keys = OFF');
db.exec(`
  DROP TABLE IF EXISTS comments;
  DROP TABLE IF EXISTS tickets;
  DROP TABLE IF EXISTS user_profiles;
  DROP TABLE IF EXISTS customers;
  DROP TABLE IF EXISTS users;
  DROP TABLE IF EXISTS company_settings;
`);
db.pragma('foreign_keys = ON');
db.exec(schema);

const seedDatabase = db.transaction(() => {
  db.prepare(`INSERT OR REPLACE INTO company_settings
    (id, company_name, workspace_name, support_email, environment)
    VALUES (1, ?, ?, ?, ?)`)
    .run('NexaCare Solutions', 'SupportHub Operations', 'help@nexacare.test', 'Web Security Training Lab');

  const insertUser = db.prepare(`INSERT INTO users
    (id, full_name, email, password_hash, role, initials, status, joined_at)
    VALUES (@id, @fullName, @email, @passwordHash, @role, @initials, 'Active', @joinedAt)
    ON CONFLICT(id) DO UPDATE SET
      full_name = excluded.full_name, email = excluded.email,
      password_hash = excluded.password_hash, role = excluded.role,
      initials = excluded.initials, status = excluded.status,
      joined_at = excluded.joined_at`);

  const users = [
    { id: 1, fullName: 'Mohamed Mahmoud Elamary', email: 'mohamed.elamary@supporthub.test', initialPassword: 'Admin@123', role: 'Support Administrator', initials: 'ME', joinedAt: '2026-03-02' },
    { id: 2, fullName: 'AbdelRahman Ashraf', email: 'abdelrahman.ashraf@supporthub.test', initialPassword: 'Senior@123', role: 'Senior Support Agent', initials: 'AA', joinedAt: '2026-03-04' },
    { id: 3, fullName: 'Mohamed Mahmoud', email: 'mohamed.mahmoud@supporthub.test', initialPassword: 'Technical@123', role: 'Technical Support Agent', initials: 'MM', joinedAt: '2026-03-06' },
    { id: 4, fullName: 'Wessam Bayoumy', email: 'wessam.bayoumy@supporthub.test', initialPassword: 'Security@123', role: 'Security Analyst', initials: 'WB', joinedAt: '2026-03-08' },
    { id: 5, fullName: 'Ziad Asfor', email: 'ziad.asfor@supporthub.test', initialPassword: 'Success@123', role: 'Customer Success Agent', initials: 'ZA', joinedAt: '2026-03-10' }
  ];

  // VULNERABLE VERSION (kept as a commented training reference):
  // users.forEach((user) => insertUser.run({ ...user, password: user.initialPassword }));
  // That design stored reusable passwords directly in SQLite.

  // SECURE VERSION: the setup script converts each demo-only initial password
  // into a unique salted scrypt hash before writing anything to the database.
  users.forEach((user) => insertUser.run({
    ...user,
    passwordHash: hashPassword(user.initialPassword)
  }));

  const insertProfile = db.prepare(`INSERT OR REPLACE INTO user_profiles
    (user_id, first_name, last_name, job_title, timezone, bio, resolved_count)
    VALUES (@userId, @firstName, @lastName, @jobTitle, @timezone, @bio, @resolvedCount)`);

  [
    { userId: 1, firstName: 'Mohamed Mahmoud', lastName: 'Elamary', jobTitle: 'Support Administrator', timezone: 'Africa/Cairo (UTC+3)', bio: 'Leads the SupportHub operations team and coordinates critical escalations.', resolvedCount: 184 },
    { userId: 2, firstName: 'AbdelRahman', lastName: 'Ashraf', jobTitle: 'Senior Support Agent', timezone: 'Africa/Cairo (UTC+3)', bio: 'Owns complex customer cases and team quality reviews.', resolvedCount: 169 },
    { userId: 3, firstName: 'Mohamed', lastName: 'Mahmoud', jobTitle: 'Technical Support Agent', timezone: 'Africa/Cairo (UTC+3)', bio: 'Investigates platform, account, and training lab issues.', resolvedCount: 132 },
    { userId: 4, firstName: 'Wessam', lastName: 'Bayoumy', jobTitle: 'Security Analyst', timezone: 'Africa/Cairo (UTC+3)', bio: 'Reviews security alerts and coordinates incident responses.', resolvedCount: 148 },
    { userId: 5, firstName: 'Ziad', lastName: 'Asfor', jobTitle: 'Customer Success Agent', timezone: 'Africa/Cairo (UTC+3)', bio: 'Helps training partners get value from the SupportHub platform.', resolvedCount: 121 }
  ].forEach((profile) => insertProfile.run(profile));

  const insertCustomer = db.prepare(`INSERT INTO customers
    (id, contact_name, company_name, email, plan, status)
    VALUES (@id, @contactName, @companyName, @email, @plan, 'Active')
    ON CONFLICT(id) DO UPDATE SET
      contact_name = excluded.contact_name, company_name = excluded.company_name,
      email = excluded.email, plan = excluded.plan, status = excluded.status`);

  [
    { id: 1, contactName: 'Youssef Adel', companyName: 'Orbit Academy', email: 'youssef@orbit-academy.test', plan: 'Enterprise' },
    { id: 2, contactName: 'Nour Hassan', companyName: 'SkillForge Institute', email: 'nour@skillforge.test', plan: 'Professional' },
    { id: 3, contactName: 'Omar Khaled', companyName: 'Cairo Tech Hub', email: 'omar@cairotech.test', plan: 'Professional' },
    { id: 4, contactName: 'Salma Nabil', companyName: 'FutureCoders Academy', email: 'salma@futurecoders.test', plan: 'Enterprise' },
    { id: 5, contactName: 'Ahmed Samir', companyName: 'Nile Digital School', email: 'ahmed@niledigital.test', plan: 'Starter' },
    { id: 6, contactName: 'Farah Tarek', companyName: 'CyberGate Training', email: 'farah@cybergate.test', plan: 'Enterprise' },
    { id: 7, contactName: 'Mariam Hany', companyName: 'BrightPath Learning', email: 'mariam@brightpath.test', plan: 'Professional' },
    { id: 8, contactName: 'Karim Sameh', companyName: 'CodeCraft Center', email: 'karim@codecraft.test', plan: 'Starter' }
  ].forEach((customer) => insertCustomer.run(customer));

  const insertTicket = db.prepare(`INSERT INTO tickets
    (id, subject, description, customer_id, status, priority, assignee_id, created_by, updated_label)
    VALUES (@id, @subject, @description, @customerId, @status, @priority, @assigneeId, @createdBy, @updatedLabel)
    ON CONFLICT(id) DO UPDATE SET
      subject = excluded.subject, description = excluded.description,
      customer_id = excluded.customer_id, status = excluded.status,
      priority = excluded.priority, assignee_id = excluded.assignee_id,
      created_by = excluded.created_by, updated_label = excluded.updated_label`);

  [
    { id: 2051, subject: 'Training lab environment will not start', description: 'The web security sandbox remains on the loading screen.', customerId: 6, status: 'Open', priority: 'Critical', assigneeId: 4, createdBy: 1, updatedLabel: '4 min ago' },
    { id: 2048, subject: 'Unable to access the course analytics dashboard', description: 'The analytics dashboard returns an error after sign-in.', customerId: 1, status: 'In Progress', priority: 'High', assigneeId: 1, createdBy: 1, updatedLabel: '12 min ago' },
    { id: 2047, subject: 'Instructor account invitation has expired', description: 'The invitation link cannot be used to create the instructor account.', customerId: 2, status: 'Open', priority: 'Medium', assigneeId: 2, createdBy: 1, updatedLabel: '24 min ago' },
    { id: 2045, subject: 'Assignment upload fails at 90 percent', description: 'Uploading the final project archive fails before completion.', customerId: 4, status: 'Open', priority: 'High', assigneeId: 3, createdBy: 1, updatedLabel: '38 min ago' },
    { id: 2042, subject: 'Need help updating academy billing details', description: 'The finance contact needs to update the organization invoice profile.', customerId: 3, status: 'Resolved', priority: 'Low', assigneeId: 5, createdBy: 2, updatedLabel: '1 hr ago' },
    { id: 2039, subject: 'Exported attendance report is missing students', description: 'The CSV export contains fewer students than the dashboard.', customerId: 7, status: 'In Progress', priority: 'High', assigneeId: 2, createdBy: 1, updatedLabel: '2 hrs ago' },
    { id: 2037, subject: 'Two-factor authentication setup assistance', description: 'An instructor needs help activating two-factor authentication.', customerId: 5, status: 'Open', priority: 'Low', assigneeId: 3, createdBy: 1, updatedLabel: '3 hrs ago' },
    { id: 2034, subject: 'Security alert received after password reset', description: 'A security notification appeared after the account password changed.', customerId: 6, status: 'In Progress', priority: 'Critical', assigneeId: 4, createdBy: 1, updatedLabel: '5 hrs ago' },
    { id: 2031, subject: 'Certificate name needs correction', description: 'The learner name on a completed course certificate is incorrect.', customerId: 8, status: 'Resolved', priority: 'Medium', assigneeId: 5, createdBy: 2, updatedLabel: 'Yesterday' },
    { id: 2028, subject: 'New classroom onboarding request', description: 'The academy needs assistance configuring a new training classroom.', customerId: 2, status: 'Resolved', priority: 'Low', assigneeId: 5, createdBy: 1, updatedLabel: '2 days ago' }
  ].forEach((ticket) => insertTicket.run(ticket));

  db.prepare('DELETE FROM comments').run();
  const insertComment = db.prepare(`INSERT INTO comments
    (ticket_id, user_id, customer_id, author_name, author_role, body, created_label)
    VALUES (@ticketId, @userId, @customerId, @authorName, @authorRole, @body, @createdLabel)`);

  [
    { ticketId: 2048, userId: null, customerId: 1, authorName: 'Youssef Adel', authorRole: 'customer', body: 'Our course analytics dashboard has returned an error since this morning. Could you check it?', createdLabel: '10:24 AM' },
    { ticketId: 2048, userId: 1, customerId: null, authorName: 'Mohamed Mahmoud Elamary', authorRole: 'staff', body: 'Thanks for reporting this. I am checking the analytics service and will update you shortly.', createdLabel: '10:31 AM' },
    { ticketId: 2051, userId: null, customerId: 6, authorName: 'Farah Tarek', authorRole: 'customer', body: 'The lab is still stuck after two restart attempts.', createdLabel: '11:02 AM' },
    { ticketId: 2051, userId: 4, customerId: null, authorName: 'Wessam Bayoumy', authorRole: 'staff', body: 'I have started a security and environment health review.', createdLabel: '11:08 AM' }
  ].forEach((comment) => insertComment.run(comment));
});

seedDatabase();
db.pragma('optimize');

const summary = {
  users: db.prepare('SELECT COUNT(*) AS count FROM users').get().count,
  customers: db.prepare('SELECT COUNT(*) AS count FROM customers').get().count,
  tickets: db.prepare('SELECT COUNT(*) AS count FROM tickets').get().count,
  comments: db.prepare('SELECT COUNT(*) AS count FROM comments').get().count
};

console.log(`Database ready: ${databasePath}`);
console.log(`Seeded ${summary.users} users, ${summary.customers} customers, ${summary.tickets} tickets, and ${summary.comments} comments.`);
db.close();
