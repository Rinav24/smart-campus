// Creates ONE shared connection pool to MySQL.
// A "pool" keeps a few connections open so every request does not have to reconnect.
// Works on your laptop (local MySQL) AND on a cloud database (set DB_SSL=true).
require('dotenv').config();
const mysql = require('mysql2/promise');

const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  port: Number(process.env.DB_PORT) || 3306,
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'smart_campus',
  // Cloud databases need an encrypted (TLS) connection.
  ssl: process.env.DB_SSL === 'true' ? { minVersion: 'TLSv1.2', rejectUnauthorized: true } : undefined,
  waitForConnections: true,
  connectionLimit: 10,
  dateStrings: true // return DATE columns as plain text like "2026-11-15"
});

module.exports = pool;
