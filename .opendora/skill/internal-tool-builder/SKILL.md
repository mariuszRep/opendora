---
name: internal-tool-builder
description: Build mobile-friendly web apps for internal tools (React + FastAPI + SQLite). Use this skill when a user requests a simple internal tool like "desk check-in", "expense tracker", or "shift scheduler". Generates runnable local apps with employee-facing and manager-facing views.
version: 1.0.0
tags: [app-generation, internal-tools, react, fastapi, sqlite]
permissions: allow
---

# Internal Tool Builder Skill

You are an expert at building internal web applications from natural language requests. Your job is to transform a simple description into a complete, runnable local application.

## Your Task

When given a request like "Create a mobile-friendly web app where employees can check in to a desk and I can see a weekly summary", you will:

1. **Analyze the request** to identify:
   - Primary actors (employee, manager, admin)
   - Core actions (check-in, view summary, manage)
   - Data entities (check-ins, desks, users, dates)
   - Views needed (employee UI, manager UI)

2. **Generate a complete project** with:
   - FastAPI backend (Python) with SQLite persistence
   - React frontend (Vite) with mobile-friendly UI
   - Clear separation between employee and manager views

3. **Verify the app works** by running it and using Playwright to confirm persistence

## Project Structure

For any generated internal tool, create this structure in a standalone project directory outside of OpenDora (e.g., `/home/mariu/projects/<app-name>/`):

```
<app-name>/
├── backend/
│   ├── main.py           # FastAPI app with all routes
│   ├── models.py         # Pydantic models
│   ├── database.py       # SQLite setup and operations
│   ├── requirements.txt  # Python dependencies
│   └── init_db.py        # Database initialization
├── frontend/
│   ├── src/
│   │   ├── App.tsx       # Main app with routing
│   │   ├── components/   # Reusable UI components
│   │   ├── pages/       # Page components
│   │   ├── api.ts        # API client
│   │   └── styles.css    # Global styles
│   ├── index.html
│   ├── package.json
│   ├── vite.config.ts
│   └── tsconfig.json
├── README.md
└── run.sh                # Startup script
```

**Important**: Generated apps are standalone projects, not integrated into the OpenDora repository.

## Tech Stack Constraints

- **Backend**: Python 3.11+, FastAPI, uvicorn, aiosqlite
- **Frontend**: React 18+, TypeScript, Vite, plain CSS (no Tailwind)
- **Database**: SQLite (single file, auto-created)
- **Styling**: Mobile-first, responsive CSS with flexbox/grid

## Code Generation Rules

### Backend (main.py)

```python
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from datetime import datetime, date
from typing import Optional
import aiosqlite
import os

app = FastAPI(title="<App Name>")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# All models, database operations, and routes inline
# Use aiosqlite for async SQLite access
# Include GET, POST, PUT, DELETE as needed
```

### Frontend (App.tsx)

```typescript
import { useState, useEffect } from 'react'
// Simple hash-based routing or conditional rendering
// Mobile-first responsive design
// Clear sections for each actor (employee, manager)
```

### Database Schema

```sql
CREATE TABLE IF NOT EXISTS <entity> (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    -- fields
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

## Required Views

### Employee View
- Simple form for primary action (e.g., check-in)
- Confirmation of successful action
- Option to view own history (optional)

### Manager View
- Summary/dashboard with aggregated data
- Weekly view with date range selector
- Clear data visualization (table or cards)

## Verification Protocol

After generating the app, you MUST verify it:

1. **Start the backend**: `cd backend && python -m uvicorn main:app --reload --port 8000`
2. **Start the frontend**: `cd frontend && npm install && npm run dev`
3. **Run Playwright verification**:
   - Open http://localhost:5173
   - Perform the employee action (e.g., click check-in)
   - Navigate to manager view
   - Verify data appears in summary
   - Query the SQLite DB directly to confirm persistence

4. **Capture evidence**: Screenshots or terminal output showing:
   - App starts successfully
   - Check-in action completes
   - Manager view shows data
   - Database contains the record

## Example: HR Office Days App

For "Create a mobile-friendly web app where employees can check in to a desk and I can see a weekly summary":

### Database Schema
```sql
CREATE TABLE check_ins (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    employee_name TEXT NOT NULL,
    desk_id TEXT NOT NULL,
    check_in_date DATE NOT NULL,
    check_in_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

### Employee View
- Form with: employee name input, desk selector, check-in button
- Success message after check-in
- View to see own check-ins (optional)

### Manager View
- Table showing check-ins grouped by day
- Date range selector for weekly view
- Totals per day and per desk

## Output

When complete, provide:
1. Path to generated standalone project (outside OpenDora)
2. How to run it (commands)
3. Verification evidence (screenshots or DB query results)
4. Notes on which parts are reusable patterns vs scenario-specific

**Note**: Do not place generated app code inside the OpenDora repository. Keep it as a separate standalone project.
