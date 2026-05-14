#!/usr/bin/env python3
"""Simple CLI TODO app - Add and list tasks persisted to JSON."""

import json
import os
import sys
from pathlib import Path

TASKS_FILE = Path(__file__).parent / "tasks.json"


def load_tasks():
    """Load tasks from JSON file, return empty list if file doesn't exist."""
    if not TASKS_FILE.exists():
        return []
    try:
        with open(TASKS_FILE, "r") as f:
            data = json.load(f)
            return data.get("tasks", [])
    except (json.JSONDecodeError, IOError):
        return []


def save_tasks(tasks):
    """Save tasks to JSON file."""
    with open(TASKS_FILE, "w") as f:
        json.dump({"tasks": tasks}, f, indent=2)


def add_task(description):
    """Add a new task."""
    tasks = load_tasks()
    task_id = max([t["id"] for t in tasks], default=0) + 1
    new_task = {"id": task_id, "description": description, "done": False}
    tasks.append(new_task)
    save_tasks(tasks)
    print(f"Added task #{task_id}: {description}")


def mark_done(task_id):
    """Mark a task as done."""
    tasks = load_tasks()
    task = next((t for t in tasks if t["id"] == task_id), None)
    if not task:
        print(f"Error: Task #{task_id} not found")
        return False
    task["done"] = True
    save_tasks(tasks)
    print(f"Completed task #{task_id}: {task['description']}")
    return True


def mark_uncomplete(task_id):
    """Mark a task as not done (active)."""
    tasks = load_tasks()
    task = next((t for t in tasks if t["id"] == task_id), None)
    if not task:
        print(f"Error: Task #{task_id} not found")
        return False
    task["done"] = False
    save_tasks(tasks)
    print(f"Marked task #{task_id} as active: {task['description']}")
    return True


def edit_task(task_id, new_description):
    """Edit a task's description."""
    if not new_description or not new_description.strip():
        print("Error: Task description cannot be empty")
        return False
    tasks = load_tasks()
    task = next((t for t in tasks if t["id"] == task_id), None)
    if not task:
        print(f"Error: Task #{task_id} not found")
        return False
    old_description = task["description"]
    task["description"] = new_description.strip()
    save_tasks(tasks)
    print(f"Updated task #{task_id}: '{old_description}' -> '{task['description']}'")
    return True


def delete_task(task_id):
    """Delete a task."""
    tasks = load_tasks()
    task = next((t for t in tasks if t["id"] == task_id), None)
    if not task:
        print(f"Error: Task #{task_id} not found")
        return False
    tasks = [t for t in tasks if t["id"] != task_id]
    save_tasks(tasks)
    print(f"Deleted task #{task_id}: {task['description']}")
    return True


def list_tasks():
    """List all tasks."""
    tasks = load_tasks()
    if not tasks:
        print("No tasks yet. Add one with: python todo.py add \"Your task\"")
        return

    print("Tasks:")
    for task in tasks:
        status = "[x]" if task["done"] else "[ ]"
        print(f"  {task['id']}. {status} {task['description']}")


def main():
    if len(sys.argv) < 2:
        print("Usage: python todo.py <command> [args]")
        print("Commands:")
        print("  add \"Task description\"    - Add a new task")
        print("  list                      - List all tasks")
        print("  done <id>                 - Mark a task as complete")
        print("  uncomplete <id>           - Mark a task as active")
        print("  edit <id> \"description\"  - Edit a task")
        print("  delete <id>               - Delete a task")
        sys.exit(1)

    command = sys.argv[1]

    if command == "add":
        if len(sys.argv) < 3:
            print("Error: Please provide a task description")
            sys.exit(1)
        description = sys.argv[2].strip()
        if not description:
            print("Error: Task description cannot be empty")
            sys.exit(1)
        add_task(description)
    elif command == "list":
        list_tasks()
    elif command == "done":
        if len(sys.argv) < 3:
            print("Error: Please provide a task ID")
            sys.exit(1)
        try:
            task_id = int(sys.argv[2])
        except ValueError:
            print("Error: Task ID must be a number")
            sys.exit(1)
        if not mark_done(task_id):
            sys.exit(1)
    elif command == "uncomplete":
        if len(sys.argv) < 3:
            print("Error: Please provide a task ID")
            sys.exit(1)
        try:
            task_id = int(sys.argv[2])
        except ValueError:
            print("Error: Task ID must be a number")
            sys.exit(1)
        if not mark_uncomplete(task_id):
            sys.exit(1)
    elif command == "edit":
        if len(sys.argv) < 4:
            print("Error: Please provide a task ID and new description")
            print("Usage: python todo.py edit <id> \"new description\"")
            sys.exit(1)
        try:
            task_id = int(sys.argv[2])
        except ValueError:
            print("Error: Task ID must be a number")
            sys.exit(1)
        new_description = sys.argv[3].strip()
        if not edit_task(task_id, new_description):
            sys.exit(1)
    elif command == "delete":
        if len(sys.argv) < 3:
            print("Error: Please provide a task ID")
            sys.exit(1)
        try:
            task_id = int(sys.argv[2])
        except ValueError:
            print("Error: Task ID must be a number")
            sys.exit(1)
        if not delete_task(task_id):
            sys.exit(1)
    else:
        print(f"Unknown command: {command}")
        print("Commands: add, list, done, uncomplete, edit, delete")
        sys.exit(1)


if __name__ == "__main__":
    main()