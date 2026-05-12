---
name: app-verifier
description: Verify generated internal tools by driving the UI with Playwright and confirming persistence. Use this skill after an internal tool app has been generated to prove the app works end-to-end — actions persist to the database and appear in views.
version: 1.0.0
tags: [verification, playwright, e2e, testing]
permissions: allow
---

# App Verifier Skill

You are responsible for verifying that generated internal tools work correctly. You drive the UI with Playwright and confirm that data persists from user actions through to the database.

## Verification Protocol

### Prerequisites
- The app is generated and files exist
- Backend is running on port 8000
- Frontend is running on port 5173
- Playwright is installed (`npx playwright install chromium`)

### Step 1: Verify Server Health

```bash
curl -s http://localhost:8000/health || curl -s http://localhost:8000/
curl -s http://localhost:5173/ | head -20
```

### Step 2: Run Playwright Verification Script

Create and execute a verification script at `<app-dir>/verify.js`:

```javascript
const { chromium } = require('playwright');

async function verify() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  try {
    // Navigate to employee view
    await page.goto('http://localhost:5173');
    console.log('Page loaded');

    // Perform employee action (e.g., check-in)
    // Fill form, click button
    await page.fill('input[name="employee_name"]', 'Test Employee');
    await page.fill('select[name="desk_id"]', 'Desk-A');
    await page.click('button[type="submit"]');
    console.log('Check-in submitted');

    // Wait for confirmation
    await page.waitForSelector('.success, .confirmation, text=Success', { timeout: 5000 });
    console.log('Confirmation received');

    // Navigate to manager view
    await page.goto('http://localhost:5173/#manager');
    console.log('Manager view loaded');

    // Verify data appears in summary
    const content = await page.content();
    const hasData = content.includes('Test Employee') || content.includes('Desk-A');
    console.log('Data in summary:', hasData);

    // Capture evidence
    await page.screenshot({ path: '/tmp/verify-employee.png' });
    await page.screenshot({ path: '/tmp/verify-manager.png' });

    return {
      success: hasData,
      screenshots: ['/tmp/verify-employee.png', '/tmp/verify-manager.png']
    };
  } finally {
    await browser.close();
  }
}

verify().then(console.log).catch(console.error);
```

### Step 3: Verify Database Persistence

After UI verification, directly query the SQLite database:

```bash
sqlite3 <app-dir>/backend/checkins.db "SELECT * FROM check_ins LIMIT 5;"
```

### Step 4: Report Results

Provide verification evidence:
1. Server health check results
2. Playwright test output (success/failure)
3. Screenshots captured
4. Database query showing persisted records
5. Overall verdict: PASS or FAIL

## What to Check

### Employee View
- [ ] Page loads without errors
- [ ] Form renders correctly on mobile viewport
- [ ] Input fields accept values
- [ ] Submit button triggers action
- [ ] Confirmation message appears after action
- [ ] Error handling works for invalid input

### Manager View
- [ ] Dashboard/summary loads
- [ ] Data from employee action appears
- [ ] Weekly/date filters work
- [ ] Data refreshes after new action

### Database
- [ ] Record created after employee action
- [ ] Record contains correct data
- [ ] Timestamps are reasonable

## Common Issues

### App Not Running
If servers aren't running, start them:
```bash
cd <app-dir>/backend && python -m uvicorn main:app --reload --port 8000 &
cd <app-dir>/frontend && npm run dev &
sleep 5
```

### Playwright Not Installed
```bash
npx playwright install chromium
```

### Database Locked
Use `PRAGMA journal_mode=WAL;` or ensure single writer access

## Output Format

```markdown
## Verification Results

### Server Health
- Backend (port 8000): ✓ Running
- Frontend (port 5173): ✓ Running

### UI Verification
- Employee check-in form: ✓ PASS
- Check-in submission: ✓ PASS
- Confirmation display: ✓ PASS
- Manager view: ✓ PASS
- Data in summary: ✓ PASS

### Database Verification
- Record persisted: ✓ PASS
- Data integrity: ✓ PASS

### Evidence
- Screenshot (employee): [link]
- Screenshot (manager): [link]
- DB query output: [link]

## Overall Verdict: ✅ PASS (or ❌ FAIL)
```

## Important Notes

1. Always verify persistence — UI success doesn't guarantee DB write
2. Test both happy path and error cases
3. Capture screenshots for documentation
4. Query DB directly as authoritative proof
5. Report exact errors if verification fails
