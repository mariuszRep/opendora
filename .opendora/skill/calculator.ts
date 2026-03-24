export function calculate(num1: number, num2: number, operation: string): number | string {
  // Validate inputs are numbers
  if (typeof num1 !== 'number' || typeof num2 !== 'number') {
    return 'Error: Invalid input - both num1 and num2 must be numbers';
  }

  switch (operation) {
    case 'add':
      return num1 + num2;
    case 'subtract':
      return num1 - num2;
    case 'multiply':
      return num1 * num2;
    case 'divide':
      if (num2 === 0) {
        return 'Error: Division by zero';
      }
      return num1 / num2;
    default:
      return `Error: Unsupported operation '${operation}'`;
  }
}