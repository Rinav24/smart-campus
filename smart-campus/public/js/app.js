/* =========================================================
   Smart Campus - frontend logic (plain JavaScript)
   1) helpers  2) menu + router  3) one function per page
   ========================================================= */

let ME = null;            // the logged-in user
let charts = [];          // Chart.js charts (destroyed when we change page)
let modalObj = null;
let modalHandler = null;

/* ---------- 1. Helpers ---------- */
const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const todayStr = () => new Date().toLocaleDateString('en-CA'); // YYYY-MM-DD
const fmtDate = (d) => d ? new Date(String(d).slice(0, 10) + 'T00:00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '-';
const num = (v) => Number(v) || 0;

// Talks to our Express backend. Throws an Error with the server's message if something fails.
async function api(url, method = 'GET', body) {
  const res = await fetch(url, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : {},
    body: body ? JSON.stringify(body) : undefined
  });
  if (res.status === 401) { location.href = 'login.html'; throw new Error('Please log in.'); }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Request failed.');
  return data;
}

function toast(msg, isError = false) {
  const el = document.createElement('div');
  el.className = 'toast-msg' + (isError ? ' error' : '');
  el.textContent = msg;
  $('#toasts').appendChild(el);
  setTimeout(() => el.remove(), 3500);
}

// Run an async action; show a toast on error; optionally show success message.
async function attempt(fn, okMsg) {
  try { const r = await fn(); if (okMsg) toast(okMsg); return r; }
  catch (e) { toast(e.message, true); return null; }
}

function badge(text, cls) { return `<span class="badge-s ${cls}">${esc(text)}</span>`; }
const STATUS_CLASS = {
  Present: 'b-green', Absent: 'b-red', Pending: 'b-amber', 'In Progress': 'b-blue', Resolved: 'b-green',
  Submitted: 'b-blue', Late: 'b-amber', Reviewed: 'b-green', Open: 'b-amber', Claimed: 'b-blue', Returned: 'b-green',
  Lost: 'b-red', Found: 'b-green'
};
const statusBadge = (s) => badge(s, STATUS_CLASS[s] || 'b-grey');

function pctBar(p) {
  const v = num(p);
  const cls = v < 60 ? 'low' : v < 75 ? 'mid' : '';
  return `<div class="d-flex align-items-center gap-2"><div class="progress flex-grow-1" style="min-width:70px"><div class="progress-bar ${cls}" style="width:${v}%"></div></div><span class="small fw-semibold">${v}%</span></div>`;
}

const empty = (icon, text) => `<div class="empty"><i class="bi ${icon}"></i>${esc(text)}</div>`;
const stat = (icon, value, label, color = '') => `<div class="col-6 col-lg-3"><div class="stat ${color}"><div class="ico"><i class="bi ${icon}"></i></div><div><div class="num">${esc(value)}</div><div class="lbl">${esc(label)}</div></div></div></div>`;
const panel = (title, inner, extra = '') => `<div class="panel"><div class="d-flex justify-content-between align-items-center mb-2"><h2 class="mb-0">${title}</h2>${extra}</div>${inner}</div>`;

// Pop-up form. fieldsHtml = form fields. onSubmit gets an object of the field values.
function openForm({ title, fieldsHtml, submitText = 'Save', onSubmit, large = false }) {
  $('#modalTitle').textContent = title;
  $('#modalBody').innerHTML = fieldsHtml;
  $('#modalSubmit').textContent = submitText;
  $('#modalFooter').style.display = '';
  document.querySelector('#appModal .modal-dialog').classList.toggle('modal-lg', large);
  modalHandler = onSubmit;
  modalObj.show();
}
function openInfo(title, html) {
  $('#modalTitle').textContent = title;
  $('#modalBody').innerHTML = html;
  $('#modalFooter').style.display = 'none';
  document.querySelector('#appModal .modal-dialog').classList.add('modal-lg');
  modalHandler = null;
  modalObj.show();
}
const field = (label, name, opts = {}) => {
  const { type = 'text', value = '', required = true, options, placeholder = '', min, rows = 3, help = '' } = opts;
  let input;
  if (options) {
    input = `<select class="form-select" name="${name}" ${required ? 'required' : ''}>${options.map(o => {
      const [v, t] = Array.isArray(o) ? o : [o, o];
      return `<option value="${esc(v)}" ${String(v) === String(value) ? 'selected' : ''}>${esc(t)}</option>`;
    }).join('')}</select>`;
  } else if (type === 'textarea') {
    input = `<textarea class="form-control" name="${name}" rows="${rows}" ${required ? 'required' : ''} placeholder="${esc(placeholder)}">${esc(value)}</textarea>`;
  } else {
    input = `<input class="form-control" type="${type}" name="${name}" value="${esc(value)}" ${required ? 'required' : ''} placeholder="${esc(placeholder)}" ${min ? `min="${min}"` : ''}>`;
  }
  return `<div class="mb-3"><label class="form-label">${label}</label>${input}${help ? `<div class="form-text">${help}</div>` : ''}</div>`;
};

/* ---------- 2. Menu + router ---------- */
const MENUS = {
  student: [
    ['dashboard', 'Dashboard', 'bi-grid-1x2'], ['attendance', 'My Attendance', 'bi-calendar-check'],
    ['assignments', 'Assignments', 'bi-journal-text'], ['notices', 'Notices', 'bi-megaphone'],
    ['events', 'Events', 'bi-calendar-event'], ['complaints', 'Complaints', 'bi-chat-left-text'],
    ['lostfound', 'Lost & Found', 'bi-search-heart'], ['profile', 'Profile', 'bi-person-circle']
  ],
  faculty: [
    ['dashboard', 'Dashboard', 'bi-grid-1x2'], ['students', 'Students', 'bi-people'],
    ['attendance', 'Attendance', 'bi-calendar-check'], ['assignments', 'Assignments', 'bi-journal-text'],
    ['notices', 'Notices', 'bi-megaphone'], ['events', 'Events', 'bi-calendar-event'],
    ['complaints', 'Complaints', 'bi-chat-left-text'], ['lostfound', 'Lost & Found', 'bi-search-heart'],
    ['profile', 'Profile', 'bi-person-circle']
  ],
  admin: [
    ['dashboard', 'Dashboard', 'bi-grid-1x2'], ['users', 'Users', 'bi-people'],
    ['departments', 'Departments', 'bi-building'], ['attendance', 'Attendance', 'bi-calendar-check'],
    ['notices', 'Notices', 'bi-megaphone'], ['events', 'Events', 'bi-calendar-event'],
    ['complaints', 'Complaints', 'bi-chat-left-text'], ['lostfound', 'Lost & Found', 'bi-search-heart'],
    ['profile', 'Profile', 'bi-person-circle']
  ]
};

const PAGES = {}; // filled in section 3: PAGES.name = async function () {...}

function buildMenu() {
  $('#nav').innerHTML = MENUS[ME.role].map(([id, label, icon]) =>
    `<a class="nav-link" href="#/${id}" data-page="${id}"><i class="bi ${icon}"></i>${label}</a>`).join('');
}

async function route() {
  const id = (location.hash.split('?')[0].replace('#/', '') || 'dashboard');
  const allowed = MENUS[ME.role].map(m => m[0]);
  const page = allowed.includes(id) ? id : 'dashboard';
  document.querySelectorAll('.nav-link').forEach(a => a.classList.toggle('active', a.dataset.page === page));
  $('#pageTitle').textContent = MENUS[ME.role].find(m => m[0] === page)[1];
  $('#sidebar').classList.remove('open');
  charts.forEach(c => c.destroy()); charts = [];
  $('#page').innerHTML = '<div class="empty">Loading...</div>';
  try { await PAGES[page](); }
  catch (e) { $('#page').innerHTML = empty('bi-exclamation-triangle', e.message); }
}
const refresh = () => route();
window.refresh = refresh;

function makeChart(canvasId, config) {
  const el = document.getElementById(canvasId);
  if (el) charts.push(new Chart(el, config));
}
const PALETTE = ['#1f7a8c', '#e8a33d', '#2e8b57', '#c8453b', '#6b7b80'];

/* ---------- 3. Pages ---------- */

/* ===== Dashboard ===== */
PAGES.dashboard = async function () {
  const s = await api('/api/stats');
  const [notices, events] = await Promise.all([api('/api/notices'), api('/api/events?upcoming=1')]);
  let cards = '', charts_html = '';

  if (ME.role === 'student') {
    cards = stat('bi-calendar-check', s.attendance + '%', 'Overall attendance', num(s.attendance) < 75 ? 'red' : 'green')
      + stat('bi-journal-text', s.pendingAssignments, 'Assignments to submit', 'amber')
      + stat('bi-calendar-event', s.upcomingEvents, 'Upcoming events')
      + stat('bi-chat-left-text', s.openComplaints, 'My open complaints');
    charts_html = `<div class="col-lg-6">${panel('Attendance by subject', '<div class="chart-box"><canvas id="c1"></canvas></div>')}</div>`;
  } else if (ME.role === 'faculty') {
    cards = stat('bi-journal-text', s.myAssignments, 'My assignments')
      + stat('bi-inbox', s.toReview, 'Submissions to review', 'amber')
      + stat('bi-people', s.students, 'Students in my department', 'green')
      + stat('bi-chat-left-text', s.openComplaints, 'Open complaints', 'red');
    charts_html = `<div class="col-lg-6">${panel('Submissions per assignment', '<div class="chart-box"><canvas id="c1"></canvas></div>')}</div>`;
  } else {
    cards = stat('bi-mortarboard', s.students, 'Students')
      + stat('bi-person-workspace', s.faculty, 'Faculty', 'green')
      + stat('bi-building', s.departments, 'Departments', 'amber')
      + stat('bi-calendar-check', s.avgAttendance + '%', 'Average attendance');
    charts_html = `
      <div class="col-lg-6">${panel('Attendance trend (last 10 days)', '<div class="chart-box"><canvas id="c1"></canvas></div>')}</div>
      <div class="col-lg-3 col-md-6">${panel('Complaints', '<div class="chart-box"><canvas id="c2"></canvas></div>')}</div>
      <div class="col-lg-3 col-md-6">${panel('Students per department', '<div class="chart-box"><canvas id="c3"></canvas></div>')}</div>`;
  }

  const noticeList = notices.slice(0, 4).map(n => `
    <div class="py-2 border-bottom"><div class="d-flex justify-content-between gap-2"><b>${esc(n.title)}</b>${badge(n.category, 'b-blue')}</div>
    <div class="small text-secondary">${fmtDate(n.created_at)} &middot; ${esc(n.author)}</div></div>`).join('') || empty('bi-megaphone', 'No notices yet.');
  const eventList = events.slice(0, 4).map(e => `
    <div class="d-flex gap-3 py-2 border-bottom"><div class="date-chip"><b>${new Date(e.event_date + 'T00:00:00').getDate()}</b><span>${new Date(e.event_date + 'T00:00:00').toLocaleString('en', { month: 'short' })}</span></div>
    <div><b>${esc(e.title)}</b><div class="small text-secondary"><i class="bi bi-geo-alt"></i> ${esc(e.location)}</div></div></div>`).join('') || empty('bi-calendar-event', 'No upcoming events.');

  $('#page').innerHTML = `
    <p class="mb-4 fs-5">Welcome back, <b>${esc(ME.name)}</b>.</p>
    <div class="row g-3 mb-3">${cards}</div>
    <div class="row g-3 mb-3">${charts_html}</div>
    <div class="row g-3">
      <div class="col-lg-7">${panel('Latest notices', noticeList, '<a href="#/notices" class="small">View all</a>')}</div>
      <div class="col-lg-5">${panel('Upcoming events', eventList, '<a href="#/events" class="small">View all</a>')}</div>
    </div>`;

  const bar = (labels, data, label) => ({ type: 'bar', data: { labels, datasets: [{ label, data, backgroundColor: '#1f7a8c', borderRadius: 6 }] }, options: { maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true } } } });
  if (ME.role === 'student') {
    const c = bar(s.bySubject.map(x => x.subject), s.bySubject.map(x => num(x.pct)), 'Attendance %');
    c.options.scales.y.max = 100; makeChart('c1', c);
  } else if (ME.role === 'faculty') {
    makeChart('c1', bar(s.byAssignment.map(x => x.title), s.byAssignment.map(x => num(x.submitted)), 'Submissions'));
  } else {
    makeChart('c1', { type: 'line', data: { labels: s.trend.map(t => fmtDate(t.date).slice(0, 6)), datasets: [{ label: 'Attendance %', data: s.trend.map(t => num(t.pct)), borderColor: '#1f7a8c', backgroundColor: 'rgba(31,122,140,.15)', fill: true, tension: .3 }] }, options: { maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { y: { min: 0, max: 100 } } } });
    makeChart('c2', { type: 'doughnut', data: { labels: s.complaints.map(c => c.status), datasets: [{ data: s.complaints.map(c => num(c.n)), backgroundColor: PALETTE }] }, options: { maintainAspectRatio: false, plugins: { legend: { position: 'bottom' } } } });
    makeChart('c3', bar(s.perDept.map(d => d.code), s.perDept.map(d => num(d.n)), 'Students'));
  }
};

/* ===== Attendance ===== */
async function attendanceSummaryPanel() {
  const depts = await api('/api/departments');
  const deptOpts = '<option value="">All departments</option>' + depts.map(d => `<option value="${d.id}">${esc(d.code)}</option>`).join('');
  const box = document.createElement('div');
  box.innerHTML = panel('Student-wise attendance', `
    <div class="row g-2 mb-3">
      <div class="col-sm-4"><select class="form-select" id="sumDept">${deptOpts}</select></div>
      <div class="col-sm-3"><select class="form-select" id="sumSem"><option value="">All semesters</option>${[1, 2, 3, 4, 5, 6, 7, 8].map(n => `<option>${n}</option>`).join('')}</select></div>
    </div><div id="sumTable"></div>`);
  async function load() {
    const q = new URLSearchParams();
    if ($('#sumDept').value) q.set('department_id', $('#sumDept').value);
    if ($('#sumSem').value) q.set('semester', $('#sumSem').value);
    const rows = await api('/api/attendance/summary?' + q);
    rows.forEach(r => NAMES[r.id] = r.name);
    $('#sumTable').innerHTML = rows.length ? `<div class="table-wrap"><table class="table"><thead><tr><th>Roll no</th><th>Name</th><th>Dept</th><th>Sem</th><th>Present / Total</th><th style="min-width:160px">Attendance</th><th></th></tr></thead><tbody>
      ${rows.map(r => `<tr><td>${esc(r.roll_no)}</td><td>${esc(r.name)}</td><td>${esc(r.department)}</td><td>${esc(r.semester)}</td>
      <td>${num(r.present)} / ${num(r.total)}</td><td>${pctBar(r.percentage)}</td>
      <td><button class="btn btn-sm btn-outline-secondary" onclick="showStudentReport(${r.id})">Report</button></td></tr>`).join('')}
      </tbody></table></div>` : empty('bi-people', 'No students found.');
  }
  setTimeout(() => { $('#sumDept').onchange = load; $('#sumSem').onchange = load; load(); }, 0);
  return box;
}

const NAMES = {};
window.showStudentReport = async (id) => {
  const name = NAMES[id] || 'Student';
  const d = await attempt(() => api('/api/attendance/student/' + id));
  if (!d) return;
  openInfo('Attendance report - ' + name, `
    <h6>By subject</h6>
    ${d.bySubject.length ? `<table class="table mb-4"><thead><tr><th>Subject</th><th>Present / Total</th><th>%</th></tr></thead><tbody>
      ${d.bySubject.map(s => `<tr><td>${esc(s.subject)}</td><td>${num(s.present)} / ${num(s.total)}</td><td style="min-width:150px">${pctBar(s.percentage)}</td></tr>`).join('')}</tbody></table>` : '<p class="text-secondary">No records yet.</p>'}
    <h6>Recent days</h6>
    ${d.records.length ? `<div class="table-wrap"><table class="table"><thead><tr><th>Date</th><th>Subject</th><th>Status</th></tr></thead><tbody>
      ${d.records.map(r => `<tr><td>${fmtDate(r.date)}</td><td>${esc(r.subject)}</td><td>${statusBadge(r.status)}</td></tr>`).join('')}</tbody></table></div>` : ''}`);
};

PAGES.attendance = async function () {
  if (ME.role === 'student') {
    const d = await api('/api/attendance/my');
    const p = num(d.overall.percentage);
    $('#page').innerHTML = `
      <div class="row g-3 mb-3">
        ${stat('bi-percent', p + '%', 'Overall attendance', p < 75 ? 'red' : 'green')}
        ${stat('bi-check2-circle', num(d.overall.present), 'Classes attended', 'green')}
        ${stat('bi-journal', num(d.overall.total), 'Total classes')}
      </div>
      ${p < 75 && num(d.overall.total) ? '<div class="alert alert-warning">Your attendance is below 75%. Please attend classes regularly.</div>' : ''}
      <div class="row g-3">
        <div class="col-lg-6">${panel('By subject', d.bySubject.length ? `<table class="table"><thead><tr><th>Subject</th><th>Present / Total</th><th>Attendance</th></tr></thead><tbody>
          ${d.bySubject.map(s => `<tr><td>${esc(s.subject)}</td><td>${num(s.present)} / ${num(s.total)}</td><td style="min-width:140px">${pctBar(s.percentage)}</td></tr>`).join('')}</tbody></table>` : empty('bi-calendar', 'No attendance recorded yet.'))}</div>
        <div class="col-lg-6">${panel('Recent records', d.recent.length ? `<div class="table-wrap" style="max-height:380px;overflow:auto"><table class="table"><thead><tr><th>Date</th><th>Subject</th><th>Status</th></tr></thead><tbody>
          ${d.recent.map(r => `<tr><td>${fmtDate(r.date)}</td><td>${esc(r.subject)}</td><td>${statusBadge(r.status)}</td></tr>`).join('')}</tbody></table></div>` : empty('bi-calendar', 'Nothing to show.'))}</div>
      </div>`;
    return;
  }

  if (ME.role === 'admin') {
    $('#page').innerHTML = '';
    $('#page').appendChild(await attendanceSummaryPanel());
    return;
  }

  // Faculty: mark attendance form + summary
  const depts = await api('/api/departments');
  $('#page').innerHTML = `
    ${panel('Mark attendance', `
      <div class="row g-2 align-items-end">
        <div class="col-md-3"><label class="form-label">Subject</label><input class="form-control" id="mSub" placeholder="e.g. Data Structures"></div>
        <div class="col-md-2"><label class="form-label">Date</label><input class="form-control" type="date" id="mDate" value="${todayStr()}" max="${todayStr()}"></div>
        <div class="col-md-3"><label class="form-label">Department</label><select class="form-select" id="mDept">${depts.map(d => `<option value="${d.id}" ${d.id === ME.department_id ? 'selected' : ''}>${esc(d.code)}</option>`).join('')}</select></div>
        <div class="col-md-2"><label class="form-label">Semester</label><select class="form-select" id="mSem">${[1, 2, 3, 4, 5, 6, 7, 8].map(n => `<option ${n === 5 ? 'selected' : ''}>${n}</option>`).join('')}</select></div>
        <div class="col-md-2"><button class="btn btn-campus w-100" id="loadBtn">Load students</button></div>
      </div>
      <div id="markArea" class="mt-3"></div>`)}
    <div class="mt-3" id="sumHolder"></div>`;
  $('#sumHolder').appendChild(await attendanceSummaryPanel());

  $('#loadBtn').onclick = async () => {
    const subject = $('#mSub').value.trim(), date = $('#mDate').value;
    if (!subject) return toast('Enter the subject first.', true);
    if (!date) return toast('Choose a date.', true);
    const students = await attempt(() => api(`/api/users/students?department_id=${$('#mDept').value}&semester=${$('#mSem').value}`));
    if (!students) return;
    if (!students.length) { $('#markArea').innerHTML = empty('bi-people', 'No students in this department and semester.'); return; }
    const existing = await attempt(() => api(`/api/attendance/day?subject=${encodeURIComponent(subject)}&date=${date}`)) || [];
    const prev = Object.fromEntries(existing.map(r => [r.student_id, r.status]));
    $('#markArea').innerHTML = `
      <div class="d-flex justify-content-between mb-2 flex-wrap gap-2">
        <span class="text-secondary">${students.length} students ${existing.length ? '(already marked - you can correct it)' : ''}</span>
        <div><button class="btn btn-sm btn-outline-success" id="allP">All present</button> <button class="btn btn-sm btn-outline-danger" id="allA">All absent</button></div>
      </div>
      <div class="table-wrap"><table class="table"><thead><tr><th>Roll no</th><th>Name</th><th>Status</th></tr></thead><tbody>
      ${students.map(s => `<tr><td>${esc(s.roll_no)}</td><td>${esc(s.name)}</td><td>
        <div class="btn-group btn-group-sm" role="group">
          <input type="radio" class="btn-check" name="st${s.id}" id="p${s.id}" value="Present" ${prev[s.id] !== 'Absent' ? 'checked' : ''}><label class="btn btn-outline-success" for="p${s.id}">Present</label>
          <input type="radio" class="btn-check" name="st${s.id}" id="a${s.id}" value="Absent" ${prev[s.id] === 'Absent' ? 'checked' : ''}><label class="btn btn-outline-danger" for="a${s.id}">Absent</label>
        </div></td></tr>`).join('')}</tbody></table></div>
      <button class="btn btn-amber" id="saveAtt">Save attendance</button>`;
    $('#allP').onclick = () => students.forEach(s => $('#p' + s.id).checked = true);
    $('#allA').onclick = () => students.forEach(s => $('#a' + s.id).checked = true);
    $('#saveAtt').onclick = async () => {
      const records = students.map(s => ({ student_id: s.id, status: document.querySelector(`input[name=st${s.id}]:checked`).value }));
      const r = await attempt(() => api('/api/attendance', 'POST', { subject, date, records }));
      if (r) { toast(r.message); refresh(); }
    };
  };
};

/* ===== Students (faculty) ===== */
PAGES.students = async function () {
  const rows = await api('/api/users/students');
  rows.forEach(r => NAMES[r.id] = r.name);
  $('#page').innerHTML = panel('All students', rows.length ? `<div class="table-wrap"><table class="table"><thead><tr><th>Roll no</th><th>Name</th><th>Email</th><th>Department</th><th>Sem</th><th>Phone</th><th></th></tr></thead><tbody>
    ${rows.map(r => `<tr><td>${esc(r.roll_no)}</td><td>${esc(r.name)}</td><td>${esc(r.email)}</td><td>${esc(r.department)}</td><td>${esc(r.semester)}</td><td>${esc(r.phone)}</td>
    <td><button class="btn btn-sm btn-outline-secondary" onclick="showStudentReport(${r.id})">Attendance</button></td></tr>`).join('')}</tbody></table></div>` : empty('bi-people', 'No students yet.'));
};

/* ===== Users (admin) ===== */
PAGES.users = async function () {
  const role = (location.hash.split('?role=')[1]) || '';
  const rows = await api('/api/users' + (role ? '?role=' + role : ''));
  const tab = (r, label) => `<a class="btn btn-sm ${role === r ? 'btn-campus' : 'btn-outline-secondary'}" href="#/users${r ? '?role=' + r : ''}">${label}</a>`;
  $('#page').innerHTML = panel('Manage users', `
    <div class="d-flex flex-wrap gap-2 mb-3 justify-content-between">
      <div class="d-flex gap-2">${tab('', 'All')}${tab('student', 'Students')}${tab('faculty', 'Faculty')}${tab('admin', 'Admins')}</div>
      <button class="btn btn-amber btn-sm" onclick="userForm()"><i class="bi bi-plus-lg"></i> Add user</button>
    </div>
    <div class="table-wrap"><table class="table"><thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Department</th><th>ID / Roll</th><th>Sem</th><th></th></tr></thead><tbody>
    ${rows.map(u => `<tr><td>${esc(u.name)}</td><td>${esc(u.email)}</td><td>${badge(u.role, u.role === 'admin' ? 'b-red' : u.role === 'faculty' ? 'b-blue' : 'b-green')}</td>
      <td>${esc(u.department || '-')}</td><td>${esc(u.roll_no || '-')}</td><td>${esc(u.semester || '-')}</td>
      <td class="text-nowrap"><button class="btn btn-sm btn-outline-secondary" onclick="userForm(${u.id})"><i class="bi bi-pencil"></i></button>
      <button class="btn btn-sm btn-outline-danger" onclick="deleteUser(${u.id})"><i class="bi bi-trash"></i></button></td></tr>`).join('')}</tbody></table></div>`);
  window._users = rows;
};
window.userForm = async (id) => {
  const depts = await api('/api/departments');
  const u = id ? window._users.find(x => x.id === id) : {};
  openForm({
    title: id ? 'Edit user' : 'Add user', submitText: id ? 'Save changes' : 'Create user',
    fieldsHtml:
      field('Full name', 'name', { value: u.name }) +
      field('Email', 'email', { type: 'email', value: u.email }) +
      field('Role', 'role', { options: ['student', 'faculty', 'admin'], value: u.role || 'student' }) +
      field('Department', 'department_id', { required: false, options: [['', 'None']].concat(depts.map(d => [d.id, d.name])), value: u.department_id || '' }) +
      field('Roll no / Employee ID', 'roll_no', { required: false, value: u.roll_no }) +
      field('Semester (students only)', 'semester', { required: false, type: 'number', value: u.semester }) +
      field('Phone', 'phone', { required: false, value: u.phone }) +
      field(id ? 'New password' : 'Password', 'password', { type: 'password', required: !id, help: id ? 'Leave blank to keep the old password.' : 'At least 6 characters.' }),
    onSubmit: async (v) => {
      const r = await attempt(() => api(id ? '/api/users/' + id : '/api/users', id ? 'PUT' : 'POST', v));
      if (r) { toast(r.message); modalObj.hide(); refresh(); }
    }
  });
};
window.deleteUser = async (id) => {
  if (!confirm('Delete this user and all their records? This cannot be undone.')) return;
  const r = await attempt(() => api('/api/users/' + id, 'DELETE'));
  if (r) { toast(r.message); refresh(); }
};

/* ===== Departments (admin) ===== */
PAGES.departments = async function () {
  const rows = await api('/api/departments');
  window._depts = rows;
  $('#page').innerHTML = panel('Departments', `
    <div class="text-end mb-3"><button class="btn btn-amber btn-sm" onclick="deptForm()"><i class="bi bi-plus-lg"></i> Add department</button></div>
    <div class="table-wrap"><table class="table"><thead><tr><th>Code</th><th>Name</th><th>Students</th><th>Faculty</th><th></th></tr></thead><tbody>
    ${rows.map(d => `<tr><td><b>${esc(d.code)}</b></td><td>${esc(d.name)}</td><td>${num(d.students)}</td><td>${num(d.faculty)}</td>
    <td class="text-nowrap"><button class="btn btn-sm btn-outline-secondary" onclick="deptForm(${d.id})"><i class="bi bi-pencil"></i></button>
    <button class="btn btn-sm btn-outline-danger" onclick="deleteDept(${d.id})"><i class="bi bi-trash"></i></button></td></tr>`).join('')}</tbody></table></div>`);
};
window.deptForm = (id) => {
  const d = id ? window._depts.find(x => x.id === id) : {};
  openForm({
    title: id ? 'Edit department' : 'Add department',
    fieldsHtml: field('Department name', 'name', { value: d.name }) + field('Short code', 'code', { value: d.code, placeholder: 'e.g. CSE' }),
    onSubmit: async (v) => {
      const r = await attempt(() => api(id ? '/api/departments/' + id : '/api/departments', id ? 'PUT' : 'POST', v));
      if (r) { toast(r.message); modalObj.hide(); refresh(); }
    }
  });
};
window.deleteDept = async (id) => {
  if (!confirm('Delete this department? Its assignments will also be removed.')) return;
  const r = await attempt(() => api('/api/departments/' + id, 'DELETE'));
  if (r) { toast(r.message); refresh(); }
};

/* ===== Assignments ===== */
PAGES.assignments = async function () {
  const rows = await api('/api/assignments');
  window._assign = rows;

  if (ME.role === 'student') {
    $('#page').innerHTML = rows.length ? `<div class="row g-3">${rows.map(a => {
      const overdue = a.deadline < todayStr() && !a.submission_status;
      return `<div class="col-md-6"><div class="item-card">
        <div class="d-flex justify-content-between gap-2"><h3 class="h6 mb-1">${esc(a.title)}</h3>${a.submission_status ? statusBadge(a.submission_status) : badge(overdue ? 'Overdue' : 'Not submitted', overdue ? 'b-red' : 'b-amber')}</div>
        <div class="small text-secondary mb-2">${esc(a.subject)} &middot; ${esc(a.faculty)} &middot; Due ${fmtDate(a.deadline)}</div>
        <p class="small">${esc(a.description)}</p>
        ${a.submission_status === 'Reviewed' ? `<div class="alert alert-success py-2 small mb-2"><b>Marks: ${esc(a.marks)}/100</b><br>${esc(a.feedback)}</div>` : ''}
        ${a.submission_status !== 'Reviewed' ? `<button class="btn btn-sm btn-campus" onclick="submitForm(${a.id})">${a.submission_status ? 'Update submission' : 'Submit assignment'}</button>` : ''}
      </div></div>`;
    }).join('')}</div>` : panel('Assignments', empty('bi-journal-text', 'No assignments for your class yet.'));
    return;
  }

  const canCreate = ME.role === 'faculty';
  $('#page').innerHTML = panel(canCreate ? 'My assignments' : 'All assignments', `
    ${canCreate ? '<div class="text-end mb-3"><button class="btn btn-amber btn-sm" onclick="assignForm()"><i class="bi bi-plus-lg"></i> New assignment</button></div>' : ''}
    ${rows.length ? `<div class="table-wrap"><table class="table"><thead><tr><th>Title</th><th>Subject</th><th>Class</th><th>Deadline</th><th>Submitted</th><th></th></tr></thead><tbody>
    ${rows.map(a => `<tr><td><b>${esc(a.title)}</b></td><td>${esc(a.subject)}</td><td>${esc(a.department)} - Sem ${esc(a.semester)}</td>
      <td>${fmtDate(a.deadline)} ${a.deadline < todayStr() ? badge('Closed', 'b-grey') : ''}</td><td>${num(a.submissions)} / ${num(a.total_students)}</td>
      <td class="text-nowrap"><button class="btn btn-sm btn-outline-secondary" onclick="viewSubmissions(${a.id})">Submissions</button>
      <button class="btn btn-sm btn-outline-danger" onclick="deleteAssign(${a.id})"><i class="bi bi-trash"></i></button></td></tr>`).join('')}</tbody></table></div>` : empty('bi-journal-text', 'No assignments yet.')}`);
};

window.assignForm = async () => {
  const depts = await api('/api/departments');
  openForm({
    title: 'New assignment', submitText: 'Create assignment',
    fieldsHtml:
      field('Title', 'title') + field('Subject', 'subject') +
      field('Department', 'department_id', { options: depts.map(d => [d.id, d.name]), value: ME.department_id }) +
      field('Semester', 'semester', { options: [1, 2, 3, 4, 5, 6, 7, 8], value: 5 }) +
      field('Deadline', 'deadline', { type: 'date', min: todayStr() }) +
      field('Description / instructions', 'description', { type: 'textarea', required: false }),
    onSubmit: async (v) => {
      const r = await attempt(() => api('/api/assignments', 'POST', v));
      if (r) { toast(r.message); modalObj.hide(); refresh(); }
    }
  });
};
window.deleteAssign = async (id) => {
  if (!confirm('Delete this assignment and all its submissions?')) return;
  const r = await attempt(() => api('/api/assignments/' + id, 'DELETE'));
  if (r) { toast(r.message); refresh(); }
};
window.submitForm = (id) => {
  const a = window._assign.find(x => x.id === id);
  openForm({
    title: 'Submit: ' + a.title, submitText: 'Submit',
    fieldsHtml:
      field('Your answer', 'answer_text', { type: 'textarea', required: false, rows: 5, value: a.answer_text }) +
      field('File link (Google Drive / GitHub, optional)', 'file_link', { type: 'url', required: false, value: a.file_link, placeholder: 'https://' }),
    onSubmit: async (v) => {
      const r = await attempt(() => api(`/api/assignments/${id}/submit`, 'POST', v));
      if (r) { toast(r.message); modalObj.hide(); refresh(); }
    }
  });
};
window.viewSubmissions = async (id) => {
  const d = await attempt(() => api(`/api/assignments/${id}/submissions`));
  if (!d) return;
  const canReview = ME.role === 'faculty';
  $('#page').innerHTML = `<button class="btn btn-sm btn-light mb-3" onclick="refresh()"><i class="bi bi-arrow-left"></i> Back</button>` +
    panel('Submissions: ' + esc(d.title), d.submissions.length ? `<div class="table-wrap"><table class="table"><thead><tr><th>Student</th><th>Answer</th><th>Status</th><th>Marks (0-100)</th><th>Feedback</th>${canReview ? '<th></th>' : ''}</tr></thead><tbody>
    ${d.submissions.map(s => `<tr><td>${esc(s.name)}<div class="small text-secondary">${esc(s.roll_no)}</div></td>
      <td style="max-width:260px">${esc(s.answer_text)} ${s.file_link ? `<br><a href="${esc(s.file_link)}" target="_blank" rel="noopener">Open file</a>` : ''}<div class="small text-secondary">${esc(s.submitted_at)}</div></td>
      <td>${statusBadge(s.status)}</td>
      <td>${canReview ? `<input class="form-control form-control-sm" style="width:80px" type="number" min="0" max="100" id="mk${s.id}" value="${s.marks ?? ''}">` : esc(s.marks ?? '-')}</td>
      <td>${canReview ? `<input class="form-control form-control-sm" id="fb${s.id}" value="${esc(s.feedback)}">` : esc(s.feedback)}</td>
      ${canReview ? `<td><button class="btn btn-sm btn-campus" onclick="saveReview(${s.id}, ${id})">Save</button></td>` : ''}</tr>`).join('')}</tbody></table></div>` : empty('bi-inbox', 'No submissions yet.'));
};
window.saveReview = async (sid, aid) => {
  const r = await attempt(() => api(`/api/assignments/submissions/${sid}/review`, 'PUT', { marks: $('#mk' + sid).value, feedback: $('#fb' + sid).value }));
  if (r) { toast(r.message); viewSubmissions(aid); }
};

/* ===== Notices ===== */
PAGES.notices = async function () {
  const cat = (location.hash.split('?cat=')[1]) || '';
  const rows = await api('/api/notices' + (cat ? '?category=' + cat : ''));
  const canPost = ME.role !== 'student';
  const pill = (c, label) => `<a class="btn btn-sm ${cat === c ? 'btn-campus' : 'btn-outline-secondary'}" href="#/notices${c ? '?cat=' + c : ''}">${label}</a>`;
  $('#page').innerHTML = `
    <div class="d-flex flex-wrap gap-2 mb-3 justify-content-between">
      <div class="d-flex flex-wrap gap-2">${pill('', 'All')}${['General', 'Academic', 'Exam', 'Placement', 'Holiday'].map(c => pill(c, c)).join('')}</div>
      ${canPost ? '<button class="btn btn-amber btn-sm" onclick="noticeForm()"><i class="bi bi-plus-lg"></i> Publish notice</button>' : ''}
    </div>
    ${rows.length ? rows.map(n => `<div class="panel mb-3">
      <div class="d-flex justify-content-between gap-2 flex-wrap"><h3 class="h6 mb-1">${esc(n.title)}</h3>
      <div>${badge(n.category, 'b-blue')} ${canPost && (ME.role === 'admin' || n.posted_by === ME.id) ? `<button class="btn btn-sm btn-outline-danger ms-1" onclick="deleteNotice(${n.id})"><i class="bi bi-trash"></i></button>` : ''}</div></div>
      <div class="small text-secondary mb-2">${fmtDate(n.created_at)} &middot; ${esc(n.author)} (${esc(n.author_role)})</div>
      <p class="mb-0">${esc(n.content)}</p></div>`).join('') : panel('Notices', empty('bi-megaphone', 'No notices in this category.'))}`;
};
window.noticeForm = () => openForm({
  title: 'Publish notice', submitText: 'Publish',
  fieldsHtml: field('Title', 'title') + field('Category', 'category', { options: ['General', 'Academic', 'Exam', 'Placement', 'Holiday'] }) + field('Notice', 'content', { type: 'textarea', rows: 5 }),
  onSubmit: async (v) => {
    const r = await attempt(() => api('/api/notices', 'POST', v));
    if (r) { toast(r.message); modalObj.hide(); refresh(); }
  }
});
window.deleteNotice = async (id) => {
  if (!confirm('Delete this notice?')) return;
  const r = await attempt(() => api('/api/notices/' + id, 'DELETE'));
  if (r) { toast(r.message); refresh(); }
};

/* ===== Events ===== */
PAGES.events = async function () {
  const rows = await api('/api/events');
  const canAdd = ME.role !== 'student';
  $('#page').innerHTML = `
    ${canAdd ? '<div class="text-end mb-3"><button class="btn btn-amber btn-sm" onclick="eventForm()"><i class="bi bi-plus-lg"></i> Add event</button></div>' : ''}
    ${rows.length ? `<div class="row g-3">${rows.map(e => {
      const d = new Date(e.event_date + 'T00:00:00');
      return `<div class="col-md-6"><div class="item-card d-flex gap-3" style="${num(e.is_upcoming) ? '' : 'opacity:.6'}">
        <div class="date-chip align-self-start"><b>${d.getDate()}</b><span>${d.toLocaleString('en', { month: 'short' })} ${d.getFullYear()}</span></div>
        <div class="flex-grow-1"><div class="d-flex justify-content-between gap-2"><h3 class="h6 mb-1">${esc(e.title)}</h3>${num(e.is_upcoming) ? badge('Upcoming', 'b-green') : badge('Past', 'b-grey')}</div>
        <div class="small text-secondary mb-2"><i class="bi bi-geo-alt"></i> ${esc(e.location)} &middot; by ${esc(e.organiser)}</div>
        <p class="small mb-1">${esc(e.description)}</p>
        ${ME.role === 'admin' ? `<button class="btn btn-sm btn-outline-danger" onclick="deleteEvent(${e.id})"><i class="bi bi-trash"></i> Delete</button>` : ''}</div>
      </div></div>`;
    }).join('')}</div>` : panel('Events', empty('bi-calendar-event', 'No events yet.'))}`;
};
window.eventForm = () => openForm({
  title: 'Add event', submitText: 'Add event',
  fieldsHtml: field('Event title', 'title') + field('Date', 'event_date', { type: 'date', min: todayStr() }) + field('Location', 'location') + field('Description', 'description', { type: 'textarea', required: false }),
  onSubmit: async (v) => {
    const r = await attempt(() => api('/api/events', 'POST', v));
    if (r) { toast(r.message); modalObj.hide(); refresh(); }
  }
});
window.deleteEvent = async (id) => {
  if (!confirm('Delete this event?')) return;
  const r = await attempt(() => api('/api/events/' + id, 'DELETE'));
  if (r) { toast(r.message); refresh(); }
};

/* ===== Complaints ===== */
PAGES.complaints = async function () {
  const rows = await api('/api/complaints');
  window._comp = rows;
  const isStudent = ME.role === 'student';
  $('#page').innerHTML = panel(isStudent ? 'My complaints' : 'Student complaints', `
    ${isStudent ? '<div class="text-end mb-3"><button class="btn btn-amber btn-sm" onclick="complaintForm()"><i class="bi bi-plus-lg"></i> New complaint</button></div>' : ''}
    ${rows.length ? `<div class="table-wrap"><table class="table"><thead><tr><th>ID</th>${isStudent ? '' : '<th>Student</th>'}<th>Subject</th><th>Date</th><th>Status</th><th>Response</th>${isStudent ? '' : '<th></th>'}</tr></thead><tbody>
    ${rows.map(c => `<tr><td class="text-nowrap"><b>${esc(c.complaint_code)}</b></td>${isStudent ? '' : `<td>${esc(c.student)}<div class="small text-secondary">${esc(c.roll_no)}</div></td>`}
      <td style="max-width:300px"><b>${esc(c.subject)}</b><div class="small text-secondary">${esc(c.description)}</div></td><td class="text-nowrap">${fmtDate(c.created_at)}</td>
      <td>${statusBadge(c.status)}</td><td class="small">${esc(c.response || '-')}</td>
      ${isStudent ? '' : `<td><button class="btn btn-sm btn-outline-secondary" onclick="updateComplaint(${c.id})">Update</button></td>`}</tr>`).join('')}</tbody></table></div>` : empty('bi-chat-left-text', 'No complaints yet.')}`);
};
window.complaintForm = () => openForm({
  title: 'New complaint', submitText: 'Submit complaint',
  fieldsHtml: field('Subject', 'subject', { placeholder: 'Short title of the problem' }) + field('Describe the problem', 'description', { type: 'textarea', rows: 5 }),
  onSubmit: async (v) => {
    const r = await attempt(() => api('/api/complaints', 'POST', v));
    if (r) { toast(r.message); modalObj.hide(); refresh(); }
  }
});
window.updateComplaint = (id) => {
  const c = window._comp.find(x => x.id === id);
  openForm({
    title: 'Update ' + c.complaint_code, submitText: 'Save update',
    fieldsHtml: field('Status', 'status', { options: ['Pending', 'In Progress', 'Resolved'], value: c.status }) + field('Response to student', 'response', { type: 'textarea', required: false, value: c.response }),
    onSubmit: async (v) => {
      const r = await attempt(() => api(`/api/complaints/${id}/status`, 'PUT', v));
      if (r) { toast(r.message); modalObj.hide(); refresh(); }
    }
  });
};

/* ===== Lost & Found ===== */
PAGES.lostfound = async function () {
  const type = (location.hash.split('?type=')[1]) || '';
  const rows = await api('/api/lostfound' + (type ? '?type=' + type : ''));
  const pill = (t, label) => `<a class="btn btn-sm ${type === t ? 'btn-campus' : 'btn-outline-secondary'}" href="#/lostfound${t ? '?type=' + t : ''}">${label}</a>`;
  $('#page').innerHTML = `
    <div class="d-flex flex-wrap gap-2 mb-3 justify-content-between">
      <div class="d-flex gap-2">${pill('', 'All')}${pill('Lost', 'Lost')}${pill('Found', 'Found')}</div>
      <button class="btn btn-amber btn-sm" onclick="lostForm()"><i class="bi bi-plus-lg"></i> Report an item</button>
    </div>
    ${rows.length ? `<div class="row g-3">${rows.map(i => {
      const canEdit = ME.role !== 'student' || i.reported_by === ME.id;
      const canDelete = ME.role === 'admin' || i.reported_by === ME.id;
      return `<div class="col-md-6 col-lg-4"><div class="item-card">
        <div class="d-flex justify-content-between mb-1">${statusBadge(i.type)}${statusBadge(i.status)}</div>
        <h3 class="h6">${esc(i.item_name)}</h3>
        <p class="small mb-2">${esc(i.description)}</p>
        <div class="small text-secondary"><i class="bi bi-geo-alt"></i> ${esc(i.location)} &middot; ${fmtDate(i.item_date)}<br><i class="bi bi-telephone"></i> ${esc(i.contact)} (${esc(i.reporter)})</div>
        ${canEdit || canDelete ? `<div class="d-flex gap-2 mt-3">
          ${canEdit ? `<select class="form-select form-select-sm" onchange="setLostStatus(${i.id}, this.value)">${['Open', 'Claimed', 'Returned'].map(s => `<option ${s === i.status ? 'selected' : ''}>${s}</option>`).join('')}</select>` : ''}
          ${canDelete ? `<button class="btn btn-sm btn-outline-danger" onclick="deleteLost(${i.id})" aria-label="Remove"><i class="bi bi-trash"></i></button>` : ''}</div>` : ''}
      </div></div>`;
    }).join('')}</div>` : panel('Lost & Found', empty('bi-search-heart', 'No items reported.'))}`;
};
window.lostForm = () => openForm({
  title: 'Report an item', submitText: 'Report item',
  fieldsHtml: field('Type', 'type', { options: ['Lost', 'Found'] }) + field('Item name', 'item_name') +
    field('Description', 'description', { type: 'textarea', required: false, rows: 2 }) +
    field('Where?', 'location') + field('Date', 'item_date', { type: 'date', value: todayStr() }) +
    field('Contact number / email', 'contact'),
  onSubmit: async (v) => {
    const r = await attempt(() => api('/api/lostfound', 'POST', v));
    if (r) { toast(r.message); modalObj.hide(); refresh(); }
  }
});
window.setLostStatus = async (id, status) => {
  const r = await attempt(() => api(`/api/lostfound/${id}/status`, 'PUT', { status }));
  if (r) { toast(r.message); refresh(); }
};
window.deleteLost = async (id) => {
  if (!confirm('Remove this item?')) return;
  const r = await attempt(() => api('/api/lostfound/' + id, 'DELETE'));
  if (r) { toast(r.message); refresh(); }
};

/* ===== Profile ===== */
PAGES.profile = async function () {
  const p = await api('/api/auth/me');
  const row = (k, v) => `<tr><th class="text-secondary fw-normal" style="width:40%">${k}</th><td>${esc(v || '-')}</td></tr>`;
  $('#page').innerHTML = `<div class="row g-3">
    <div class="col-lg-6">${panel('My profile', `<table class="table"><tbody>
      ${row('Name', p.name)}${row('Email', p.email)}${row('Role', p.role)}${row('Department', p.department)}
      ${row(p.role === 'student' ? 'Roll number' : 'Employee ID', p.roll_no)}${p.role === 'student' ? row('Semester', p.semester) : ''}${row('Phone', p.phone)}</tbody></table>`)}</div>
    <div class="col-lg-6">${panel('Update details', `<form id="profForm">
      <div class="mb-3"><label class="form-label">Phone</label><input class="form-control" name="phone" value="${esc(p.phone)}"></div>
      <div class="mb-3"><label class="form-label">New password</label><input class="form-control" type="password" name="password" autocomplete="new-password"><div class="form-text">Leave blank to keep your current password.</div></div>
      <button class="btn btn-campus">Save changes</button></form>`)}</div></div>`;
  $('#profForm').onsubmit = async (e) => {
    e.preventDefault();
    const v = Object.fromEntries(new FormData(e.target));
    const r = await attempt(() => api('/api/users/me/profile', 'PUT', v));
    if (r) { toast(r.message); refresh(); }
  };
};

/* ---------- 4. Start the app ---------- */
(async function start() {
  try { ME = await api('/api/auth/me'); } catch { return; }
  modalObj = new bootstrap.Modal($('#appModal'));
  $('#modalForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!modalHandler) return;
    const form = e.target;
    if (!form.checkValidity()) { form.classList.add('was-validated'); return toast('Please fill all required fields.', true); }
    const btn = $('#modalSubmit'); btn.disabled = true;
    try { await modalHandler(Object.fromEntries(new FormData(form))); } finally { btn.disabled = false; }
  });
  $('#uName').textContent = ME.name;
  $('#uRole').innerHTML = badge(ME.role, 'b-blue');
  $('#today').textContent = new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  $('#menuBtn').onclick = () => $('#sidebar').classList.toggle('open');
  $('#logoutBtn').onclick = async () => { await api('/api/auth/logout', 'POST'); location.href = 'login.html'; };
  buildMenu();
  window.addEventListener('hashchange', () => route());
  route();
})();
