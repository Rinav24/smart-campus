const express = require('express');
const db = require('../config/db');
const router = express.Router();

// Everyone sees all reported items. Optional ?type=Lost|Found
router.get('/', async (req, res, next) => {
  try {
    const params = [];
    let where = '';
    if (['Lost', 'Found'].includes(req.query.type)) { where = 'WHERE l.type = ?'; params.push(req.query.type); }
    const [rows] = await db.query(
      `SELECT l.*, u.name AS reporter FROM lost_found l JOIN users u ON u.id = l.reported_by
       ${where} ORDER BY l.created_at DESC`, params);
    res.json(rows);
  } catch (e) { next(e); }
});

// Any logged-in user can report an item
router.post('/', async (req, res, next) => {
  try {
    const { type, item_name, description, location, item_date, contact } = req.body;
    if (!['Lost', 'Found'].includes(type)) return res.status(400).json({ error: 'Choose Lost or Found.' });
    if (!item_name || !location || !contact || !/^\d{4}-\d{2}-\d{2}$/.test(item_date || '')) {
      return res.status(400).json({ error: 'Item name, place, date and contact are required.' });
    }
    await db.query(
      'INSERT INTO lost_found (type,item_name,description,location,item_date,contact,reported_by) VALUES (?,?,?,?,?,?,?)',
      [type, item_name.trim(), description || '', location.trim(), item_date, contact.trim(), req.session.user.id]);
    res.status(201).json({ message: 'Item reported.' });
  } catch (e) { next(e); }
});

// The reporter, faculty or admin can update the status.
router.put('/:id/status', async (req, res, next) => {
  try {
    const { status } = req.body;
    if (!['Open', 'Claimed', 'Returned'].includes(status)) return res.status(400).json({ error: 'Invalid status.' });
    const u = req.session.user;
    const [[item]] = await db.query('SELECT reported_by FROM lost_found WHERE id = ?', [req.params.id]);
    if (!item) return res.status(404).json({ error: 'Item not found.' });
    if (u.role === 'student' && item.reported_by !== u.id) return res.status(403).json({ error: 'Only the person who reported it can change it.' });
    await db.query('UPDATE lost_found SET status = ? WHERE id = ?', [status, req.params.id]);
    res.json({ message: 'Status updated.' });
  } catch (e) { next(e); }
});

router.delete('/:id', async (req, res, next) => {
  try {
    const u = req.session.user;
    const [r] = u.role === 'admin'
      ? await db.query('DELETE FROM lost_found WHERE id = ?', [req.params.id])
      : await db.query('DELETE FROM lost_found WHERE id = ? AND reported_by = ?', [req.params.id, u.id]);
    if (!r.affectedRows) return res.status(404).json({ error: 'Item not found or not yours.' });
    res.json({ message: 'Item removed.' });
  } catch (e) { next(e); }
});

module.exports = router;
