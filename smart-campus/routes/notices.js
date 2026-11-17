const express = require('express');
const db = require('../config/db');
const { requireRole } = require('../middleware/auth');
const router = express.Router();
const CATEGORIES = ['General', 'Academic', 'Exam', 'Placement', 'Holiday'];

// Everyone can read. Optional ?category=
router.get('/', async (req, res, next) => {
  try {
    const params = [];
    let where = '';
    if (CATEGORIES.includes(req.query.category)) { where = 'WHERE n.category = ?'; params.push(req.query.category); }
    const [rows] = await db.query(
      `SELECT n.id,n.title,n.content,n.category,n.created_at,n.posted_by,u.name AS author,u.role AS author_role
       FROM notices n JOIN users u ON u.id = n.posted_by ${where} ORDER BY n.created_at DESC`, params);
    res.json(rows);
  } catch (e) { next(e); }
});

router.post('/', requireRole('faculty', 'admin'), async (req, res, next) => {
  try {
    const { title, content, category } = req.body;
    if (!title || !title.trim() || !content || !content.trim()) return res.status(400).json({ error: 'Title and content are required.' });
    if (!CATEGORIES.includes(category)) return res.status(400).json({ error: 'Choose a valid category.' });
    await db.query('INSERT INTO notices (title,content,category,posted_by) VALUES (?,?,?,?)',
      [title.trim(), content.trim(), category, req.session.user.id]);
    res.status(201).json({ message: 'Notice published.' });
  } catch (e) { next(e); }
});

// Admin can delete any notice; faculty only their own.
router.delete('/:id', requireRole('faculty', 'admin'), async (req, res, next) => {
  try {
    const u = req.session.user;
    const [r] = u.role === 'admin'
      ? await db.query('DELETE FROM notices WHERE id = ?', [req.params.id])
      : await db.query('DELETE FROM notices WHERE id = ? AND posted_by = ?', [req.params.id, u.id]);
    if (!r.affectedRows) return res.status(404).json({ error: 'Notice not found or not yours.' });
    res.json({ message: 'Notice deleted.' });
  } catch (e) { next(e); }
});

module.exports = router;
