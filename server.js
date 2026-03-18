const express    = require('express');
const cors       = require('cors');
const path       = require('path');
const mongoose   = require('mongoose');
const nodemailer = require('nodemailer');
const bcrypt     = require('bcryptjs');
const jwt        = require('jsonwebtoken');

const app       = express();
const PORT      = process.env.PORT      || 3456;
const MONGO     = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/taskflow';
const JWT_SECRET= process.env.JWT_SECRET|| 'taskflow-secret-2024';
const APP_URL   = process.env.APP_URL   || 'https://snakily-hydrogeologic-imogene.ngrok-free.dev';

function emailTemplate({ title, preheader, bodyHtml, ctaText, ctaUrl }) {
  return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${title}</title>
</head>
<body style="margin:0;padding:0;background:#1c1c2a;font-family:'Segoe UI',system-ui,-apple-system,sans-serif;">
<div style="display:none;max-height:0;overflow:hidden;color:#1c1c2a;">${preheader} &nbsp;&zwnj;&nbsp;</div>

<table width="100%" cellpadding="0" cellspacing="0" style="background:#1c1c2a;min-height:100vh;">
<tr><td align="center" style="padding:40px 16px;">
<table width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;">

  <!-- TOP ACCENT BAR -->
  <tr><td style="background:linear-gradient(90deg,#f97316,#ea580c);border-radius:12px 12px 0 0;height:4px;font-size:0;">&nbsp;</td></tr>

  <!-- HEADER -->
  <tr><td style="background:#252535;padding:26px 36px 22px;border-left:1px solid rgba(255,255,255,.07);border-right:1px solid rgba(255,255,255,.07);">
    <table width="100%" cellpadding="0" cellspacing="0">
      <tr>
        <td style="vertical-align:middle;">
          <span style="display:inline-block;background:linear-gradient(135deg,#f97316,#ea580c);border-radius:9px;width:34px;height:34px;line-height:34px;text-align:center;font-size:16px;font-weight:900;color:#fff;vertical-align:middle;">T</span>
          <span style="vertical-align:middle;margin-left:10px;font-size:16px;font-weight:700;color:#f0ede8;letter-spacing:-.2px;">TaskFlow</span>
        </td>
        <td align="right" style="vertical-align:middle;">
          <span style="font-size:11px;color:rgba(220,210,195,.45);letter-spacing:.5px;text-transform:uppercase;">Notificación automática</span>
        </td>
      </tr>
    </table>
  </td></tr>

  <!-- DIVIDER -->
  <tr><td style="background:#252535;border-left:1px solid rgba(255,255,255,.07);border-right:1px solid rgba(255,255,255,.07);">
    <div style="height:1px;background:linear-gradient(90deg,transparent,rgba(249,115,22,.35),transparent);"></div>
  </td></tr>

  <!-- BODY -->
  <tr><td style="background:#252535;padding:32px 36px;border-left:1px solid rgba(255,255,255,.07);border-right:1px solid rgba(255,255,255,.07);">
    ${bodyHtml}
  </td></tr>

  <!-- CTA -->
  <tr><td style="background:#252535;padding:0 36px 36px;text-align:center;border-left:1px solid rgba(255,255,255,.07);border-right:1px solid rgba(255,255,255,.07);">
    <a href="${ctaUrl}" style="display:inline-block;background:linear-gradient(135deg,#f97316,#ea580c);color:#fff;text-decoration:none;font-weight:700;font-size:14px;padding:14px 36px;border-radius:10px;letter-spacing:.3px;box-shadow:0 4px 20px rgba(249,115,22,.35);">
      ${ctaText} &nbsp;→
    </a>
    <p style="margin:18px 0 0;font-size:11px;color:rgba(180,165,145,.35);">
      Si el botón no carga: <a href="${ctaUrl}" style="color:#f97316;text-decoration:none;">${ctaUrl}</a>
    </p>
  </td></tr>

  <!-- FOOTER -->
  <tr><td style="background:#1e1e2e;border-radius:0 0 12px 12px;padding:20px 36px;border:1px solid rgba(255,255,255,.07);border-top:1px solid rgba(255,255,255,.05);">
    <table width="100%" cellpadding="0" cellspacing="0">
      <tr>
        <td style="font-size:11px;color:rgba(180,165,145,.35);">TaskFlow · Gestión interna de tareas</td>
        <td align="right" style="font-size:11px;color:rgba(180,165,145,.25);">Alpha Omega Electronics</td>
      </tr>
    </table>
  </td></tr>

</table>
</td></tr>
</table>
</body></html>`;
}

const PRIO_COLOR = { high: '#ef4444', medium: '#f59e0b', low: '#22c55e' };
const PRIO_LABEL = { high: 'Alta', medium: 'Media', low: 'Baja' };

// ── Schemas & Models ──────────────────────────────────────────────────────────
const taskSchema = new mongoose.Schema({
  title        : { type: String, required: true, trim: true },
  notes        : { type: String, default: '' },
  period       : { type: String, enum: ['daily','weekly','monthly','yearly'], default: 'daily' },
  priority     : { type: String, enum: ['high','medium','low'], default: 'medium' },
  done         : { type: Boolean, default: false },
  assignee_name: { type: String, default: '' },
  due_date     : { type: String, default: '' },
  created_by   : { type: String, default: '' },
}, { timestamps: true });

const memberSchema = new mongoose.Schema({
  name       : { type: String, required: true, trim: true },
  role       : { type: String, default: 'Team Member' },
  email      : { type: String, default: '' },
  active     : { type: Boolean, default: true },
  last_active: { type: String, default: '' },
}, { timestamps: true });

const reportSchema = new mongoose.Schema({
  snapshot_date : String,
  total_tasks   : Number,
  done_tasks    : Number,
  pending_tasks : Number,
  team_count    : Number,
  high_priority : Number,
}, { timestamps: true });

const activitySchema = new mongoose.Schema({
  action : String,
  detail : String,
}, { timestamps: true });

const notifSettingsSchema = new mongoose.Schema({
  key             : { type: String, default: 'main' },
  emailEnabled    : { type: Boolean, default: false },
  desktopEnabled  : { type: Boolean, default: true },
  notifyEmail     : { type: String,  default: '' },
  smtpHost        : { type: String,  default: '' },
  smtpPort        : { type: Number,  default: 587 },
  smtpUser        : { type: String,  default: '' },
  smtpPass        : { type: String,  default: '' },
  smtpFrom        : { type: String,  default: '' },
  notifyOnCreate  : { type: Boolean, default: true },
  notifyOnUpdate  : { type: Boolean, default: false },
  notifyOnComplete: { type: Boolean, default: true },
  notifyOnDelete  : { type: Boolean, default: false },
});

const userSchema = new mongoose.Schema({
  name    : { type: String, required: true, trim: true },
  username: { type: String, required: true, unique: true, lowercase: true, trim: true },
  password: { type: String, required: true },
  email   : { type: String, default: '', trim: true },
  role    : { type: String, enum: ['admin','user'], default: 'user' },
  active  : { type: Boolean, default: true },
}, { timestamps: true });

const Task          = mongoose.model('Task',          taskSchema);
const Member        = mongoose.model('Member',        memberSchema);
const Report        = mongoose.model('Report',        reportSchema);
const Activity      = mongoose.model('Activity',      activitySchema);
const NotifSettings = mongoose.model('NotifSettings', notifSettingsSchema);
const User          = mongoose.model('User',          userSchema);

// ── Init log ─────────────────────────────────────────────────────────────────
async function seed() {
  const count = await Activity.countDocuments();
  if (count === 0) {
    await Activity.create({ action: 'App iniciada', detail: 'TaskFlow listo — base de datos vacía' });
  }
  const adminExists = await User.findOne({ role: 'admin' });
  if (!adminExists) {
    const hash = await bcrypt.hash('admin123', 10);
    await User.create({ name: 'Administrador', username: 'admin', password: hash, role: 'admin' });
    console.log('👤  Usuario admin creado → usuario: admin  contraseña: admin123');
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────
async function log(action, detail) {
  await Activity.create({ action, detail });
}

async function getNotifSettings() {
  let s = await NotifSettings.findOne({ key: 'main' });
  if (!s) s = await NotifSettings.create({ key: 'main' });
  return s;
}

async function buildTransporter() {
  const s = await getNotifSettings();
  if (!s.emailEnabled) {
    console.log('📧  Emails desactivados — activa "Notificaciones por email" en Ajustes');
    return null;
  }
  if (!s.smtpHost || !s.smtpUser) {
    console.log('📧  SMTP sin configurar — rellena Host/Usuario en Ajustes > Notificaciones');
    return null;
  }
  return { transporter: nodemailer.createTransport({
    host: s.smtpHost, port: s.smtpPort || 587,
    secure: Number(s.smtpPort) === 465,
    auth: { user: s.smtpUser, pass: s.smtpPass },
    connectionTimeout: 10000,
    greetingTimeout: 10000,
    socketTimeout: 15000,
  }), from: s.smtpFrom || s.smtpUser, notifyEmail: s.notifyEmail };
}

async function sendEmail(subject, html) {
  const cfg = await buildTransporter();
  if (!cfg || !cfg.notifyEmail) return;
  try {
    await cfg.transporter.sendMail({ from: cfg.from, to: cfg.notifyEmail, subject, html });
    console.log(`📧  Email enviado → ${cfg.notifyEmail} | ${subject}`);
  } catch(e) { console.error('📧  Email error:', e.message); }
}

async function sendEmailTo(to, subject, html) {
  if (!to) return;
  const cfg = await buildTransporter();
  if (!cfg) return;
  try {
    await cfg.transporter.sendMail({ from: cfg.from, to, subject, html });
    console.log(`📧  Email enviado → ${to} | ${subject}`);
  } catch(e) { console.error('📧  Email error:', e.message); }
}

async function getAssigneeEmail(name) {
  if (!name) return null;
  // Check User model first (by name), then Member model
  const u = await User.findOne({ name, active: true }).lean();
  if (u?.email) return u.email;
  const m = await Member.findOne({ name, active: true }).lean();
  return m?.email || null;
}

async function getAdminEmails() {
  const admins = await User.find({ role: 'admin', active: true, email: { $ne: '' } }).lean();
  return admins.map(a => a.email).filter(Boolean);
}

async function sendToAdmins(subject, html) {
  const s = await getNotifSettings();
  if (!s.emailEnabled || !s.smtpHost || !s.smtpUser) return;
  const adminEmails = await getAdminEmails();
  // Also include notifyEmail if set
  const all = [...new Set([...adminEmails, ...(s.notifyEmail ? [s.notifyEmail] : [])])];
  for (const to of all) { sendEmailTo(to, subject, html); }
}

// ── Auth middleware ───────────────────────────────────────────────────────────
function authRequired(req, res, next) {
  const h = req.headers.authorization || '';
  const token = h.startsWith('Bearer ') ? h.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'No autenticado' });
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch { res.status(401).json({ error: 'Token inválido' }); }
}

function adminRequired(req, res, next) {
  authRequired(req, res, () => {
    if (req.user.role !== 'admin') return res.status(403).json({ error: 'Solo administradores' });
    next();
  });
}

// ── SSE — real-time browser push ─────────────────────────────────────────────
const sseClients = new Set();

function broadcast(event, data) {
  const msg = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const client of sseClients) {
    try { client.write(msg); } catch { sseClients.delete(client); }
  }
}

// ── Middleware ────────────────────────────────────────────────────────────────
app.use(cors());
app.use(express.json());
app.use((req, res, next) => { res.setHeader('ngrok-skip-browser-warning', '1'); next(); });
app.use(express.static(path.join(__dirname, 'public')));

// ── AUTH ──────────────────────────────────────────────────────────────────────
app.post('/api/auth/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) return res.status(400).json({ error: 'Credenciales requeridas' });
    const user = await User.findOne({ username: username.toLowerCase(), active: true });
    if (!user) return res.status(401).json({ error: 'Usuario o contraseña incorrectos' });
    const ok = await bcrypt.compare(password, user.password);
    if (!ok) return res.status(401).json({ error: 'Usuario o contraseña incorrectos' });
    const token = jwt.sign({ id: user._id, name: user.name, username: user.username, role: user.role }, JWT_SECRET, { expiresIn: '7d' });
    res.json({ token, user: { id: user._id, name: user.name, username: user.username, role: user.role } });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/auth/me', authRequired, (req, res) => res.json(req.user));

// ── USERS (admin) ─────────────────────────────────────────────────────────────
app.get('/api/users', adminRequired, async (req, res) => {
  try {
    const users = await User.find().select('-password').sort({ createdAt: 1 }).lean();
    res.json(users.map(u => ({ ...u, id: u._id })));
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/users', adminRequired, async (req, res) => {
  try {
    const { name, username, password, role } = req.body;
    if (!name?.trim() || !username?.trim() || !password) return res.status(400).json({ error: 'Nombre, usuario y contraseña requeridos' });
    const exists = await User.findOne({ username: username.toLowerCase() });
    if (exists) return res.status(400).json({ error: 'Ese nombre de usuario ya existe' });
    const hash = await bcrypt.hash(password, 10);
    const u = await User.create({ name: name.trim(), username: username.toLowerCase().trim(), password: hash, role: role || 'user' });
    res.json({ id: u._id, name: u.name, username: u.username, role: u.role, active: u.active });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.put('/api/users/:id', adminRequired, async (req, res) => {
  try {
    const updates = {};
    if (req.body.name)     updates.name     = req.body.name.trim();
    if (req.body.username) updates.username = req.body.username.toLowerCase().trim();
    if (req.body.email !== undefined) updates.email = req.body.email.trim();
    if (req.body.role)     updates.role     = req.body.role;
    if (req.body.active !== undefined) updates.active = req.body.active;
    if (req.body.password) updates.password = await bcrypt.hash(req.body.password, 10);
    const u = await User.findByIdAndUpdate(req.params.id, updates, { returnDocument: 'after' }).select('-password').lean();
    if (!u) return res.status(404).json({ error: 'Usuario no encontrado' });
    res.json({ ...u, id: u._id });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/users/:id', adminRequired, async (req, res) => {
  try {
    if (String(req.params.id) === String(req.user.id)) return res.status(400).json({ error: 'No puedes eliminarte a ti mismo' });
    await User.findByIdAndDelete(req.params.id);
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ── TASKS ─────────────────────────────────────────────────────────────────────
app.get('/api/tasks', authRequired, async (req, res) => {
  try {
    const filter = {};
    if (req.query.period)   filter.period   = req.query.period;
    if (req.query.priority) filter.priority = req.query.priority;
    if (req.query.search)   filter.title    = { $regex: req.query.search, $options: 'i' };

    const prioOrder = { high: 0, medium: 1, low: 2 };
    const tasks = await Task.find(filter).sort({ done: 1, createdAt: -1 }).lean();
    tasks.sort((a,b) => (a.done===b.done ? (prioOrder[a.priority]||2)-(prioOrder[b.priority]||2) : 0));
    // Normalize _id → id for frontend compatibility
    res.json(tasks.map(t => ({ ...t, id: t._id })));
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/tasks', authRequired, async (req, res) => {
  try {
    const { title, notes, period, priority, assignee_name, due_date, done } = req.body;
    if (!title?.trim()) return res.status(400).json({ error: 'Título requerido' });
    const t = await Task.create({ title: title.trim(), notes, period, priority, assignee_name, due_date, done: !!done, created_by: req.user?.name || '' });
    await log('Tarea creada', t.title);
    const payload = { title: t.title, priority: t.priority, assignee: t.assignee_name };
    broadcast('task-created', payload);
    const s = await getNotifSettings();
    const assigneeEmail = await getAssigneeEmail(t.assignee_name);
    const prioColor = PRIO_COLOR[t.priority] || '#7c6af7';
    const prioLabel = PRIO_LABEL[t.priority] || t.priority;
    if (assigneeEmail) sendEmailTo(assigneeEmail,
      `Nueva tarea asignada: ${t.title}`,
      emailTemplate({
        title: `Nueva tarea: ${t.title}`,
        preheader: `Se te ha asignado "${t.title}" — accede a TaskFlow para verla`,
        ctaText: 'Abrir mi tarea',
        ctaUrl: APP_URL,
        bodyHtml: `
          <p style="margin:0 0 4px;font-size:12px;font-weight:600;color:#f97316;text-transform:uppercase;letter-spacing:1px;">Nueva tarea asignada</p>
          <h1 style="margin:0 0 24px;font-size:24px;font-weight:800;color:#f0ede8;line-height:1.2;">${t.title}</h1>
          <p style="margin:0 0 24px;font-size:14px;color:rgba(220,210,195,.65);">Hola <strong style="color:#f0ede8;">${t.assignee_name}</strong>, se te ha asignado una nueva tarea. A continuación tienes todos los detalles.</p>
          <table width="100%" cellpadding="0" cellspacing="0" style="background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.09);border-radius:10px;margin-bottom:24px;">
            <tr>
              <td style="padding:16px 20px;border-bottom:1px solid rgba(255,255,255,.06);">
                <span style="font-size:11px;font-weight:600;color:rgba(180,165,145,.4);text-transform:uppercase;letter-spacing:.8px;display:block;margin-bottom:4px;">Prioridad</span>
                <span style="background:${prioColor}20;color:${prioColor};border-radius:6px;padding:4px 12px;font-size:12px;font-weight:700;">● ${prioLabel}</span>
              </td>
              <td style="padding:16px 20px;border-bottom:1px solid rgba(255,255,255,.06);">
                <span style="font-size:11px;font-weight:600;color:rgba(180,165,145,.4);text-transform:uppercase;letter-spacing:.8px;display:block;margin-bottom:4px;">Estado</span>
                <span style="color:rgba(220,210,195,.65);font-size:13px;font-weight:600;">⏳ Pendiente</span>
              </td>
            </tr>
            ${t.due_date ? `<tr><td colspan="2" style="padding:16px 20px;border-bottom:1px solid rgba(255,255,255,.06);">
              <span style="font-size:11px;font-weight:600;color:rgba(180,165,145,.4);text-transform:uppercase;letter-spacing:.8px;display:block;margin-bottom:4px;">Fecha límite</span>
              <span style="color:#f0ede8;font-size:13px;font-weight:600;">📅 ${t.due_date}</span>
            </td></tr>` : ''}
            <tr><td colspan="2" style="padding:16px 20px;">
              <span style="font-size:11px;font-weight:600;color:rgba(180,165,145,.4);text-transform:uppercase;letter-spacing:.8px;display:block;margin-bottom:4px;">Asignada a</span>
              <span style="color:#f0ede8;font-size:13px;font-weight:600;">👤 ${t.assignee_name}</span>
            </td></tr>
          </table>`
      })
    );
    res.json({ ...t.toObject(), id: t._id });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.put('/api/tasks/:id', authRequired, async (req, res) => {
  try {
    const updates = {};
    const allowed = ['title','notes','period','priority','done','assignee_name','due_date'];
    allowed.forEach(k => { if (req.body[k] !== undefined) updates[k] = req.body[k]; });
    const prev = await Task.findById(req.params.id).lean();
    const t = await Task.findByIdAndUpdate(req.params.id, updates, { returnDocument: 'after' }).lean();
    if (!t) return res.status(404).json({ error: 'No encontrada' });
    const s = await getNotifSettings();
    const assigneeEmail = await getAssigneeEmail(t.assignee_name);
    const prioColor = PRIO_COLOR[t.priority] || '#7c6af7';
    const prioLabel = PRIO_LABEL[t.priority] || t.priority;
    if (req.body.done !== undefined) {
      const completed = req.body.done;
      await log(completed ? 'Tarea completada' : 'Tarea reabierta', t.title);
      broadcast('task-updated', { title: t.title, done: completed });
      if (completed) {
        const completedBy = req.user?.name || 'Alguien';
        const completedBodyHtml = (recipient) => `
          <p style="margin:0 0 4px;font-size:12px;font-weight:600;color:#10c98a;text-transform:uppercase;letter-spacing:1px;">Tarea completada</p>
          <h1 style="margin:0 0 24px;font-size:24px;font-weight:800;color:#f0ede8;line-height:1.2;">${t.title}</h1>
          <p style="margin:0 0 24px;font-size:14px;color:rgba(220,210,195,.65);">${recipient} Esta tarea ha sido marcada como <strong style="color:#10c98a;">completada</strong> correctamente.</p>
          <table width="100%" cellpadding="0" cellspacing="0" style="background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.09);border-radius:10px;margin-bottom:24px;">
            <tr>
              <td style="padding:16px 20px;border-bottom:1px solid rgba(255,255,255,.06);">
                <span style="font-size:11px;font-weight:600;color:rgba(180,165,145,.4);text-transform:uppercase;letter-spacing:.8px;display:block;margin-bottom:4px;">Estado</span>
                <span style="background:#10c98a20;color:#10c98a;border-radius:6px;padding:4px 12px;font-size:12px;font-weight:700;">✔ Completada</span>
              </td>
              <td style="padding:16px 20px;border-bottom:1px solid rgba(255,255,255,.06);">
                <span style="font-size:11px;font-weight:600;color:rgba(180,165,145,.4);text-transform:uppercase;letter-spacing:.8px;display:block;margin-bottom:4px;">Prioridad</span>
                <span style="background:${prioColor}20;color:${prioColor};border-radius:6px;padding:4px 12px;font-size:12px;font-weight:700;">● ${prioLabel}</span>
              </td>
            </tr>
            <tr>
              <td style="padding:16px 20px;border-bottom:1px solid rgba(255,255,255,.06);">
                <span style="font-size:11px;font-weight:600;color:rgba(180,165,145,.4);text-transform:uppercase;letter-spacing:.8px;display:block;margin-bottom:4px;">Completada por</span>
                <span style="color:#f0ede8;font-size:13px;font-weight:600;">👤 ${completedBy}</span>
              </td>
              ${t.assignee_name ? `<td style="padding:16px 20px;border-bottom:1px solid rgba(255,255,255,.06);">
                <span style="font-size:11px;font-weight:600;color:rgba(180,165,145,.4);text-transform:uppercase;letter-spacing:.8px;display:block;margin-bottom:4px;">Asignada a</span>
                <span style="color:#f0ede8;font-size:13px;font-weight:600;">👤 ${t.assignee_name}</span>
              </td>` : '<td></td>'}
            </tr>
          </table>`;
        // Notify whoever created/assigned the task that it's been completed
        const creatorEmail = await getAssigneeEmail(t.created_by);
        if (creatorEmail && t.created_by !== completedBy) {
          sendEmailTo(creatorEmail,
            `Tarea completada: ${t.title}`,
            emailTemplate({
              title: `Tarea completada: ${t.title}`,
              preheader: `${completedBy} ha completado la tarea "${t.title}"`,
              ctaText: 'Ver en TaskFlow',
              ctaUrl: APP_URL,
              bodyHtml: completedBodyHtml(`Hola <strong style="color:#f0ede8;">${t.created_by}</strong>,`)
            })
          );
        }
      }
    } else {
      broadcast('task-updated', { title: t.title, done: t.done });
      // Notify new assignee if assignment changed
      const assigneeChanged = req.body.assignee_name !== undefined && req.body.assignee_name !== prev?.assignee_name;
      if (assigneeChanged && assigneeEmail) {
        sendEmailTo(assigneeEmail,
          `Nueva tarea asignada: ${t.title}`,
          emailTemplate({
            title: `Nueva tarea: ${t.title}`,
            preheader: `Se te ha asignado "${t.title}" — accede a TaskFlow para verla`,
            ctaText: 'Abrir mi tarea',
            ctaUrl: APP_URL,
            bodyHtml: `
              <p style="margin:0 0 4px;font-size:12px;font-weight:600;color:#f97316;text-transform:uppercase;letter-spacing:1px;">Nueva tarea asignada</p>
              <h1 style="margin:0 0 24px;font-size:24px;font-weight:800;color:#f0ede8;line-height:1.2;">${t.title}</h1>
              <p style="margin:0 0 24px;font-size:14px;color:rgba(220,210,195,.65);">Hola <strong style="color:#f0ede8;">${t.assignee_name}</strong>, se te ha reasignado esta tarea.</p>
              <table width="100%" cellpadding="0" cellspacing="0" style="background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.09);border-radius:10px;margin-bottom:24px;">
                <tr>
                  <td style="padding:16px 20px;border-bottom:1px solid rgba(255,255,255,.06);">
                    <span style="font-size:11px;font-weight:600;color:rgba(180,165,145,.4);text-transform:uppercase;letter-spacing:.8px;display:block;margin-bottom:4px;">Prioridad</span>
                    <span style="background:${prioColor}20;color:${prioColor};border-radius:6px;padding:4px 12px;font-size:12px;font-weight:700;">● ${prioLabel}</span>
                  </td>
                  <td style="padding:16px 20px;border-bottom:1px solid rgba(255,255,255,.06);">
                    <span style="font-size:11px;font-weight:600;color:rgba(180,165,145,.4);text-transform:uppercase;letter-spacing:.8px;display:block;margin-bottom:4px;">Estado</span>
                    <span style="color:rgba(220,210,195,.65);font-size:13px;font-weight:600;">⏳ Pendiente</span>
                  </td>
                </tr>
                ${t.due_date ? `<tr><td colspan="2" style="padding:16px 20px;">
                  <span style="font-size:11px;font-weight:600;color:rgba(180,165,145,.4);text-transform:uppercase;letter-spacing:.8px;display:block;margin-bottom:4px;">Fecha límite</span>
                  <span style="color:#f0ede8;font-size:13px;font-weight:600;">📅 ${t.due_date}</span>
                </td></tr>` : ''}
              </table>`
          })
        );
      }
      if (s.notifyOnUpdate) sendToAdmins(
        `✏️ Tarea modificada: ${t.title}`,
        `<p>La tarea <strong>${t.title}</strong> ha sido actualizada.</p><hr><small>TaskFlow</small>`
      );
    }
    res.json({ ...t, id: t._id });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/tasks/:id', authRequired, async (req, res) => {
  try {
    const t = await Task.findByIdAndDelete(req.params.id);
    if (t) {
      await log('Tarea eliminada', t.title);
      broadcast('task-deleted', { title: t.title });
      const s = await getNotifSettings();
      if (s.notifyOnDelete) sendToAdmins(
        `🗑️ Tarea eliminada: ${t.title}`,
        `<p>La tarea <strong>${t.title}</strong> ha sido eliminada.</p><hr><small>TaskFlow</small>`
      );
    }
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ── TEAM ──────────────────────────────────────────────────────────────────────
app.get('/api/team', authRequired, async (req, res) => {
  try {
    const members = await Member.find().sort({ name: 1 }).lean();
    for (const m of members) {
      m.total   = await Task.countDocuments({ assignee_name: m.name });
      m.done    = await Task.countDocuments({ assignee_name: m.name, done: true });
      m.pending = m.total - m.done;
      m.id      = m._id;
    }
    res.json(members);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/team', authRequired, async (req, res) => {
  try {
    const { name, role, email, active } = req.body;
    if (!name?.trim()) return res.status(400).json({ error: 'Nombre requerido' });
    const d = new Date().toLocaleDateString('es-ES', { day:'2-digit', month:'2-digit', year:'numeric' });
    const m = await Member.create({ name: name.trim(), role, email, active: active !== false, last_active: d });
    await log('Miembro añadido', m.name);
    res.json({ ...m.toObject(), id: m._id });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.put('/api/team/:id', authRequired, async (req, res) => {
  try {
    const updates = {};
    ['name','role','email','active'].forEach(k => { if (req.body[k] !== undefined) updates[k] = req.body[k]; });
    const m = await Member.findByIdAndUpdate(req.params.id, updates, { returnDocument: 'after' }).lean();
    if (!m) return res.status(404).json({ error: 'No encontrado' });
    res.json({ ...m, id: m._id });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/team/:id', authRequired, async (req, res) => {
  try {
    const m = await Member.findByIdAndDelete(req.params.id);
    if (m) await log('Miembro eliminado', m.name);
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ── STATS ─────────────────────────────────────────────────────────────────────
app.get('/api/stats', authRequired, async (req, res) => {
  try {
    const periods = ['daily','weekly','monthly','yearly'];
    const result  = {};
    for (const p of periods) {
      const total = await Task.countDocuments({ period: p });
      const done  = await Task.countDocuments({ period: p, done: true });
      result[p]   = { total, done, pending: total - done };
    }
    result.overall = {
      total  : await Task.countDocuments(),
      done   : await Task.countDocuments({ done: true }),
      pending: await Task.countDocuments({ done: false }),
      high   : await Task.countDocuments({ priority: 'high', done: false }),
      team   : await Member.countDocuments(),
    };
    res.json(result);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ── REPORTS ───────────────────────────────────────────────────────────────────
app.get('/api/reports', authRequired, async (req, res) => {
  try {
    const reports = await Report.find().sort({ createdAt: -1 }).lean();
    res.json(reports.map(r => ({ ...r, id: r._id })));
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/reports', authRequired, async (req, res) => {
  try {
    const total = await Task.countDocuments();
    const done  = await Task.countDocuments({ done: true });
    const high  = await Task.countDocuments({ priority: 'high', done: false });
    const team  = await Member.countDocuments();
    const r = await Report.create({
      snapshot_date: new Date().toLocaleString('es-ES'),
      total_tasks: total, done_tasks: done,
      pending_tasks: total - done, team_count: team, high_priority: high,
    });
    await log('Reporte generado', `${total} tareas — ${done} completadas`);
    res.json({ ...r.toObject(), id: r._id });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ── ACTIVITY ──────────────────────────────────────────────────────────────────
app.get('/api/activity', authRequired, async (req, res) => {
  try {
    const acts = await Activity.find().sort({ createdAt: -1 }).limit(25).lean();
    res.json(acts.map(a => ({ ...a, id: a._id })));
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ── SSE STREAM ────────────────────────────────────────────────────────────────
app.get('/api/events', (req, res, next) => {
  // SSE can't send custom headers, so accept token via query param
  const token = req.query.token || (req.headers.authorization||'').replace('Bearer ','');
  if (!token) return res.status(401).end();
  try { req.user = jwt.verify(token, JWT_SECRET); next(); }
  catch { res.status(401).end(); }
}, (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();
  // Keepalive ping every 25s
  const ping = setInterval(() => { try { res.write(': ping\n\n'); } catch { clearInterval(ping); } }, 25000);
  sseClients.add(res);
  req.on('close', () => { sseClients.delete(res); clearInterval(ping); });
});

// ── NOTIFICATION SETTINGS ─────────────────────────────────────────────────────
app.get('/api/notif/settings', authRequired, async (req, res) => {
  try {
    const s = await getNotifSettings();
    const out = s.toObject();
    delete out.smtpPass;   // never expose password to frontend
    res.json({ ...out, id: out._id });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/notif/settings', authRequired, async (req, res) => {
  try {
    const s = await getNotifSettings();
    const allowed = ['emailEnabled','desktopEnabled','notifyEmail','smtpHost','smtpPort',
                     'smtpUser','smtpPass','smtpFrom','notifyOnCreate','notifyOnUpdate',
                     'notifyOnComplete','notifyOnDelete'];
    allowed.forEach(k => { if (req.body[k] !== undefined) s[k] = req.body[k]; });
    await s.save();
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/notif/test', authRequired, async (req, res) => {
  try {
    const s = await getNotifSettings();
    if (!s.emailEnabled || !s.smtpHost || !s.smtpUser)
      return res.status(400).json({ error: 'Configura primero el servidor SMTP' });
    const cfg = await buildTransporter();
    if (!cfg) return res.status(400).json({ error: 'No se pudo crear el transporter SMTP' });
    const to = s.notifyEmail || s.smtpUser;
    await cfg.transporter.sendMail({
      from: cfg.from, to,
      subject: '🧪 Test de notificaciones — TaskFlow',
      html: '<p>Las notificaciones de <strong>TaskFlow</strong> funcionan correctamente. ✅</p><hr><small>TaskFlow</small>'
    });
    console.log(`📧  Test email enviado → ${to}`);
    res.json({ ok: true });
  } catch(e) { console.error('📧  Test email error:', e.message); res.status(500).json({ error: e.message }); }
});

// Fallback → index.html
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ── Start ─────────────────────────────────────────────────────────────────────
mongoose.connect(MONGO)
  .then(async () => {
    console.log(`✅  MongoDB conectado → ${MONGO}`);
    await seed();
    const ifaces = require('os').networkInterfaces();
    let localIP = 'tu-IP';
    Object.values(ifaces).flat().forEach(i => {
      if (i.family === 'IPv4' && !i.internal) localIP = i.address;
    });
    app.listen(PORT, '0.0.0.0', () => {
      console.log(`\n🚀  TaskFlow listo`);
      console.log(`   Local: http://localhost:${PORT}`);
      console.log(`   Red:   http://${localIP}:${PORT}\n`);
    });
  })
  .catch(err => {
    console.error('❌  Error conectando a MongoDB:', err.message);
    process.exit(1);
  });
