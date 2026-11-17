-- Smart Campus Management System - database design
-- Run automatically by:  npm run setup
DROP DATABASE IF EXISTS smart_campus;
CREATE DATABASE smart_campus CHARACTER SET utf8mb4;
USE smart_campus;

-- 1) Departments (CSE, ECE ...)
CREATE TABLE departments (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(100) NOT NULL UNIQUE,
  code VARCHAR(10) NOT NULL UNIQUE
);

-- 2) Users: students, faculty and admins live in ONE table, separated by "role".
CREATE TABLE users (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  email VARCHAR(150) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  role ENUM('student','faculty','admin') NOT NULL,
  department_id INT NULL,
  roll_no VARCHAR(30) NULL,          -- roll number (student) or employee id (faculty)
  semester TINYINT NULL,             -- students only
  phone VARCHAR(20) NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (department_id) REFERENCES departments(id) ON DELETE SET NULL
);

-- 3) Attendance: one row per student, per subject, per day.
CREATE TABLE attendance (
  id INT AUTO_INCREMENT PRIMARY KEY,
  student_id INT NOT NULL,
  faculty_id INT NOT NULL,
  subject VARCHAR(100) NOT NULL,
  date DATE NOT NULL,
  status ENUM('Present','Absent') NOT NULL,
  UNIQUE KEY one_per_day (student_id, subject, date),
  FOREIGN KEY (student_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (faculty_id) REFERENCES users(id) ON DELETE CASCADE
);

-- 4) Assignments created by faculty for a department + semester
CREATE TABLE assignments (
  id INT AUTO_INCREMENT PRIMARY KEY,
  title VARCHAR(150) NOT NULL,
  description TEXT,
  subject VARCHAR(100) NOT NULL,
  department_id INT NOT NULL,
  semester TINYINT NOT NULL,
  deadline DATE NOT NULL,
  faculty_id INT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (department_id) REFERENCES departments(id) ON DELETE CASCADE,
  FOREIGN KEY (faculty_id) REFERENCES users(id) ON DELETE CASCADE
);

-- 5) Submissions: a student's answer to an assignment
CREATE TABLE submissions (
  id INT AUTO_INCREMENT PRIMARY KEY,
  assignment_id INT NOT NULL,
  student_id INT NOT NULL,
  answer_text TEXT,
  file_link VARCHAR(500),
  status ENUM('Submitted','Late','Reviewed') NOT NULL DEFAULT 'Submitted',
  marks INT NULL,
  feedback VARCHAR(500) NULL,
  submitted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY one_submission (assignment_id, student_id),
  FOREIGN KEY (assignment_id) REFERENCES assignments(id) ON DELETE CASCADE,
  FOREIGN KEY (student_id) REFERENCES users(id) ON DELETE CASCADE
);

-- 6) Notices
CREATE TABLE notices (
  id INT AUTO_INCREMENT PRIMARY KEY,
  title VARCHAR(150) NOT NULL,
  content TEXT NOT NULL,
  category ENUM('General','Academic','Exam','Placement','Holiday') NOT NULL DEFAULT 'General',
  posted_by INT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (posted_by) REFERENCES users(id) ON DELETE CASCADE
);

-- 7) Events
CREATE TABLE events (
  id INT AUTO_INCREMENT PRIMARY KEY,
  title VARCHAR(150) NOT NULL,
  description TEXT,
  event_date DATE NOT NULL,
  location VARCHAR(150) NOT NULL,
  created_by INT NOT NULL,
  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE CASCADE
);

-- 8) Complaints
CREATE TABLE complaints (
  id INT AUTO_INCREMENT PRIMARY KEY,
  complaint_code VARCHAR(20) UNIQUE,   -- like CMP-2026-0001
  student_id INT NOT NULL,
  subject VARCHAR(150) NOT NULL,
  description TEXT NOT NULL,
  status ENUM('Pending','In Progress','Resolved') NOT NULL DEFAULT 'Pending',
  response VARCHAR(500) NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (student_id) REFERENCES users(id) ON DELETE CASCADE
);

-- 9) Lost and found items
CREATE TABLE lost_found (
  id INT AUTO_INCREMENT PRIMARY KEY,
  type ENUM('Lost','Found') NOT NULL,
  item_name VARCHAR(100) NOT NULL,
  description TEXT,
  location VARCHAR(150) NOT NULL,
  item_date DATE NOT NULL,
  contact VARCHAR(100) NOT NULL,
  status ENUM('Open','Claimed','Returned') NOT NULL DEFAULT 'Open',
  reported_by INT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (reported_by) REFERENCES users(id) ON DELETE CASCADE
);
