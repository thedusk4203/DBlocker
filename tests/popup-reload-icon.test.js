const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const popupHtml = fs.readFileSync(
  path.join(__dirname, '..', 'popup', 'popup.html'),
  'utf8'
);

test('reload button renders a complete, rounded reload icon', () => {
  const button = popupHtml.match(
    /<button id="reloadTabBtn"[\s\S]*?<\/button>/
  )?.[0];

  assert.ok(button, 'reload button must exist');
  assert.match(button, /stroke-linejoin="round"/);
  assert.match(
    button,
    /<path d="M21 12a9 9 0 1 1-2\.64-6\.36L21 8"\s*\/>/
  );
  assert.match(button, /<path d="M21 3v5h-5"\s*\/>/);
});
