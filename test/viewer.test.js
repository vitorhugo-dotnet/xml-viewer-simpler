const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { chromium } = require('playwright');
const { before, after } = require('node:test');

let server;
let origin;
const browserPath = process.env.CHROMIUM_PATH ||
  (fs.existsSync('/usr/bin/chromium') ? '/usr/bin/chromium' : undefined);

before(async () => {
  server = http.createServer((request, response) => {
    const files = {
      '/test/fixture.html': [path.join(__dirname, 'fixture.html'), 'text/html'],
      '/xml-viewer.js': [path.join(__dirname, '..', 'xml-viewer.js'), 'text/javascript']
    };
    const file = files[new URL(request.url, 'http://localhost').pathname];
    if (!file) {
      response.writeHead(404).end();
      return;
    }
    if (!fs.existsSync(file[0])) {
      response.writeHead(404).end();
      return;
    }
    response.writeHead(200, { 'content-type': file[1] });
    fs.createReadStream(file[0]).pipe(response);
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  origin = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  server.closeAllConnections();
  await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
});

test('renders XML safely and exposes the component API', async () => {
  const browser = await chromium.launch({ executablePath: browserPath, headless: true, args: ['--no-sandbox'] });
  try {
    const page = await browser.newPage();
    await page.goto(`${origin}/test/fixture.html`);
    await page.evaluate(() => {
      const viewer = document.querySelector('simple-xml-viewer');
      viewer.data = '<?xml version="1.0"?><!--before--><?work now?><root xmlns:x="urn:test" x:id="7"><x:item empty=""><![CDATA[before <script>window.pwned=1</script>]]></x:item><middle>A<b/>B</middle><script>window.pwned=2</script><img onerror="window.pwned=3"/></root><!--after-->';
    });
    const viewer = page.locator('simple-xml-viewer');
    const shadow = viewer.locator('xpath=..');
    const result = await page.evaluate(() => {
      const v = document.querySelector('simple-xml-viewer');
      const root = v.shadowRoot;
      return {
        text: root.textContent,
        tags: Array.from(root.querySelectorAll('[data-xml-name]')).map(el => el.dataset.xmlName),
        rootAttributes: Array.from(root.querySelector('[data-xml-name="root"]').querySelector('.header').querySelectorAll('.attribute-name')).map(el => el.textContent),
        declaration: root.querySelector('.declaration')?.textContent,
        selectedBefore: v.selectedNode,
        scriptRan: window.pwned,
        scriptElements: root.querySelectorAll('script').length,
        imageElements: root.querySelectorAll('img').length,
        escapedMarkup: root.querySelector('.xml-viewer').innerHTML.includes('&lt;script&gt;window.pwned=1&lt;/script&gt;')
      };
    });
    assert.match(result.text, /root/);
    assert.match(result.text, /xmlns:x/);
    assert.match(result.text, /x:id/);
    assert.match(result.text, /urn:test/);
    assert.match(result.text, /before <script>window\.pwned=1<\/script>/);
    assert.match(result.text, /<!--before-->/);
    assert.match(result.text, /<!--after-->/);
    assert.match(result.text, /<\?work now\?>/);
    assert.match(result.text, /A/);
    assert.match(result.text, /B/);
    assert.deepEqual(result.rootAttributes, ['xmlns:x', 'x:id']);
    assert.match(result.text, /\?xml version="1.0"\?/);
    assert.deepEqual(result.tags, ['root', 'x:item', 'middle', 'b', 'script', 'img']);
    assert.equal(result.scriptRan, undefined);
    assert.equal(result.scriptElements, 0);
    assert.equal(result.imageElements, 0);
    assert.equal(result.escapedMarkup, true);
    assert.equal(result.selectedBefore, null);
  } finally {
    await browser.close();
  }
});

test('selects nodes, clears selection, updates data and controls branches', async () => {
  const browser = await chromium.launch({ executablePath: browserPath, headless: true, args: ['--no-sandbox'] });
  try {
    const page = await browser.newPage();
    await page.goto(`${origin}/test/fixture.html`);
    await page.evaluate(() => {
      const viewer = document.querySelector('simple-xml-viewer');
      viewer.data = '<root><branch><leaf id="1">value</leaf></branch><other/></root>';
    });
    const root = page.locator('simple-xml-viewer');
    const branch = root.locator('[data-xml-name="branch"]');
    const toggle = branch.locator('button.toggle');
    assert.equal(await toggle.getAttribute('aria-expanded'), 'true');
    await toggle.click();
    assert.equal(await toggle.getAttribute('aria-expanded'), 'false');
    await root.evaluate(el => el.expandAll());
    assert.equal(await toggle.getAttribute('aria-expanded'), 'true');
    await root.evaluate(el => el.collapseAll());
    assert.equal(await toggle.getAttribute('aria-expanded'), 'false');
    await root.evaluate(el => el.expandAll());

    await root.locator('[data-xml-name="leaf"] .node-label').click();
    const selected = await root.evaluate(el => el.selectedNode);
    assert.equal(selected.name, 'leaf');
    assert.equal(selected.attributes[0].name, 'id');
    assert.equal(selected.textContent, 'value');
    const event = await page.evaluate(() => window.lastSelection);
    assert.deepEqual(event, selected);
    await root.evaluate(el => el.clearSelection());
    assert.equal(await root.evaluate(el => el.selectedNode), null);
    assert.equal(await root.locator('.selected').count(), 0);
    assert.equal(await page.evaluate(() => window.lastSelection), null);

    await root.evaluate(el => { el.data = '<root xmlns:n="urn:n"><n:leaf n:key="v">namespaced</n:leaf></root>'; });
    await root.locator('[data-xml-name="n:leaf"] .node-label').click();
    const namespaced = await root.evaluate(el => el.selectedNode);
    assert.equal(namespaced.name, 'n:leaf');
    assert.equal(namespaced.namespaceURI, 'urn:n');
    assert.equal(namespaced.attributes[0].namespaceURI, 'urn:n');
    await root.evaluate(el => el.clearSelection());

    await root.evaluate(el => { el.data = '<replacement><empty/></replacement>'; });
    assert.equal(await root.locator('[data-xml-name="replacement"]').count(), 1);
    assert.equal(await root.locator('[data-xml-name="empty"]').count(), 1);
    assert.equal(await root.evaluate(el => el.selectedNode), null);
  } finally {
    await browser.close();
  }
});

test('supports the plain JavaScript factory without resolving external XML resources', async () => {
  const browser = await chromium.launch({ executablePath: browserPath, headless: true, args: ['--no-sandbox'] });
  try {
    const page = await browser.newPage();
    const externalRequests = [];
    page.on('request', request => {
      if (request.url().includes('/outside.dtd')) externalRequests.push(request.url());
    });
    await page.goto(`${origin}/test/fixture.html`);
    const result = await page.evaluate(() => {
      const viewer = SimpleXMLViewer.create('<!DOCTYPE root SYSTEM "http://127.0.0.1/outside.dtd"><root><empty/></root>');
      document.body.append(viewer);
      return {
        tagName: SimpleXMLViewer.tagName,
        element: viewer.localName,
        hasDoctype: viewer.shadowRoot.querySelector('.doctype')?.textContent,
        empty: viewer.shadowRoot.querySelector('[data-xml-name="empty"]')?.textContent
      };
    });
    assert.equal(result.tagName, 'simple-xml-viewer');
    assert.equal(result.element, 'simple-xml-viewer');
    assert.match(result.hasDoctype, /outside\.dtd/);
    assert.match(result.empty, /empty\s*\/>/);
    assert.deepEqual(externalRequests, []);
  } finally {
    await browser.close();
  }
});

test('reports malformed XML without throwing into the page', async () => {
  const browser = await chromium.launch({ executablePath: browserPath, headless: true, args: ['--no-sandbox'] });
  try {
    const page = await browser.newPage();
    await page.goto(`${origin}/test/fixture.html`);
    const result = await page.evaluate(() => {
      const viewer = document.querySelector('simple-xml-viewer');
      let detail;
      viewer.addEventListener('error', event => { detail = event.detail; }, { once: true });
      viewer.data = '<root><unclosed></root>';
      return { error: viewer.error, detail, visible: viewer.shadowRoot.querySelector('.error')?.textContent };
    });
    assert.ok(result.error);
    assert.equal(result.detail.message, result.error.message);
    assert.match(result.visible, /XML/i);
  } finally {
    await browser.close();
  }
});

test('accepts valid XML elements named parsererror', async () => {
  const browser = await chromium.launch({ executablePath: browserPath, headless: true, args: ['--no-sandbox'] });
  try {
    const page = await browser.newPage();
    await page.goto(`${origin}/test/fixture.html`);
    const result = await page.evaluate(() => {
      const viewer = document.querySelector('simple-xml-viewer');
      viewer.data = '<root><parsererror>valid content</parsererror></root>';
      return { error: viewer.error, visible: viewer.shadowRoot.textContent };
    });
    assert.equal(result.error, null);
    assert.match(result.visible, /valid content/);
  } finally {
    await browser.close();
  }
});
