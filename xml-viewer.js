/*
 * Derived from juliangruber/xml-viewer (MIT):
 * https://github.com/juliangruber/xml-viewer
 * Copyright (c) 2015 Julian Gruber
 */
(function (global) {
  'use strict';

  /* ==================== STYLES ==================== */
  var styles = `
    :host {
      --xml-viewer-background: #fff;
      --xml-viewer-foreground: #24292f;
      --xml-viewer-element: #0550ae;
      --xml-viewer-attribute: #953800;
      --xml-viewer-value: #0a3069;
      --xml-viewer-text: #24292f;
      --xml-viewer-muted: #6e7781;
      --xml-viewer-selection: #fff3bf;
      --xml-viewer-error: #cf222e;
      display: block;
      color: var(--xml-viewer-foreground);
      background: var(--xml-viewer-background);
      font: 14px/1.55 ui-monospace, SFMono-Regular, Consolas, "Liberation Mono", monospace;
    }
    .xml-viewer { overflow: auto; padding: 0.75rem; white-space: pre-wrap; overflow-wrap: anywhere; }
    .declaration, .doctype, .comment, .instruction { color: var(--xml-viewer-muted); }
    .element { margin: 0; }
    .header, .closing, .content-item { min-height: 1.55em; }
    .header { display: flex; align-items: baseline; width: fit-content; max-width: 100%; cursor: default; }
    .header.selected, .closing.selected, .content-item.selected { background: var(--xml-viewer-selection); }
    .node-label { cursor: pointer; }
    .element-name { color: var(--xml-viewer-element); font-weight: 600; }
    .attribute-name { color: var(--xml-viewer-attribute); }
    .attribute-value { color: var(--xml-viewer-value); }
    .text-value { color: var(--xml-viewer-text); }
    .toggle {
      width: 1.25em; height: 1.4em; flex: 0 0 1.25em; margin: 0 0.25em 0 0;
      padding: 0; border: 0; background: transparent; color: var(--xml-viewer-muted);
      font: inherit; line-height: 1; cursor: pointer;
    }
    .toggle:focus-visible, .node-label:focus-visible { outline: 2px solid var(--xml-viewer-element); outline-offset: 1px; }
    .toggle-spacer { display: inline-block; width: 1.5em; flex: 0 0 1.5em; }
    .contents { padding-left: 1.5em; }
    .content-item { white-space: pre-wrap; }
    .closing { width: fit-content; }
    .error { color: var(--xml-viewer-error); white-space: pre-wrap; }
  `;

  /* ==================== XML PARSING ==================== */
  function parseXML(source) {
    var xml = String(source);
    var document = new DOMParser().parseFromString(xml, 'application/xml');
    var root = document.documentElement;
    var parserErrors = document.getElementsByTagNameNS('*', 'parsererror');
    var parserError = Array.prototype.some.call(parserErrors, function (error) {
      return error.namespaceURI === 'http://www.mozilla.org/newlayout/xml/parsererror.xml' ||
        (error.namespaceURI === 'http://www.w3.org/1999/xhtml' &&
         /This page contains the following errors:/.test(error.textContent));
    });
    if (!root || parserError) {
      var detail = root ? root.textContent.trim() : '';
      throw new Error(detail || 'The supplied text is not well-formed XML.');
    }
    var match = xml.match(/^\uFEFF?\s*(<\?xml\s+[^?]*\?>)/i);
    return {
      document: document,
      declaration: match ? match[1] : '',
      doctype: document.doctype
    };
  }

  function make(tag, className, text) {
    var element = document.createElement(tag);
    if (className) element.className = className;
    if (text !== undefined) element.textContent = text;
    return element;
  }

  function nodeDescription(element) {
    return {
      name: element.nodeName,
      localName: element.localName,
      namespaceURI: element.namespaceURI,
      attributes: Array.prototype.map.call(element.attributes, function (attribute) {
        return {
          name: attribute.name,
          localName: attribute.localName,
          namespaceURI: attribute.namespaceURI,
          value: attribute.value
        };
      }),
      textContent: element.textContent,
      childElementCount: element.childElementCount
    };
  }

  function renderDoctype(doctype) {
    var type = '<!DOCTYPE ' + doctype.name;
    if (doctype.publicId) type += ' PUBLIC "' + doctype.publicId + '" "' + doctype.systemId + '"';
    else if (doctype.systemId) type += ' SYSTEM "' + doctype.systemId + '"';
    return type + '>';
  }

  /* ==================== TREE RENDERER ==================== */
  function appendOpeningTag(header, element, toggle) {
    if (toggle) header.appendChild(toggle);
    else header.appendChild(make('span', 'toggle-spacer'));
    header.appendChild(make('span', '', '<'));
    header.appendChild(make('span', 'element-name', element.nodeName));
    Array.prototype.forEach.call(element.attributes, function (attribute) {
      header.appendChild(make('span', '', ' '));
      header.appendChild(make('span', 'attribute-name', attribute.name));
      header.appendChild(make('span', '', '="'));
      header.appendChild(make('span', 'attribute-value', attribute.value));
      header.appendChild(make('span', '', '"'));
    });
    header.appendChild(make('span', '', '>'));
  }

  function appendInlineContent(parent, element) {
    Array.prototype.forEach.call(element.childNodes, function (child) {
      if (child.nodeType === Node.TEXT_NODE || child.nodeType === Node.CDATA_SECTION_NODE) {
        parent.appendChild(make('span', 'text-value', child.nodeValue));
      } else if (child.nodeType === Node.COMMENT_NODE) {
        parent.appendChild(make('span', 'comment', '<!--' + child.nodeValue + '-->'));
      } else if (child.nodeType === Node.PROCESSING_INSTRUCTION_NODE) {
        parent.appendChild(make('span', 'instruction', '<?' + child.target + ' ' + child.data + '?>'));
      }
    });
  }

  function appendContentItem(parent, child) {
    if (child.nodeType === Node.ELEMENT_NODE) {
      parent.appendChild(renderElement(child));
    } else if (child.nodeType === Node.TEXT_NODE || child.nodeType === Node.CDATA_SECTION_NODE) {
      parent.appendChild(make('div', 'content-item text-value', child.nodeValue));
    } else if (child.nodeType === Node.COMMENT_NODE) {
      parent.appendChild(make('div', 'content-item comment', '<!--' + child.nodeValue + '-->'));
    } else if (child.nodeType === Node.PROCESSING_INSTRUCTION_NODE) {
      parent.appendChild(make('div', 'content-item instruction', '<?' + child.target + ' ' + child.data + '?>'));
    }
  }

  function renderElement(element) {
    var wrapper = make('div', 'element');
    wrapper.dataset.xmlName = element.nodeName;
    wrapper.dataset.namespaceURI = element.namespaceURI || '';
    var hasElementChildren = element.children.length > 0;
    var hasContent = element.childNodes.length > 0;
    var header = make('div', 'header node-label');
    var children;
    var toggle;

    if (hasElementChildren) {
      toggle = make('button', 'toggle', '−');
      toggle.type = 'button';
      toggle.setAttribute('aria-expanded', 'true');
      toggle.setAttribute('aria-label', 'Collapse ' + element.nodeName);
      children = make('div', 'contents');
      toggle.addEventListener('click', function (event) {
        event.stopPropagation();
        var expanded = toggle.getAttribute('aria-expanded') !== 'true';
        toggle.setAttribute('aria-expanded', String(expanded));
        toggle.textContent = expanded ? '−' : '+';
        toggle.setAttribute('aria-label', (expanded ? 'Collapse ' : 'Expand ') + element.nodeName);
        children.hidden = !expanded;
      });
    }

    appendOpeningTag(header, element, toggle);
    wrapper.appendChild(header);

    if (hasContent && !hasElementChildren) {
      appendInlineContent(header, element);
      header.appendChild(make('span', '', '</'));
      header.appendChild(make('span', 'element-name', element.nodeName));
      header.appendChild(make('span', '', '>'));
    } else if (hasElementChildren) {
      Array.prototype.forEach.call(element.childNodes, function (child) {
        appendContentItem(children, child);
      });
      wrapper.appendChild(children);
      var closing = make('div', 'closing node-label');
      closing.appendChild(make('span', 'toggle-spacer'));
      closing.appendChild(make('span', '', '</'));
      closing.appendChild(make('span', 'element-name', element.nodeName));
      closing.appendChild(make('span', '', '>'));
      wrapper.appendChild(closing);
    } else {
      header.lastChild.textContent = ' />';
    }

    function select(event) {
      event.stopPropagation();
      wrapper.dispatchEvent(new CustomEvent('xml-viewer-select-node', {
        bubbles: true,
        detail: { element: element, row: header }
      }));
    }
    header.addEventListener('click', select);
    header.tabIndex = 0;
    header.addEventListener('keydown', function (event) {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        select(event);
      }
    });
    return wrapper;
  }

  /* ==================== COMPONENT ==================== */
  class SimpleXMLViewerElement extends HTMLElement {
    static get observedAttributes() { return ['data']; }

    constructor() {
      super();
      this.attachShadow({ mode: 'open' });
      var style = make('style', '', styles);
      this._view = make('div', 'xml-viewer');
      this.shadowRoot.append(style, this._view);
      this._data = null;
      this._selected = null;
      this._selectedRow = null;
      this._error = null;
      var self = this;
      this.shadowRoot.addEventListener('xml-viewer-select-node', function (event) {
        self._select(event.detail.element, event.detail.row);
      });
    }

    connectedCallback() {
      if (this._data === null) {
        this._data = this.getAttribute('data');
        if (this._data === null && this.textContent.trim()) this._data = this.textContent;
        if (this._data !== null) this._render();
      }
    }

    attributeChangedCallback(name, oldValue, newValue) {
      if (name === 'data' && oldValue !== newValue && this._data !== null) this.data = newValue;
    }

    get data() { return this._data; }
    set data(value) {
      this._data = String(value == null ? '' : value);
      this._render();
    }

    get selectedNode() {
      return this._selected ? nodeDescription(this._selected) : null;
    }

    get error() { return this._error; }

    _select(element, row) {
      if (this._selected === element) return;
      if (this._selectedRow) this._selectedRow.classList.remove('selected');
      this._selected = element;
      this._selectedRow = row;
      if (row) row.classList.add('selected');
      this.dispatchEvent(new CustomEvent('select', {
        bubbles: true,
        detail: this.selectedNode
      }));
    }

    clearSelection() {
      if (!this._selected) return;
      this._select(null, null);
    }

    expandAll() { this._setAllExpanded(true); }
    collapseAll() { this._setAllExpanded(false); }

    _setAllExpanded(expanded) {
      Array.prototype.forEach.call(this.shadowRoot.querySelectorAll('button.toggle'), function (toggle) {
        toggle.setAttribute('aria-expanded', String(expanded));
        toggle.textContent = expanded ? '−' : '+';
        toggle.setAttribute('aria-label', (expanded ? 'Collapse ' : 'Expand ') +
          toggle.closest('.element').dataset.xmlName);
        toggle.parentElement.nextElementSibling.hidden = !expanded;
      });
    }

    _render() {
      this.clearSelection();
      this._error = null;
      this._view.replaceChildren();
      try {
        var parsed = parseXML(this._data);
        if (parsed.declaration) this._view.appendChild(make('div', 'declaration', parsed.declaration));
        Array.prototype.forEach.call(parsed.document.childNodes, function (child) {
          if (child.nodeType === Node.ELEMENT_NODE) this._view.appendChild(renderElement(child));
          else if (child.nodeType === Node.DOCUMENT_TYPE_NODE) this._view.appendChild(make('div', 'doctype', renderDoctype(child)));
          else if (child.nodeType === Node.COMMENT_NODE) this._view.appendChild(make('div', 'comment', '<!--' + child.nodeValue + '-->'));
          else if (child.nodeType === Node.PROCESSING_INSTRUCTION_NODE) this._view.appendChild(make('div', 'instruction', '<?' + child.target + ' ' + child.data + '?>'));
        }, this);
      } catch (error) {
        this._error = error;
        this._view.appendChild(make('div', 'error', 'XML parsing error: ' + error.message));
        this.dispatchEvent(new CustomEvent('error', { detail: error }));
      }
    }
  }

  if (!global.customElements.get('simple-xml-viewer')) {
    global.customElements.define('simple-xml-viewer', SimpleXMLViewerElement);
  }

  /* ==================== PUBLIC API ==================== */
  global.SimpleXMLViewer = Object.freeze({
    tagName: 'simple-xml-viewer',
    create: function (data) {
      var viewer = global.document.createElement('simple-xml-viewer');
      if (data !== undefined) viewer.data = data;
      return viewer;
    }
  });
})(window);
