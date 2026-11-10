const fs = require('fs');
const path = require('path');

const rootDir = __dirname;
const publicDir = path.join(rootDir, 'public');

if (!fs.existsSync(publicDir)) {
  fs.mkdirSync(publicDir, { recursive: true });
}

function copyFile(src, dest) {
  if (fs.existsSync(src)) {
    fs.copyFileSync(src, dest);
    console.log(`Copied ${path.basename(src)} -> public/`);
  }
}

function copyDir(src, dest) {
  if (!fs.existsSync(src)) return;
  if (!fs.existsSync(dest)) fs.mkdirSync(dest, { recursive: true });
  const entries = fs.readdirSync(src, { withFileTypes: true });
  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copyDir(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

// Copy primary files to public/
const filesToCopy = [
  'index.html',
  'pos.html',
  'pos.css',
  'pos.js',
  'supabase_config.js',
  'sw.js',
  'manifest.json',
  'favicon.ico',
  'WRS-POS-Prototype.html'
];

filesToCopy.forEach(f => copyFile(path.join(rootDir, f), path.join(publicDir, f)));

// Copy assets folder
copyDir(path.join(rootDir, 'assets'), path.join(publicDir, 'assets'));

console.log('✅ Build completed successfully: public/ is ready for Vercel deployment.');
