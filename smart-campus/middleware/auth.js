// Middleware = a function that runs BEFORE a route. These protect private routes.

// Only logged-in users can pass.
function requireLogin(req, res, next) {
  if (!req.session.user) {
    return res.status(401).json({ error: 'Please log in first.' });
  }
  next();
}

// Only users with one of the given roles can pass.
// Example: requireRole('admin', 'faculty')
function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.session.user) {
      return res.status(401).json({ error: 'Please log in first.' });
    }
    if (!roles.includes(req.session.user.role)) {
      return res.status(403).json({ error: 'You do not have permission to do this.' });
    }
    next();
  };
}

module.exports = { requireLogin, requireRole };
