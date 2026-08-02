/**
 * Post-build step for the GitHub Pages deploy.
 *
 * Vite emits neither of these, but Pages needs both:
 *   - 404.html: Pages has no SPA rewrite, so a refresh on any route 404s unless
 *     the not-found page is the app itself. Must be a copy of the *built*
 *     index.html so it points at the hashed asset filenames.
 *   - .nojekyll: stops Pages running the output through Jekyll.
 */
const fs = require('fs');
const path = require('path');

const dist = path.join(__dirname, '..', 'dist');
const index = path.join(dist, 'index.html');

if (!fs.existsSync(index)) {
  console.error('prepare-pages: dist/index.html missing — run the build first.');
  process.exit(1);
}

fs.copyFileSync(index, path.join(dist, '404.html'));
fs.writeFileSync(path.join(dist, '.nojekyll'), '');
console.log('prepare-pages: wrote dist/404.html and dist/.nojekyll');
