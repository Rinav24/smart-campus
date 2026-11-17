const express = require('express');
const db = require('../config/db');
const { requireRole } = require('../middleware/auth');
const router = express.Router();

// Faculty creates an assignment
router.post('/', requireRole('faculty'), async (req, res, next) => {
  try {
    const { title, description, subject, department_id, semester, deadline } = req.body;
    if (!title || !subject || !department_id || !semester || !/^\d{4}-\d{2}-\d{2}$/.test(deadline || '')) {
      return res.status(400).json({ error: 'Title, subject, department, semester and deadline are required.' });
    }
    await db.query(
      'INSERT INTO assignments (title,description,subject,department_id,semester,deadline,faculty_id) VALUES (?,?,?,?,?,?,?)',
      [title.trim(), description || '', subject.trim(), department_id, semester, deadline, req.session.user.id]);
    res.status(201).json({ message: 'Assignment created.' });
  } catch (e) { next(e); }
});

// List assignments - the result depends on who is asking.
router.get('/', async (req, res, next) => {
  try {
    const u = req.session.user;
    if (u.role === 'student') {
      const [rows] = await db.query(
        `SELECT a.id,a.title,a.description,a.subject,a.deadline,f.name AS faculty,
                s.status AS submission_status, s.marks, s.feedback, s.answer_text, s.file_link
         FROM assignments a
         JOIN users f ON f.id = a.faculty_id
         LEFT JOIN submissions s ON s.assignment_id = a.id AND s.student_id = ?
         WHERE a.department_id = ? AND a.semester = ?
         ORDER BY a.deadline DESC`, [u.id, u.department_id, u.semester]);
      return res.json(rows);
    }
    // faculty sees their own, admin sees all
    const params = [];
    let where = '';
    if (u.role === 'faculty') { where = 'WHERE a.faculty_id = ?'; params.push(u.id); }
    const [rows] = await db.query(
      `SELECT a.id,a.title,a.subject,a.semester,a.deadline,d.code AS department,f.name AS faculty,
              (SELECT COUNT(*) FROM submissions s WHERE s.assignment_id = a.id) AS submissions,
              (SELECT COUNT(*) FROM users st WHERE st.role='student' AND st.department_id=a.department_id AND st.semester=a.semester) AS total_students
       FROM assignments a JOIN departments d ON d.id=a.department_id JOIN users f ON f.id=a.faculty_id
       ${where} ORDER BY a.deadline DESC`, params);
    res.json(rows);
  } catch (e) { next(e); }
});

// Student submits (or re-submits) an assignment
router.post('/:id/submit', requireRole('student'), async (req, res, next) => {
  try {
    const u = req.session.user;
    const { answer_text, file_link } = req.body;
    if (!(answer_text && answer_text.trim()) && !(file_link && file_link.trim())) {
      return res.status(400).json({ error: 'Write an answer or paste a file link.' });
    }
    const [[a]] = await db.query('SELECT * FROM assignments WHERE id = ?', [req.params.id]);
    if (!a) return res.status(404).json({ error: 'Assignment not found.' });
    if (a.department_id !== u.department_id || a.semester !== u.semester) {
      return res.status(403).json({ error: 'This assignment is not for your class.' });
    }
    const [[chk]] = await db.query('SELECT status FROM submissions WHERE assignment_id=? AND student_id=?', [a.id, u.id]);
    if (chk && chk.status === 'Reviewed') return res.status(400).json({ error: 'Already reviewed; you cannot change it.' });

    const [[{ late }]] = await db.query('SELECT (CURDATE() > ?) AS late', [a.deadline]);
    const status = late ? 'Late' : 'Submitted';
    await db.query(
      `INSERT INTO submissions (assignment_id,student_id,answer_text,file_link,status) VALUES (?,?,?,?,?)
       ON DUPLICATE KEY UPDATE answer_text=VALUES(answer_text), file_link=VALUES(file_link), status=VALUES(status), submitted_at=CURRENT_TIMESTAMP`,
      [a.id, u.id, answer_text || '', file_link || '', status]);
    res.status(201).json({ message: late ? 'Submitted after the deadline (marked Late).' : 'Assignment submitted.' });
  } catch (e) { next(e); }
});

// Faculty reviews all submissions of one assignment
router.get('/:id/submissions', requireRole('faculty', 'admin'), async (req, res, next) => {
  try {
    const [[a]] = await db.query('SELECT faculty_id, title FROM assignments WHERE id = ?', [req.params.id]);
    if (!a) return res.status(404).json({ error: 'Assignment not found.' });
    if (req.session.user.role === 'faculty' && a.faculty_id !== req.session.user.id) {
      return res.status(403).json({ error: 'This is not your assignment.' });
    }
    const [rows] = await db.query(
      `SELECT s.id, s.answer_text, s.file_link, s.status, s.marks, s.feedback, s.submitted_at, u.name, u.roll_no
       FROM submissions s JOIN users u ON u.id = s.student_id WHERE s.assignment_id = ? ORDER BY s.submitted_at`, [req.params.id]);
    res.json({ title: a.title, submissions: rows });
  } catch (e) { next(e); }
});

// Faculty gives marks + feedback
router.put('/submissions/:id/review', requireRole('faculty'), async (req, res, next) => {
  try {
    const { marks, feedback } = req.body;
    const m = Number(marks);
    if (!Number.isFinite(m) || m < 0 || m > 100) return res.status(400).json({ error: 'Marks must be between 0 and 100.' });
    const [[s]] = await db.query(
      `SELECT a.faculty_id FROM submissions s JOIN assignments a ON a.id = s.assignment_id WHERE s.id = ?`, [req.params.id]);
    if (!s) return res.status(404).json({ error: 'Submission not found.' });
    if (s.faculty_id !== req.session.user.id) return res.status(403).json({ error: 'This is not your assignment.' });
    await db.query("UPDATE submissions SET marks=?, feedback=?, status='Reviewed' WHERE id=?", [m, feedback || '', req.params.id]);
    res.json({ message: 'Review saved.' });
  } catch (e) { next(e); }
});

router.delete('/:id', requireRole('faculty', 'admin'), async (req, res, next) => {
  try {
    const u = req.session.user;
    const [r] = u.role === 'admin'
      ? await db.query('DELETE FROM assignments WHERE id = ?', [req.params.id])
      : await db.query('DELETE FROM assignments WHERE id = ? AND faculty_id = ?', [req.params.id, u.id]);
    if (!r.affectedRows) return res.status(404).json({ error: 'Assignment not found or not yours.' });
    res.json({ message: 'Assignment deleted.' });
  } catch (e) { next(e); }
});

module.exports = router;
