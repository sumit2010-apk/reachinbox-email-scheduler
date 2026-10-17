# ReachInbox — Email Scheduler

A full-stack email scheduling application built with React, TypeScript, Node.js, Express, PostgreSQL, Redis, and BullMQ. The project is designed to schedule email deliveries, process background jobs, and track email delivery status.

## Features

- **Email scheduling:** Create email jobs with recipient, subject, body, and scheduled delivery time.
- **Background processing:** Use BullMQ and Redis to manage scheduled email jobs.
- **Persistent storage:** Store email records and delivery state in PostgreSQL.
- **Reliable processing:** Support job retries, exponential backoff, and failure handling.
- **Idempotent requests:** Support an `Idempotency-Key` on email creation requests.
- **Email delivery:** Use Nodemailer with SMTP configuration, including Ethereal Email for development.
- **Bulk recipient workflow:** Import recipients and schedule emails through the frontend.
- **Containerized infrastructure:** Run PostgreSQL and Redis with Docker Compose.
- **React dashboard:** A TypeScript-based frontend built with Vite.

## Tech Stack

| Layer | Technologies |
|---|---|
| Frontend | React, TypeScript, Vite |
| Backend | Node.js, Express, TypeScript |
| Database | PostgreSQL |
| Queue | BullMQ, Redis |
| Email | Nodemailer, SMTP |
| Infrastructure | Docker Compose |

## Project Structure

```text
reachinbox-scheduler/
├── backend/             # API, email processing and database logic
├── frontend/            # React application
├── docker-compose.yml   # Local infrastructure
├── .gitignore
└── README.md
```

## Prerequisites

Install the following before running the application:

- Node.js and npm
- Docker Desktop
- Git

## Getting Started

### 1. Clone the repository

```bash
git clone https://github.com/sumit2010-apk/reachinbox-email-scheduler.git
cd reachinbox-email-scheduler
```

### 2. Start PostgreSQL and Redis

```bash
docker compose up -d
```

### 3. Configure environment variables

Create a local `.env` file using the example file in `backend/`:

```bash
cd backend
```

Copy `backend/.env.example` to `backend/.env` using your operating system or editor, then configure the required database, Redis, SMTP, and application settings.

**Never commit real passwords, API keys, OAuth secrets, or SMTP credentials.**

### 4. Install backend dependencies

From the `backend/` directory:

```bash
npm install
```

Run the backend development command defined in `backend/package.json`.

### 5. Install frontend dependencies

Open a second terminal from the project root:

```bash
cd frontend
npm install
```

Run the frontend development command defined in `frontend/package.json`.

Use the scripts in each package's `package.json` as the source of truth for available development and build commands.

## API Overview

The backend exposes email scheduling endpoints under `/api/emails`.

| Method | Endpoint | Purpose |
|---|---|---|
| `GET` | `/api/emails` | Retrieve email records |
| `POST` | `/api/emails` | Create an email scheduling request |

Email creation can accept an `Idempotency-Key` header to help prevent duplicate submissions.

Check the backend source for the complete request schema, validation rules, and available status fields.

## Reliability Design

- BullMQ and Redis manage background email jobs.
- PostgreSQL stores email and outbox state.
- Retry and backoff policies handle delivery failures.
- Outbox processing and recovery logic help handle interrupted processing.
- Idempotency support helps reduce duplicate email scheduling.

## Development Notes

This repository is intended for local development and assignment review. Configure a valid SMTP provider before expecting emails to reach real inboxes. Ethereal Email is useful for testing because it provides previewable test messages.

External integrations should be configured with their own credentials before use. Do not assume production OAuth, Slack notifications, or external search services are active unless their configuration and implementation have been verified.

## Future Improvements

- Complete and validate OAuth integrations.
- Add delivery rate limiting and more detailed queue monitoring.
- Expand automated tests and integration coverage.
- Add deployment configuration and screenshots.

## Author

**Sumit Singh**

GitHub: [sumit2010-apk](https://github.com/sumit2010-apk)
