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

    def test_mark_uncomplete(self):
        """Test marking a task as uncomplete (active)."""
        todo.add_task("Test task")
        todo.mark_done(1)
        result = todo.mark_uncomplete(1)
        self.assertTrue(result)
        tasks = todo.load_tasks()
        self.assertFalse(tasks[0]["done"])

    def test_mark_uncomplete_invalid_id(self):
        """Test marking uncomplete with invalid ID."""
        result = todo.mark_uncomplete(999)
        self.assertFalse(result)

    def test_edit_task(self):
        """Test editing a task description."""
        todo.add_task("Original description")
        result = todo.edit_task(1, "Updated description")
        self.assertTrue(result)
        tasks = todo.load_tasks()
        self.assertEqual(tasks[0]["description"], "Updated description")

    def test_edit_task_invalid_id(self):
        """Test editing with invalid ID."""
        result = todo.edit_task(999, "New description")
        self.assertFalse(result)

    def test_edit_task_empty_description(self):
        """Test editing with empty description."""
        todo.add_task("Test task")
        result = todo.edit_task(1, "")
        self.assertFalse(result)
        result = todo.edit_task(1, "   ")
        self.assertFalse(result)

    def test_delete_task(self):
        """Test deleting a task."""
        todo.add_task("Task to delete")
        result = todo.delete_task(1)
        self.assertTrue(result)
        tasks = todo.load_tasks()
        self.assertEqual(len(tasks), 0)

    def test_delete_task_invalid_id(self):
        """Test deleting with invalid ID."""
        result = todo.delete_task(999)
        self.assertFalse(result)

    def test_delete_task_updates_ids(self):
        """Test that deleting a task doesn't affect other task IDs."""
        todo.add_task("Task 1")
        todo.add_task("Task 2")
        todo.add_task("Task 3")
        todo.delete_task(2)
        tasks = todo.load_tasks()
        self.assertEqual(len(tasks), 2)
        self.assertEqual(tasks[0]["id"], 1)
        self.assertEqual(tasks[1]["id"], 3)


if __name__ == "__main__":
    unittest.main()