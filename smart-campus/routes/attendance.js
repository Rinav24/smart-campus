const express = require('express');
const db = require('../config/db');
const { requireRole } = require('../middleware/auth');
const router = express.Router();

// Faculty marks attendance for a list of students in one go.
// Body: { subject, date, records: [{ student_id, status }] }
router.post('/', requireRole('faculty'), async (req, res, next) => {
  try {
    const { subject, date, records } = req.body;
    if (!subject || !subject.trim()) return res.status(400).json({ error: 'Subject is required.' });
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date || '')) return res.status(400).json({ error: 'A valid date is required.' });
    if (!Array.isArray(records) || !records.length) return res.status(400).json({ error: 'No students to mark.' });
    if (records.some(r => !['Present', 'Absent'].includes(r.status))) return res.status(400).json({ error: 'Status must be Present or Absent.' });

    const values = records.map(r => [r.student_id, req.session.user.id, subject.trim(), date, r.status]);
    // ON DUPLICATE KEY UPDATE lets faculty correct a day that was already marked.
    await db.query(
      `INSERT INTO attendance (student_id, faculty_id, subject, date, status) VALUES ?
       ON DUPLICATE KEY UPDATE status = VALUES(status), faculty_id = VALUES(faculty_id)`, [values]);
    res.status(201).json({ message: `Attendance saved for ${records.length} students.` });
  } catch (e) { next(e); }
});

// Existing marks for a subject + date, so the faculty can see/edit what was saved.
router.get('/day', requireRole('faculty', 'admin'), async (req, res, next) => {
  try {
    const { subject, date } = req.query;
    const [rows] = await db.query('SELECT student_id, status FROM attendance WHERE subject = ? AND date = ?', [subject, date]);
    res.json(rows);
  } catch (e) { next(e); }
});

// Student: own summary per subject + overall percentage + recent records
router.get('/my', requireRole('student'), async (req, res, next) => {
  try {
    const id = req.session.user.id;
    const [bySubject] = await db.query(
      `SELECT subject, COUNT(*) AS total, SUM(status='Present') AS present,
              ROUND(SUM(status='Present')*100/COUNT(*),1) AS percentage
       FROM attendance WHERE student_id = ? GROUP BY subject ORDER BY subject`, [id]);
    const [[overall]] = await db.query(
      `SELECT COUNT(*) AS total, COALESCE(SUM(status='Present'),0) AS present,
              COALESCE(ROUND(SUM(status='Present')*100/COUNT(*),1),0) AS percentage
       FROM attendance WHERE student_id = ?`, [id]);
    const [recent] = await db.query(
      'SELECT subject, date, status FROM attendance WHERE student_id = ? ORDER BY date DESC, subject LIMIT 30', [id]);
    res.json({ overall, bySubject, recent });
  } catch (e) { next(e); }
});

// Faculty/Admin: student-wise attendance percentage. Optional ?department_id=&semester=
router.get('/summary', requireRole('faculty', 'admin'), async (req, res, next) => {
  try {
    const where = ["u.role='student'"], params = [];
    if (req.query.department_id) { where.push('u.department_id = ?'); params.push(req.query.department_id); }
    if (req.query.semester) { where.push('u.semester = ?'); params.push(req.query.semester); }
    const [rows] = await db.query(
      `SELECT u.id, u.name, u.roll_no, d.code AS department, u.semester,
              COUNT(a.id) AS total, COALESCE(SUM(a.status='Present'),0) AS present,
              COALESCE(ROUND(SUM(a.status='Present')*100/NULLIF(COUNT(a.id),0),1),0) AS percentage
       FROM users u
       LEFT JOIN departments d ON d.id = u.department_id
       LEFT JOIN attendance a ON a.student_id = u.id
       WHERE ${where.join(' AND ')}
       GROUP BY u.id, u.name, u.roll_no, d.code, u.semester ORDER BY u.roll_no`, params);
    res.json(rows);
  } catch (e) { next(e); }
});

// Faculty/Admin: one student's detailed report
router.get('/student/:id', requireRole('faculty', 'admin'), async (req, res, next) => {
  try {
    const [bySubject] = await db.query(
      `SELECT subject, COUNT(*) AS total, SUM(status='Present') AS present,
              ROUND(SUM(status='Present')*100/COUNT(*),1) AS percentage
       FROM attendance WHERE student_id = ? GROUP BY subject`, [req.params.id]);
    const [records] = await db.query(
      'SELECT subject, date, status FROM attendance WHERE student_id = ? ORDER BY date DESC LIMIT 60', [req.params.id]);
    res.json({ bySubject, records });
  } catch (e) { next(e); }
});

module.exports = router;
