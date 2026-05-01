# CLI TODO App - Tiny Project Plan

## Project Overview
- **Name**: cli-todo
- **Type**: Command-line tool
- **Core functionality**: Add and list tasks persisted to a local JSON file
- **Target users**: Developers or anyone needing a simple CLI task manager

## Technology Stack
- Language: Python 3
- Storage: Local JSON file (`tasks.json`)
- No external dependencies (standard library only)

## Features (MVP - First Increment)
1. **Add task**: Add a new task with description
2. **List tasks**: Display all tasks with their status

## CLI Interface
```
python todo.py add "Buy groceries"
python todo.py list
```

## Data Model
```json
{
  "tasks": [
    {"id": 1, "description": "Buy groceries", "done": false}
  ]
}
```

## File Structure
```
tmp-engineer-sim/
├── todo.py          # Main CLI entry point
├── tasks.json       # Data file (auto-created)
├── README.md        # Basic documentation
└── tests/
    └── test_todo.py # Basic tests
```

## Acceptance Criteria
- [ ] `python todo.py add "Task name"` creates a task in tasks.json
- [ ] `python todo.py list` displays all tasks
- [ ] Tasks persist across CLI invocations
- [ ] Basic test coverage for core functions