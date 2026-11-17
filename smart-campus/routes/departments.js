const express = require('express');
const db = require('../config/db');
const { requireRole } = require('../middleware/auth');
const router = express.Router();

// Everyone logged in can read; includes how many students/faculty each department has.
router.get('/', async (req, res, next) => {
  try {
    const [rows] = await db.query(
      `SELECT d.id, d.name, d.code,
        (SELECT COUNT(*) FROM users u WHERE u.department_id = d.id AND u.role='student') AS students,
        (SELECT COUNT(*) FROM users u WHERE u.department_id = d.id AND u.role='faculty') AS faculty
       FROM departments d ORDER BY d.name`);
    res.json(rows);
  } catch (e) { next(e); }
});

router.post('/', requireRole('admin'), async (req, res, next) => {
  try {
    const { name, code } = req.body;
    if (!name || !code) return res.status(400).json({ error: 'Name and code are required.' });
    await db.query('INSERT INTO departments (name, code) VALUES (?, ?)', [name.trim(), code.trim().toUpperCase()]);
    res.status(201).json({ message: 'Department added.' });
  } catch (e) {
    if (e.code === 'ER_DUP_ENTRY') return res.status(409).json({ error: 'Department name or code already exists.' });
    next(e);
  }
});

router.put('/:id', requireRole('admin'), async (req, res, next) => {
  try {
    const { name, code } = req.body;
    if (!name || !code) return res.status(400).json({ error: 'Name and code are required.' });
    await db.query('UPDATE departments SET name=?, code=? WHERE id=?', [name.trim(), code.trim().toUpperCase(), req.params.id]);
    res.json({ message: 'Department updated.' });
  } catch (e) {
    if (e.code === 'ER_DUP_ENTRY') return res.status(409).json({ error: 'Department name or code already exists.' });
    next(e);
  }
});

router.delete('/:id', requireRole('admin'), async (req, res, next) => {
  try {
    await db.query('DELETE FROM departments WHERE id = ?', [req.params.id]);
    res.json({ message: 'Department deleted.' });
  } catch (e) { next(e); }
});

module.exports = router;
