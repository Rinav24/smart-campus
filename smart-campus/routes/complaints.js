const express = require('express');
const db = require('../config/db');
const { requireRole } = require('../middleware/auth');
const router = express.Router();

// Student submits a complaint. A readable ID like CMP-2026-0007 is created from the row id.
router.post('/', requireRole('student'), async (req, res, next) => {
  try {
    const { subject, description } = req.body;
    if (!subject || subject.trim().length < 4) return res.status(400).json({ error: 'Please write a short subject.' });
    if (!description || description.trim().length < 10) return res.status(400).json({ error: 'Please describe the problem (at least 10 characters).' });
    const [r] = await db.query('INSERT INTO complaints (student_id,subject,description) VALUES (?,?,?)',
      [req.session.user.id, subject.trim(), description.trim()]);
    const code = `CMP-${new Date().getFullYear()}-${String(r.insertId).padStart(4, '0')}`;
    await db.query('UPDATE complaints SET complaint_code = ? WHERE id = ?', [code, r.insertId]);
    res.status(201).json({ message: `Complaint submitted. Your ID is ${code}.`, complaint_code: code });
  } catch (e) { next(e); }
});

// Student: own complaints. Faculty/Admin: all complaints.
router.get('/', async (req, res, next) => {
  try {
    const u = req.session.user;
    const params = [];
    let where = '';
    if (u.role === 'student') { where = 'WHERE c.student_id = ?'; params.push(u.id); }
    const [rows] = await db.query(
      `SELECT c.id,c.complaint_code,c.subject,c.description,c.status,c.response,c.created_at,u.name AS student,u.roll_no
       FROM complaints c JOIN users u ON u.id = c.student_id ${where}
       ORDER BY FIELD(c.status,'Pending','In Progress','Resolved'), c.created_at DESC`, params);
    res.json(rows);
  } catch (e) { next(e); }
});

router.put('/:id/status', requireRole('faculty', 'admin'), async (req, res, next) => {
  try {
    const { status, response } = req.body;
    if (!['Pending', 'In Progress', 'Resolved'].includes(status)) return res.status(400).json({ error: 'Invalid status.' });
    const [r] = await db.query('UPDATE complaints SET status = ?, response = ? WHERE id = ?', [status, response || null, req.params.id]);
    if (!r.affectedRows) return res.status(404).json({ error: 'Complaint not found.' });
    res.json({ message: 'Complaint updated.' });
  } catch (e) { next(e); }
});

module.exports = router;
