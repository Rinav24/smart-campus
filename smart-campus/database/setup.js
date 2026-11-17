// Creates the database + tables, then inserts realistic sample data.
// Run with:  npm run setup      (safe to re-run: it RESETS the database)
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');
const bcrypt = require('bcryptjs');

function daysFromNow(n) {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}

async function main() {
  const cloud = process.env.DB_SSL === 'true';   // true when using an online database
  const dbName = process.env.DB_NAME || 'smart_campus';

  const conn = await mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    port: Number(process.env.DB_PORT) || 3306,
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    ssl: cloud ? { minVersion: 'TLSv1.2', rejectUnauthorized: true } : undefined,
    database: cloud ? dbName : undefined   // online databases already exist; we only add tables
  });

  console.log('Creating database and tables...');
  // Split schema.sql into single statements and run them one by one.
  let statements = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8')
    .replace(/^\s*--.*$/gm, '')
    .split(';').map(x => x.trim()).filter(Boolean);

  if (cloud) {
    // On an online database: do not create/drop the database itself, only reset the tables.
    statements = statements.filter(x => !/^(DROP DATABASE|CREATE DATABASE|USE)\b/i.test(x));
    const tables = ['submissions', 'assignments', 'attendance', 'complaints', 'lost_found', 'notices', 'events', 'users', 'departments'];
    statements = tables.map(t => `DROP TABLE IF EXISTS ${t}`).concat(statements);
  }
  for (const st of statements) await conn.query(st);
  if (!cloud) await conn.query('USE smart_campus');

  const run = (sql, params) => conn.query(sql, params);

  // Departments
  await run('INSERT INTO departments (name, code) VALUES ?', [[
    ['Computer Science & Engineering', 'CSE'],
    ['Electronics & Communication', 'ECE'],
    ['Mechanical Engineering', 'ME'],
    ['Civil Engineering', 'CE']
  ]]);

  // Users (every demo password is "password123" - stored hashed, never as plain text)
  const hash = await bcrypt.hash('password123', 10);
  await run(
    'INSERT INTO users (name,email,password_hash,role,department_id,roll_no,semester,phone) VALUES ?',
    [[
      ['Campus Admin', 'admin@campus.edu', hash, 'admin', null, 'ADM001', null, '9000000001'],
      ['Dr. Meera Sharma', 'meera@campus.edu', hash, 'faculty', 1, 'FAC101', null, '9000000002'],
      ['Prof. Rajesh Verma', 'rajesh@campus.edu', hash, 'faculty', 1, 'FAC102', null, '9000000003'],
      ['Aarav Singh', 'aarav@campus.edu', hash, 'student', 1, 'CSE2301', 5, '9810000001'],
      ['Diya Patel', 'diya@campus.edu', hash, 'student', 1, 'CSE2302', 5, '9810000002'],
      ['Rohan Gupta', 'rohan@campus.edu', hash, 'student', 1, 'CSE2303', 5, '9810000003'],
      ['Ananya Rawat', 'ananya@campus.edu', hash, 'student', 1, 'CSE2304', 5, '9810000004'],
      ['Kabir Joshi', 'kabir@campus.edu', hash, 'student', 2, 'ECE2301', 3, '9810000005']
    ]]
  );
  // ids: admin=1, meera=2, rajesh=3, aarav=4, diya=5, rohan=6, ananya=7, kabir=8

  // Attendance for the last 10 days (weekdays) for 4 CSE students
  const subjects = [['Data Structures', 2], ['Database Systems', 3]];
  const rows = [];
  for (let i = 12; i >= 1; i--) {
    const date = daysFromNow(-i);
    const dow = new Date(date).getDay();
    if (dow === 0 || dow === 6) continue;
    subjects.forEach(([sub, fac]) => {
      [4, 5, 6, 7].forEach(stu => {
        // simple pattern so percentages look realistic and different per student
        const absent = (stu === 6 && (i % 3 === 0)) || (stu === 7 && (i % 2 === 0)) || (stu === 5 && i % 7 === 0);
        rows.push([stu, fac, sub, date, absent ? 'Absent' : 'Present']);
      });
    });
  }
  await run('INSERT INTO attendance (student_id,faculty_id,subject,date,status) VALUES ?', [rows]);

  // Assignments
  await run('INSERT INTO assignments (title,description,subject,department_id,semester,deadline,faculty_id) VALUES ?', [[
    ['Binary Tree Traversals', 'Implement inorder, preorder and postorder traversal in C++ and explain the time complexity.', 'Data Structures', 1, 5, daysFromNow(6), 2],
    ['ER Diagram for Library System', 'Draw an ER diagram and convert it to relational tables up to 3NF.', 'Database Systems', 1, 5, daysFromNow(10), 3],
    ['Sorting Algorithms Report', 'Compare bubble, merge and quick sort with examples.', 'Data Structures', 1, 5, daysFromNow(-3), 2]
  ]]);
  await run('INSERT INTO submissions (assignment_id,student_id,answer_text,file_link,status,marks,feedback) VALUES ?', [[
    [3, 4, 'Report attached with timing comparison table.', 'https://drive.google.com/example-report', 'Reviewed', 18, 'Good comparison. Add space complexity next time.'],
    [3, 5, 'Submitted comparison with code samples.', '', 'Late', null, null],
    [1, 4, 'Code written and tested on sample trees.', '', 'Submitted', null, null]
  ]]);

  // Notices
  await run('INSERT INTO notices (title,content,category,posted_by) VALUES ?', [[
    ['Mid-Semester Exam Schedule Released', 'Mid-semester exams begin from the first week of next month. The detailed timetable is available at the examination cell.', 'Exam', 1],
    ['Campus Placement Drive - TCS & Infosys', 'Final-year students must register with the placement cell before Friday. Carry an updated resume.', 'Placement', 1],
    ['Data Structures Extra Class', 'An extra revision class will be held on Saturday at 10 AM in Room 204.', 'Academic', 2],
    ['Diwali Holidays', 'The campus will remain closed for Diwali. Classes resume after the break.', 'Holiday', 1]
  ]]);

  // Events
  await run('INSERT INTO events (title,description,event_date,location,created_by) VALUES ?', [[
    ['Annual Tech Fest - TechNova', 'Coding contests, robotics demos and project exhibitions.', daysFromNow(14), 'Main Auditorium', 1],
    ['Guest Lecture: Cloud Computing', 'Industry expert session on cloud careers and certifications.', daysFromNow(5), 'Seminar Hall B', 2],
    ['Inter-College Cricket Tournament', 'Teams from 8 colleges will compete.', daysFromNow(21), 'Sports Ground', 1],
    ['Blood Donation Camp', 'Organised with the NSS unit and a local hospital.', daysFromNow(9), 'Health Centre', 1]
  ]]);

  // Complaints
  await run('INSERT INTO complaints (complaint_code,student_id,subject,description,status,response,created_at) VALUES ?', [[
    ['CMP-2026-0001', 4, 'Projector not working in Room 204', 'The projector in Room 204 has not worked for the last 3 days.', 'In Progress', 'Technician has been informed.', daysFromNow(-2)],
    ['CMP-2026-0002', 5, 'Library AC not working', 'The AC in the reading hall is not cooling.', 'Pending', null, daysFromNow(-1)],
    ['CMP-2026-0003', 6, 'Wi-Fi slow in hostel block C', 'Internet speed is very slow in the evenings.', 'Resolved', 'Router replaced on Monday.', daysFromNow(-8)]
  ]]);

  // Lost & found
  await run('INSERT INTO lost_found (type,item_name,description,location,item_date,contact,status,reported_by) VALUES ?', [[
    ['Lost', 'Black Wallet', 'Black leather wallet with student ID card inside.', 'Canteen', daysFromNow(-2), '9810000002', 'Open', 5],
    ['Found', 'Blue Water Bottle', 'Steel bottle with a sticker on it.', 'Library', daysFromNow(-1), '9810000003', 'Open', 6],
    ['Lost', 'Scientific Calculator', 'Casio fx-991EX, name written on the back.', 'Room 204', daysFromNow(-5), '9810000001', 'Returned', 4]
  ]]);

  console.log('\nDone! Database "smart_campus" is ready with sample data.');
  console.log('Demo logins (password for all: password123):');
  console.log('  Admin   : admin@campus.edu');
  console.log('  Faculty : meera@campus.edu');
  console.log('  Student : aarav@campus.edu');
  await conn.end();
}

main().catch(err => {
  console.error('\nSetup failed:', err.message);
  console.error('Check that MySQL is running and your .env password is correct.');
  process.exit(1);
});
