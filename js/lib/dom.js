// dom.js — a 30-line hyperscript helper so components can be plain functions
// that return real DOM nodes. No framework, no virtual DOM.
//
//   h('div', { class: 'card', onclick: fn }, 'text', h('span', {}, 'child'))
//
// - attrs: class/className, dataset via data-*, style object, on* event handlers,
//   html: rawHTML (trusted), everything else set as attribute.
// - children: strings, numbers, nodes, arrays, null/false (skipped).

export function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k === 'class' || k === 'className') el.className = v;
    else if (k === 'html') el.innerHTML = v;
    else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
    else if (k === 'dataset') Object.assign(el.dataset, v);
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const c of children.flat(Infinity)) {
    if (c == null || c === false) continue;
    el.append(c.nodeType ? c : document.createTextNode(String(c)));
  }
  return el;
}

export const frag = (...children) => {
  const f = document.createDocumentFragment();
  for (const c of children.flat(Infinity)) { if (c == null || c === false) continue; f.append(c.nodeType ? c : document.createTextNode(String(c))); }
  return f;
};

export const clear = (el) => { while (el.firstChild) el.removeChild(el.firstChild); return el; };
export const mount = (el, ...nodes) => { clear(el).append(frag(...nodes)); return el; };
