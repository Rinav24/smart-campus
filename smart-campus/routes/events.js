const express = require('express');
const db = require('../config/db');
const { requireRole } = require('../middleware/auth');
const router = express.Router();

// Everyone: upcoming events first, then past ones. ?upcoming=1 returns only upcoming.
router.get('/', async (req, res, next) => {
  try {
    const where = req.query.upcoming ? 'WHERE e.event_date >= CURDATE()' : '';
    const [rows] = await db.query(
      `SELECT e.id,e.title,e.description,e.event_date,e.location,e.created_by,u.name AS organiser,
              (e.event_date >= CURDATE()) AS is_upcoming
       FROM events e JOIN users u ON u.id = e.created_by ${where}
       ORDER BY is_upcoming DESC, CASE WHEN e.event_date >= CURDATE() THEN e.event_date END ASC, e.event_date DESC`);
    res.json(rows);
  } catch (e) { next(e); }
});

router.post('/', requireRole('faculty', 'admin'), async (req, res, next) => {
  try {
    const { title, description, event_date, location } = req.body;
    if (!title || !location || !/^\d{4}-\d{2}-\d{2}$/.test(event_date || '')) {
      return res.status(400).json({ error: 'Title, date and location are required.' });
    }
    await db.query('INSERT INTO events (title,description,event_date,location,created_by) VALUES (?,?,?,?,?)',
      [title.trim(), description || '', event_date, location.trim(), req.session.user.id]);
    res.status(201).json({ message: 'Event added.' });
  } catch (e) { next(e); }
});

router.delete('/:id', requireRole('admin'), async (req, res, next) => {
  try {
    await db.query('DELETE FROM events WHERE id = ?', [req.params.id]);
    res.json({ message: 'Event deleted.' });
  } catch (e) { next(e); }
});

module.exports = router;
