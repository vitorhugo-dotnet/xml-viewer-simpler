# xml-viewer-simpler

A small, read-only XML tree viewer derived from [juliangruber/xml-viewer](https://github.com/juliangruber/xml-viewer). This fork keeps the original project's simple interactive tree while making it easy to copy into legacy server-rendered applications.

The complete browser library is [`xml-viewer.js`](xml-viewer.js). It is a single classic JavaScript file with embedded styles and no runtime dependencies. It uses the browser's native `DOMParser`, Web Components, and Shadow DOM; it needs no npm install, bundler, framework, stylesheet, CDN, or ESM support in the consuming application.

The viewer only displays XML. It does not edit, format, convert, generate, or fetch resources referenced by XML. Text and attributes are rendered as DOM text, so XML content is never interpreted as HTML. The upstream MIT license and attribution are preserved in [LICENSE](LICENSE).

## Browser use

Copy `xml-viewer.js` and `LICENSE` into your application, then include the file with an ordinary script tag:

```html
<script src="xml-viewer.js"></script>
<simple-xml-viewer id="xml"></simple-xml-viewer>
<script>
  const viewer = document.querySelector('#xml');
  viewer.data = `<?xml version="1.0"?>
    <root>
      <user id="1"><name>Hugo</name></user>
    </root>`;
</script>
```

The component also reads a `data` attribute or text content when it is connected, though assigning the `.data` property avoids HTML parsing of the XML input.

## JavaScript API

`SimpleXMLViewer.create()` creates the same custom element for programmatic use:

```html
<script src="xml-viewer.js"></script>
<script>
  const viewer = SimpleXMLViewer.create('<root><user id="1">Hugo</user></root>');
  document.body.append(viewer);

  viewer.addEventListener('select', event => {
    console.log(event.detail); // plain description of the selected XML element
  });

  viewer.data = '<root><user id="2">Ada</user></root>'; // replace the XML
</script>
```

`viewer.data` gets or replaces the XML string. `viewer.selectedNode` returns `null` or a plain object containing `name`, `localName`, `namespaceURI`, `attributes`, `textContent`, and `childElementCount`. The `select` event carries that description as `event.detail`; clearing selection dispatches the event with `null`. `viewer.error` is `null` or the parsing `Error`; malformed XML is also shown in the component and emits an `error` event.

Use `viewer.expandAll()`, `viewer.collapseAll()`, and `viewer.clearSelection()` to control the view without adding a toolbar. Individual branches have their own expand/collapse button.

CSS is scoped in Shadow DOM. Override the host variables to adjust the main colors:

```css
simple-xml-viewer {
  --xml-viewer-background: #fff;
  --xml-viewer-foreground: #24292f;
  --xml-viewer-element: #0550ae;
  --xml-viewer-attribute: #953800;
  --xml-viewer-value: #0a3069;
  --xml-viewer-selection: #fff3bf;
}
```

## Development tests

Tests use Node's built-in test runner, Playwright, and Chromium. Install the development dependency and a Playwright browser, then run:

```sh
npm install
npx playwright install chromium
npm test
```

The checked-in browser fixture loads `xml-viewer.js` through a plain `<script src>` tag, as a consuming page does. No development dependency is required to use the viewer.

## GitHub Releases

Pushing a version tag such as `v1.0.0` runs the test, build, and publish jobs. The release contains one uncompressed asset, `index.js`, which is the standalone viewer source. Pull requests and other pushes run the test and build jobs without publishing a release.

## Origin and license

This project derives from [juliangruber/xml-viewer](https://github.com/juliangruber/xml-viewer), originally published under the MIT License. It was simplified into a standalone browser file and extended to safely preserve mixed XML content, namespace information, parse errors, and a Web Component API. The fork uses the single-file distribution approach illustrated by [vitorhugo-dotnet/json-viewer-simpler](https://github.com/vitorhugo-dotnet/json-viewer-simpler).
