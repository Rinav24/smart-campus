# Smart Campus Management System

A web portal for a college campus with three roles (Student, Faculty, Admin).
Built with **HTML, CSS, JavaScript, Bootstrap 5** (frontend), **Node.js + Express** (backend) and **MySQL** (database).

## 1. Install these first (one time)
1. **Node.js (LTS)** from https://nodejs.org  - check with `node -v`
2. **MySQL Community Server** from https://dev.mysql.com/downloads/mysql/ - remember the **root password** you set
3. **VS Code** from https://code.visualstudio.com

## 2. Set up the project
Open this folder in VS Code, then open the terminal (Ctrl + `) and run:

```bash
npm install
```

Create a file named `.env` (copy `.env.example`) and put your MySQL password in it:

```
PORT=3000
DB_HOST=localhost
DB_USER=root
DB_PASSWORD=your_mysql_password_here
DB_NAME=smart_campus
SESSION_SECRET=any_long_random_text
```

Create the database, tables and sample data:

```bash
npm run setup
```

Start the server:

```bash
npm start
```

Open http://localhost:3000 in your browser.

## 3. Demo logins (password for all: `password123`)
| Role    | Email              |
|---------|--------------------|
| Admin   | admin@campus.edu   |
| Faculty | meera@campus.edu   |
| Student | aarav@campus.edu   |

More students: diya@, rohan@, ananya@ (CSE) and kabir@ (ECE), all `@campus.edu`.
New students can also register from the Register page.

## 4. Folder structure
```
smart-campus/
├── server.js              starts Express, sessions, connects routes
├── package.json           project info + dependencies
├── .env.example           sample settings (copy to .env)
├── config/db.js           MySQL connection pool
├── middleware/auth.js     requireLogin + requireRole (protects routes)
├── routes/                one file per module (the backend API)
│   ├── auth.js  users.js  departments.js  attendance.js
│   ├── assignments.js  notices.js  events.js
│   └── complaints.js  lostfound.js  stats.js
├── database/
│   ├── schema.sql         CREATE TABLE statements
│   └── setup.js           runs schema.sql + inserts sample data
└── public/                the frontend (served by Express)
    ├── login.html  register.html  dashboard.html  index.html
    ├── css/style.css
    └── js/app.js          all dashboard pages (role-based)
```

## 5. How the three parts talk to each other
```
Browser (HTML/CSS/JS)  --fetch('/api/...')-->  Express routes  --SQL-->  MySQL
        <-- JSON data --                          <-- rows --
```
1. You click something in the browser. `js/app.js` calls `fetch('/api/attendance/my')`.
2. Express receives it. `middleware/auth.js` checks you are logged in and have the right role.
3. The route file runs a parameterized SQL query using `config/db.js`.
4. MySQL returns rows, Express sends them back as JSON, and the page draws them.

## 6. Database tables
`departments`, `users` (role = student / faculty / admin), `attendance`, `assignments`,
`submissions`, `notices`, `events`, `complaints`, `lost_found`.
Foreign keys: users.department_id -> departments.id, attendance.student_id -> users.id,
assignments.faculty_id -> users.id, submissions.assignment_id -> assignments.id,
submissions.student_id -> users.id, complaints.student_id -> users.id, and so on.

## 7. Security features
- Passwords are hashed with bcrypt (`bcryptjs`); plain text is never stored.
- Sessions use an HTTP-only cookie.
- Every private route checks login, and role-specific routes check the role (a student cannot call faculty/admin APIs).
- All SQL uses `?` placeholders (parameterized queries) to stop SQL injection.
- All text shown in the page is escaped to stop XSS.
- Inputs are validated on the server.

## 8. Who can do what
| Feature | Student | Faculty | Admin |
|---|---|---|---|
| Register / login | yes | login | login |
| Mark attendance | view own | mark | view reports |
| Assignments | submit | create, review, mark | view, delete |
| Notices | read | publish | publish, delete any |
| Events | view | add | add, delete |
| Complaints | submit, track | update status | update status |
| Lost & found | report, update own | report, update | report, delete any |
| Users, departments | - | view students | full control |

## 9. Common problems
- **`Setup failed: Access denied`** - the password in `.env` is wrong.
- **`ECONNREFUSED`** - MySQL is not running. Start the MySQL service.
- **`EADDRINUSE`** - port 3000 is busy. Change `PORT` in `.env`.
- **Page looks unstyled** - Bootstrap loads from a CDN, so you need internet.
- Re-running `npm run setup` **resets** the database to the sample data.
