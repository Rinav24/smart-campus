// Numbers for the dashboard cards and charts. The result depends on the role.
const express = require('express');
const db = require('../config/db');
const router = express.Router();

router.get('/', async (req, res, next) => {
  try {
    const u = req.session.user;
    const one = async (sql, p = []) => (await db.query(sql, p))[0][0];

    if (u.role === 'admin') {
      const students = await one("SELECT COUNT(*) AS n FROM users WHERE role='student'");
      const faculty = await one("SELECT COUNT(*) AS n FROM users WHERE role='faculty'");
      const depts = await one('SELECT COUNT(*) AS n FROM departments');
      const events = await one('SELECT COUNT(*) AS n FROM events WHERE event_date >= CURDATE()');
      const avg = await one("SELECT COALESCE(ROUND(SUM(status='Present')*100/NULLIF(COUNT(*),0),1),0) AS n FROM attendance");
      const [complaints] = await db.query('SELECT status, COUNT(*) AS n FROM complaints GROUP BY status');
      const [perDept] = await db.query(
        `SELECT d.code, COUNT(u.id) AS n FROM departments d
         LEFT JOIN users u ON u.department_id = d.id AND u.role='student' GROUP BY d.id, d.code ORDER BY d.code`);
      const [trend] = await db.query(
        `SELECT date, ROUND(SUM(status='Present')*100/COUNT(*),1) AS pct FROM attendance
         GROUP BY date ORDER BY date DESC LIMIT 10`);
      return res.json({ students: students.n, faculty: faculty.n, departments: depts.n, upcomingEvents: events.n,
        avgAttendance: avg.n, complaints, perDept, trend: trend.reverse() });
    }

    if (u.role === 'faculty') {
      const myAssignments = await one('SELECT COUNT(*) AS n FROM assignments WHERE faculty_id = ?', [u.id]);
      const toReview = await one(
        `SELECT COUNT(*) AS n FROM submissions s JOIN assignments a ON a.id = s.assignment_id
         WHERE a.faculty_id = ? AND s.status <> 'Reviewed'`, [u.id]);
      const students = await one("SELECT COUNT(*) AS n FROM users WHERE role='student' AND department_id = ?", [u.department_id]);
      const open = await one("SELECT COUNT(*) AS n FROM complaints WHERE status <> 'Resolved'");
      const [byAssignment] = await db.query(
        `SELECT a.title, (SELECT COUNT(*) FROM submissions s WHERE s.assignment_id = a.id) AS submitted
         FROM assignments a WHERE a.faculty_id = ? ORDER BY a.deadline DESC LIMIT 6`, [u.id]);
      return res.json({ myAssignments: myAssignments.n, toReview: toReview.n, students: students.n, openComplaints: open.n, byAssignment });
    }

    // student
    const att = await one(
      `SELECT COALESCE(ROUND(SUM(status='Present')*100/NULLIF(COUNT(*),0),1),0) AS pct FROM attendance WHERE student_id = ?`, [u.id]);
    const [bySubject] = await db.query(
      `SELECT subject, ROUND(SUM(status='Present')*100/COUNT(*),1) AS pct FROM attendance WHERE student_id = ? GROUP BY subject`, [u.id]);
    const pending = await one(
      `SELECT COUNT(*) AS n FROM assignments a
       WHERE a.department_id = ? AND a.semester = ? AND a.deadline >= CURDATE()
       AND NOT EXISTS (SELECT 1 FROM submissions s WHERE s.assignment_id = a.id AND s.student_id = ?)`,
      [u.department_id, u.semester, u.id]);
    const events = await one('SELECT COUNT(*) AS n FROM events WHERE event_date >= CURDATE()');
    const myOpen = await one("SELECT COUNT(*) AS n FROM complaints WHERE student_id = ? AND status <> 'Resolved'", [u.id]);
    res.json({ attendance: att.pct, bySubject, pendingAssignments: pending.n, upcomingEvents: events.n, openComplaints: myOpen.n });
  } catch (e) { next(e); }
});

module.exports = router;
