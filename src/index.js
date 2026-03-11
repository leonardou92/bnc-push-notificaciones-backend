const fs = require('fs');
const path = require('path');

const mdPath = path.join(__dirname, '..', 'docs', 'BNC-NotificationPush.md');

function main() {
  try {
    const md = fs.readFileSync(mdPath, 'utf8');
    console.log('--- BNC NotificationPush Context ---\n');
    console.log(md);
  } catch (err) {
    console.error('Error reading markdown context:', err.message);
    process.exit(1);
  }
}

if (require.main === module) main();

module.exports = { main };
