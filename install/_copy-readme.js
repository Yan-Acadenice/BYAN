// Temporary script to copy README-YANSTALLER.md to README.md
const fs = require('fs');
const path = require('path');

const source = path.join(__dirname, 'README-YANSTALLER.md');
const dest = path.join(__dirname, 'README.md');

try {
  const content = fs.readFileSync(source, 'utf8');
  fs.writeFileSync(dest, content, 'utf8');
  console.log('✅ README.md updated successfully');
  console.log(`   Copied ${content.length} characters`);
} catch (error) {
  console.error('❌ Error copying README:', error.message);
  process.exit(1);
}
