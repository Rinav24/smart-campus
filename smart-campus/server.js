// Entry point of the backend. Run with:  npm start
require('dotenv').config();
const path = require('path');
const express = require('express');
const session = require('express-session');
const { requireLogin } = require('./middleware/auth');

const app = express();

app.use(express.json());
app.use(session({
  secret: process.env.SESSION_SECRET || 'dev_secret_change_me',
  resave: false,
  saveUninitialized: false,
  cookie: { httpOnly: true, maxAge: 1000 * 60 * 60 * 8 } // stay logged in for 8 hours
}));

// Serve the frontend files (HTML, CSS, JS) from the "public" folder.
app.use(express.static(path.join(__dirname, 'public')));

// Public routes (no login needed)
app.use('/api/auth', require('./routes/auth'));

// Private routes (login needed; each file also checks roles)
app.use('/api/users', requireLogin, require('./routes/users'));
app.use('/api/departments', requireLogin, require('./routes/departments'));
app.use('/api/attendance', requireLogin, require('./routes/attendance'));
app.use('/api/assignments', requireLogin, require('./routes/assignments'));
app.use('/api/notices', requireLogin, require('./routes/notices'));
app.use('/api/events', requireLogin, require('./routes/events'));
app.use('/api/complaints', requireLogin, require('./routes/complaints'));
app.use('/api/lostfound', requireLogin, require('./routes/lostfound'));
app.use('/api/stats', requireLogin, require('./routes/stats'));

// Unknown API URL
app.use('/api', (req, res) => res.status(404).json({ error: 'API route not found.' }));

// Last-resort error handler so the server never crashes on a bad request.
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'Something went wrong on the server.' });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Smart Campus running at http://localhost:${PORT}`));
