// User management. Admin: full control. Faculty: can only list students.
const express = require('express');
const bcrypt = require('bcryptjs');
const db = require('../config/db');
const { requireRole } = require('../middleware/auth');
const router = express.Router();

const BASE = `SELECT u.id,u.name,u.email,u.role,u.roll_no,u.semester,u.phone,u.department_id,d.name AS department
              FROM users u LEFT JOIN departments d ON d.id = u.department_id`;

// List students (faculty + admin). Optional ?department_id=&semester=
router.get('/students', requireRole('faculty', 'admin'), async (req, res, next) => {
  try {
    const where = ["u.role = 'student'"], params = [];
    if (req.query.department_id) { where.push('u.department_id = ?'); params.push(req.query.department_id); }
    if (req.query.semester) { where.push('u.semester = ?'); params.push(req.query.semester); }
    const [rows] = await db.query(`${BASE} WHERE ${where.join(' AND ')} ORDER BY u.roll_no`, params);
    res.json(rows);
  } catch (e) { next(e); }
});

// List all users, optional ?role=
router.get('/', requireRole('admin'), async (req, res, next) => {
  try {
    const params = [];
    let sql = BASE;
    if (['student', 'faculty', 'admin'].includes(req.query.role)) { sql += ' WHERE u.role = ?'; params.push(req.query.role); }
    const [rows] = await db.query(sql + ' ORDER BY u.role, u.name', params);
    res.json(rows);
  } catch (e) { next(e); }
});

function validate(b, isNew) {
  if (!b.name || b.name.trim().length < 2) return 'Name is required.';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(b.email || '')) return 'A valid email is required.';
  if (!['student', 'faculty', 'admin'].includes(b.role)) return 'Role must be student, faculty or admin.';
  if (isNew && (!b.password || b.password.length < 6)) return 'Password must be at least 6 characters.';
  if (b.role === 'student' && (!b.department_id || !b.semester)) return 'Students need a department and semester.';
  return null;
}

router.post('/', requireRole('admin'), async (req, res, next) => {
  try {
    const b = req.body;
    const err = validate(b, true);
    if (err) return res.status(400).json({ error: err });
    const [dup] = await db.query('SELECT id FROM users WHERE email = ?', [b.email.toLowerCase()]);
    if (dup.length) return res.status(409).json({ error: 'Email already in use.' });
    const hash = await bcrypt.hash(b.password, 10);
    await db.query(
      'INSERT INTO users (name,email,password_hash,role,department_id,roll_no,semester,phone) VALUES (?,?,?,?,?,?,?,?)',
      [b.name.trim(), b.email.toLowerCase(), hash, b.role, b.department_id || null, b.roll_no || null,
       b.role === 'student' ? b.semester : null, b.phone || null]);
    res.status(201).json({ message: 'User created.' });
  } catch (e) { next(e); }
});

router.put('/:id', requireRole('admin'), async (req, res, next) => {
  try {
    const b = req.body;
    const err = validate(b, false);
    if (err) return res.status(400).json({ error: err });
    const [dup] = await db.query('SELECT id FROM users WHERE email = ? AND id <> ?', [b.email.toLowerCase(), req.params.id]);
    if (dup.length) return res.status(409).json({ error: 'Email already in use.' });
    await db.query(
      'UPDATE users SET name=?, email=?, role=?, department_id=?, roll_no=?, semester=?, phone=? WHERE id=?',
      [b.name.trim(), b.email.toLowerCase(), b.role, b.department_id || null, b.roll_no || null,
       b.role === 'student' ? b.semester : null, b.phone || null, req.params.id]);
    if (b.password) {
      if (b.password.length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters.' });
      await db.query('UPDATE users SET password_hash=? WHERE id=?', [await bcrypt.hash(b.password, 10), req.params.id]);
    }
    res.json({ message: 'User updated.' });
  } catch (e) { next(e); }
});

router.delete('/:id', requireRole('admin'), async (req, res, next) => {
  try {
    if (Number(req.params.id) === req.session.user.id) {
      return res.status(400).json({ error: 'You cannot delete your own account.' });
    }
    await db.query('DELETE FROM users WHERE id = ?', [req.params.id]);
    res.json({ message: 'User deleted.' });
  } catch (e) { next(e); }
});

// Logged-in user can change their own phone and password
router.put('/me/profile', async (req, res, next) => {
  try {
    const { phone, password } = req.body;
    await db.query('UPDATE users SET phone = ? WHERE id = ?', [phone || null, req.session.user.id]);
    if (password) {
      if (password.length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters.' });
      await db.query('UPDATE users SET password_hash = ? WHERE id = ?', [await bcrypt.hash(password, 10), req.session.user.id]);
    }
    res.json({ message: 'Profile updated.' });
  } catch (e) { next(e); }
});

module.exports = router;
