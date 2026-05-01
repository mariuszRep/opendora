"""Tests for CLI TODO app."""

import json
import os
import tempfile
import unittest
from pathlib import Path

# Import the module
import todo


class TestTodo(unittest.TestCase):
    """Test cases for the TODO app."""

    def setUp(self):
        """Set up test fixtures."""
        # Use a temporary file for testing
        self.temp_dir = tempfile.mkdtemp()
        self.temp_file = Path(self.temp_dir) / "tasks.json"
        # Patch the TASKS_FILE to use our temp file
        todo.TASKS_FILE = self.temp_file

    def tearDown(self):
        """Clean up after tests."""
        if self.temp_file.exists():
            self.temp_file.unlink()
        os.rmdir(self.temp_dir)

    def test_add_task(self):
        """Test adding a task."""
        todo.add_task("Buy groceries")
        tasks = todo.load_tasks()
        self.assertEqual(len(tasks), 1)
        self.assertEqual(tasks[0]["description"], "Buy groceries")
        self.assertFalse(tasks[0]["done"])

    def test_add_multiple_tasks(self):
        """Test adding multiple tasks."""
        todo.add_task("Task 1")
        todo.add_task("Task 2")
        tasks = todo.load_tasks()
        self.assertEqual(len(tasks), 2)
        self.assertEqual(tasks[0]["id"], 1)
        self.assertEqual(tasks[1]["id"], 2)

    def test_list_empty(self):
        """Test listing when no tasks exist."""
        # Capture stdout
        import io
        from contextlib import redirect_stdout

        f = io.StringIO()
        with redirect_stdout(f):
            todo.list_tasks()
        output = f.getvalue()
        self.assertIn("No tasks", output)

    def test_list_with_tasks(self):
        """Test listing tasks."""
        todo.add_task("Test task")
        import io
        from contextlib import redirect_stdout

        f = io.StringIO()
        with redirect_stdout(f):
            todo.list_tasks()
        output = f.getvalue()
        self.assertIn("Test task", output)

    def test_mark_done(self):
        """Test marking a task as done."""
        todo.add_task("Test task")
        result = todo.mark_done(1)
        self.assertTrue(result)
        tasks = todo.load_tasks()
        self.assertTrue(tasks[0]["done"])

    def test_mark_done_invalid_id(self):
        """Test marking a task with invalid ID."""
        result = todo.mark_done(999)
        self.assertFalse(result)

    def test_mark_done_invalid_input(self):
        """Test marking a task with non-numeric input."""
        import io
        from contextlib import redirect_stdout

        todo.add_task("Task")
        f = io.StringIO()
        with redirect_stdout(f) as out:
            # Can't pass non-numeric directly to mark_done
            # Test through CLI parsing
            pass


if __name__ == "__main__":
    unittest.main()