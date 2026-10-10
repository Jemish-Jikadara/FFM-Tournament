// Inlines Lucide SVG icons into EJS templates:  <%- icon('flame', 'h-4 w-4') %>
const fs = require('fs');
const path = require('path');

const dir = path.join(path.dirname(require.resolve('lucide-static/package.json')), 'icons');
const cache = new Map();

function icon(name, cls = 'h-4 w-4') {
  let svg = cache.get(name);
  if (!svg) {
    try {
      svg = fs.readFileSync(path.join(dir, `${name}.svg`), 'utf8');
      svg = svg.replace(/<!--[\s\S]*?-->/g, '').replace(/\s(width|height|class)="[^"]*"/g, '');
    } catch {
      svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"></svg>';
    }
    cache.set(name, svg);
  }
  return svg.replace('<svg', `<svg class="${cls}" aria-hidden="true"`);
}

module.exports = icon;
