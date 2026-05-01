# CLI TODO App

A simple command-line TODO application written in Python.

## Features

- Add tasks
- List tasks
- Persists to local JSON file

## Usage

```bash
# Add a task
python todo.py add "Buy groceries"

# List all tasks
python todo.py list
```

## Testing

```bash
python -m pytest tests/
# or
python -m unittest tests.test_todo
```