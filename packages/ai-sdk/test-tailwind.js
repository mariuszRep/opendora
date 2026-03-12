const { execSync } = require('child_process');
try {
  const result = execSync('npx @tailwindcss/cli -i ./app/globals.css -o ./out.css', { encoding: 'utf-8' });
  console.log(result);
} catch (e) {
  console.log(e.stdout, e.stderr);
}
