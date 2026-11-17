// Registration, login, logout and "who am I".
const express = require('express');
const bcrypt = require('bcryptjs');
const db = require('../config/db');
const router = express.Router();

const emailOk = e => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e || '');

// Departments list for the registration dropdown (public)
router.get('/departments', async (req, res, next) => {
  try {
    const [rows] = await db.query('SELECT id, name, code FROM departments ORDER BY name');
    res.json(rows);
  } catch (e) { next(e); }
});

// Only STUDENTS can self-register. Faculty/admin accounts are created by the admin.
router.post('/register', async (req, res, next) => {
  try {
    const { name, email, password, department_id, roll_no, semester, phone } = req.body;
    if (!name || name.trim().length < 2) return res.status(400).json({ error: 'Please enter your full name.' });
    if (!emailOk(email)) return res.status(400).json({ error: 'Please enter a valid email.' });
    if (!password || password.length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters.' });
    if (!department_id || !roll_no || !semester) return res.status(400).json({ error: 'Department, roll number and semester are required.' });

    const [exists] = await db.query('SELECT id FROM users WHERE email = ?', [email.toLowerCase()]);
    if (exists.length) return res.status(409).json({ error: 'This email is already registered.' });

    const hash = await bcrypt.hash(password, 10);
    await db.query(
      'INSERT INTO users (name,email,password_hash,role,department_id,roll_no,semester,phone) VALUES (?,?,?,?,?,?,?,?)',
      [name.trim(), email.toLowerCase(), hash, 'student', department_id, roll_no, semester, phone || null]
    );
    res.status(201).json({ message: 'Registration successful. You can log in now.' });
  } catch (e) { next(e); }
});

router.post('/login', async (req, res, next) => {
  try {
    const { email, password, role } = req.body;
    if (!emailOk(email) || !password) return res.status(400).json({ error: 'Enter your email and password.' });

    const [rows] = await db.query('SELECT * FROM users WHERE email = ?', [email.toLowerCase()]);
    const user = rows[0];
    // same message for "no user" and "wrong password" so attackers learn nothing
    if (!user || !(await bcrypt.compare(password, user.password_hash))) {
      return res.status(401).json({ error: 'Incorrect email or password.' });
    }
    if (role && role !== user.role) {
      return res.status(403).json({ error: `This account is not a ${role} account.` });
    }
    req.session.user = { id: user.id, name: user.name, email: user.email, role: user.role, department_id: user.department_id, semester: user.semester };
    res.json({ user: req.session.user });
  } catch (e) { next(e); }
});

router.post('/logout', (req, res) => {
  req.session.destroy(() => res.json({ message: 'Logged out.' }));
});

// Returns the full profile of the logged-in user
router.get('/me', async (req, res, next) => {
  try {
    if (!req.session.user) return res.status(401).json({ error: 'Not logged in.' });
    const [rows] = await db.query(
      `SELECT u.id,u.name,u.email,u.role,u.roll_no,u.semester,u.phone,u.department_id,d.name AS department
       FROM users u LEFT JOIN departments d ON d.id = u.department_id WHERE u.id = ?`, [req.session.user.id]);
    if (!rows.length) return res.status(401).json({ error: 'Account no longer exists.' });
    res.json(rows[0]);
  } catch (e) { next(e); }
});

module.exports = router;
