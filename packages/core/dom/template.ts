interface PendingEventBinding {
  el: Element;
  type: string;
  listener: EventListener;
}

const templateCache = new WeakMap<TemplateStringsArray, HTMLTemplateElement>();
const fragmentEvents = new WeakMap<DocumentFragment, PendingEventBinding[]>();

const SLOT_PREFIX = '__s_slot_';
const SLOT_SUFFIX = '__';
const EXACT_SLOT_RE = /^__s_slot_(\d+)__$/;
const GLOBAL_SLOT_RE = /__s_slot_(\d+)__/g;

const SVG_NS = 'http://www.w3.org/2000/svg';
const SVG_TAGS = new Set([
  'svg',
  'path',
  'circle',
  'rect',
  'line',
  'polyline',
  'polygon',
  'g',
  'defs',
  'title',
  'animate',
  'animatetransform',
]);
const VOID_TAGS = new Set(['input', 'img', 'br', 'hr', 'meta', 'link', 'source']);

let trustedPolicy: { createHTML: (s: string) => unknown } | null | undefined;

function getTrustedPolicy() {
  if (trustedPolicy !== undefined) return trustedPolicy;
  trustedPolicy = null;
  const tt = (globalThis as Record<string, any>).trustedTypes;
  if (tt && typeof tt.createPolicy === 'function') {
    for (const name of ['sora#html', 'default', 'dompurify']) {
      try {
        trustedPolicy = tt.createPolicy(name, { createHTML: (s: string) => s });
        break;
      } catch {}
    }
  }
  return trustedPolicy;
}

function decodeHtmlEntities(str: string): string {
  if (!str.includes('&')) return str;
  return str
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

// * 识别引号和注释的扫描，避免属性值里的 '>' 导致标签位置判断错乱
function isInsideOpenTag(acc: string): boolean {
  let mode: 'text' | 'comment' | 'tag' = 'text';
  let quote: '' | '"' | "'" = '';
  let i = 0;

  while (i < acc.length) {
    if (mode === 'text') {
      if (acc.startsWith('<!--', i)) {
        mode = 'comment';
        i += 4;
        continue;
      }
      if (acc[i] === '<') {
        const next = acc[i + 1] ?? '';
        if (/[a-zA-Z/!?]/.test(next)) {
          mode = 'tag';
        }
      }
      i++;
      continue;
    }

    if (mode === 'comment') {
      if (acc.startsWith('-->', i)) {
        mode = 'text';
        i += 3;
        continue;
      }
      i++;
      continue;
    }

    const ch = acc[i];
    if (quote) {
      if (ch === quote) {
        quote = '';
      }
    } else if (ch === '"' || ch === "'") {
      quote = ch;
    } else if (ch === '>') {
      mode = 'text';
    }
    i++;
  }

  return mode === 'tag';
}

function findTagEnd(htmlStr: string, startAfterOpen: number): number {
  let quote: '' | '"' | "'" = '';
  for (let i = startAfterOpen; i < htmlStr.length; i++) {
    const ch = htmlStr[i];
    if (quote) {
      if (ch === quote) quote = '';
    } else if (ch === '"' || ch === "'") {
      quote = ch;
    } else if (ch === '>') {
      return i;
    }
  }
  return -1;
}

function parseHtmlWithoutInnerHTML(rawHtml: string, root: DocumentFragment): void {
  const stack: Node[] = [root];
  let inSvg = 0;
  const attrRe = /([a-zA-Z0-9_@?-]+)(?:=(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g;
  let i = 0;

  while (i < rawHtml.length) {
    const parent = stack[stack.length - 1] ?? root;

    if (rawHtml.startsWith('<!--', i)) {
      const end = rawHtml.indexOf('-->', i + 4);
      const commentEnd = end === -1 ? rawHtml.length : end;
      parent.appendChild(document.createComment(rawHtml.slice(i + 4, commentEnd)));
      i = end === -1 ? rawHtml.length : end + 3;
      continue;
    }

    if (rawHtml[i] === '<') {
      if (rawHtml[i + 1] === '/') {
        const end = rawHtml.indexOf('>', i + 2);
        if (end !== -1) {
          const lower = rawHtml
            .slice(i + 2, end)
            .trim()
            .toLowerCase();
          if (lower === 'svg' && inSvg > 0) inSvg--;
          if (stack.length > 1) {
            const topNode = stack[stack.length - 1];
            if (topNode instanceof Element && topNode.tagName.toLowerCase() === lower) {
              stack.pop();
            }
          }
          i = end + 1;
          continue;
        }
      }

      const tagMatch = rawHtml.slice(i).match(/^<([a-zA-Z0-9_-]+)/);
      if (tagMatch?.[1]) {
        const lower = tagMatch[1].toLowerCase();
        const tagEnd = findTagEnd(rawHtml, i + tagMatch[0].length);
        if (tagEnd !== -1) {
          let attrStr = rawHtml.slice(i + tagMatch[0].length, tagEnd);
          const selfClose = attrStr.trimEnd().endsWith('/');
          if (selfClose) {
            attrStr = attrStr.replace(/\/\s*$/, '');
          }

          if (lower === 'svg') inSvg++;
          const isSvg = inSvg > 0 || SVG_TAGS.has(lower);
          const el = isSvg
            ? document.createElementNS(
                SVG_NS,
                lower === 'animatetransform' ? 'animateTransform' : lower
              )
            : document.createElement(lower);

          if (attrStr.trim()) {
            for (const attrMatch of attrStr.matchAll(attrRe)) {
              const attrName = attrMatch[1];
              // ! 禁止通过模板属性直接写入原生 on* 事件字符串
              if (!attrName || attrName.toLowerCase().startsWith('on')) continue;
              const attrVal = decodeHtmlEntities(
                attrMatch[2] ?? attrMatch[3] ?? attrMatch[4] ?? ''
              );
              el.setAttribute(attrName, attrVal);
            }
          }

          parent.appendChild(el);
          if (!selfClose && !VOID_TAGS.has(lower)) {
            stack.push(el);
          } else if (lower === 'svg' && inSvg > 0) {
            inSvg--;
          }
          i = tagEnd + 1;
          continue;
        }
      }
    }

    const nextLt = rawHtml.indexOf('<', i + 1);
    const textEnd = nextLt === -1 ? rawHtml.length : nextLt;
    parent.appendChild(document.createTextNode(decodeHtmlEntities(rawHtml.slice(i, textEnd))));
    i = textEnd;
  }
}

export function setTemplateHTML(tpl: HTMLTemplateElement, rawHtml: string): void {
  try {
    const policy = getTrustedPolicy();
    if (policy) {
      tpl.innerHTML = policy.createHTML(rawHtml) as unknown as string;
      return;
    }
    tpl.innerHTML = rawHtml;
  } catch {
    tpl.content.replaceChildren();
    parseHtmlWithoutInnerHTML(rawHtml, tpl.content);
  }
}

function buildTemplateElement(strings: TemplateStringsArray): HTMLTemplateElement {
  let acc = '';
  for (let i = 0; i < strings.length; i++) {
    acc += strings[i];
    if (i < strings.length - 1) {
      const insideTag = isInsideOpenTag(acc);
      const token = `${SLOT_PREFIX}${i}${SLOT_SUFFIX}`;

      if (insideTag) {
        const trimmed = acc.trimEnd();
        if (trimmed.endsWith('=')) {
          acc += `"${token}"`;
        } else {
          acc += token;
        }
      } else {
        acc += `<!--${token}-->`;
      }
    }
  }

  const tpl = document.createElement('template');
  setTemplateHTML(tpl, acc);
  return tpl;
}

function valueToNode(val: unknown, collectedEvents: PendingEventBinding[]): Node {
  if (val === null || val === undefined || typeof val === 'boolean') {
    return document.createTextNode('');
  }
  if (val instanceof DocumentFragment) {
    const childEvents = fragmentEvents.get(val);
    if (childEvents) {
      collectedEvents.push(...childEvents);
      fragmentEvents.delete(val);
    }
    return val;
  }
  if (val instanceof Node) {
    return val.parentNode ? val.cloneNode(true) : val;
  }
  if (Array.isArray(val)) {
    const subFrag = document.createDocumentFragment();
    for (const item of val) {
      subFrag.appendChild(valueToNode(item, collectedEvents));
    }
    return subFrag;
  }
  return document.createTextNode(String(val));
}

export function html(strings: TemplateStringsArray, ...values: unknown[]): DocumentFragment {
  let tpl = templateCache.get(strings);
  if (!tpl) {
    tpl = buildTemplateElement(strings);
    templateCache.set(strings, tpl);
  }

  const fragment = tpl.content.cloneNode(true) as DocumentFragment;
  if (values.length === 0) return fragment;

  const elements: Element[] = [];
  const comments: Comment[] = [];

  const walker = document.createTreeWalker(
    fragment,
    NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_COMMENT
  );

  let current = walker.nextNode();
  while (current) {
    if (current.nodeType === Node.ELEMENT_NODE) {
      elements.push(current as Element);
    } else if (current.nodeType === Node.COMMENT_NODE) {
      comments.push(current as Comment);
    }
    current = walker.nextNode();
  }

  const pendingEvents: PendingEventBinding[] = [];

  for (const el of elements) {
    const attrs = Array.from(el.attributes);
    for (const attr of attrs) {
      if (!attr.value.includes(SLOT_PREFIX)) continue;

      const exactMatch = attr.value.match(EXACT_SLOT_RE);
      if (attr.name.startsWith('@') && exactMatch) {
        const idx = Number(exactMatch[1]);
        const val = values[idx];
        const eventType = attr.name.slice(1);
        el.removeAttribute(attr.name);
        if (typeof val === 'function') {
          pendingEvents.push({
            el,
            type: eventType,
            listener: val as EventListener,
          });
        }
      } else if (attr.name.startsWith('?') && exactMatch) {
        const idx = Number(exactMatch[1]);
        const boolAttr = attr.name.slice(1);
        el.removeAttribute(attr.name);
        el.toggleAttribute(boolAttr, Boolean(values[idx]));
      } else if (exactMatch) {
        const idx = Number(exactMatch[1]);
        const val = values[idx];
        if (typeof val === 'boolean') {
          el.toggleAttribute(attr.name, val);
        } else if (val === null || val === undefined) {
          el.removeAttribute(attr.name);
        } else {
          el.setAttribute(attr.name, String(val));
        }
      } else {
        const interpolated = attr.value.replace(GLOBAL_SLOT_RE, (_m, iStr) => {
          const v = values[Number(iStr)];
          return v === null || v === undefined ? '' : String(v);
        });
        el.setAttribute(attr.name, interpolated);
      }
    }
  }

  for (const comment of comments) {
    const match = comment.data.match(EXACT_SLOT_RE);
    if (!match) continue;
    const idx = Number(match[1]);
    const replacement = valueToNode(values[idx], pendingEvents);
    comment.replaceWith(replacement);
  }

  if (pendingEvents.length > 0) {
    fragmentEvents.set(fragment, pendingEvents);
  }

  return fragment;
}

export function bindFragmentEvents(fragment: DocumentFragment, signal: AbortSignal): void {
  const bindings = fragmentEvents.get(fragment);
  if (!bindings) return;
  for (const { el, type, listener } of bindings) {
    el.addEventListener(type, listener, { signal });
  }
  fragmentEvents.delete(fragment);
}
