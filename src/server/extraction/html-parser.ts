import 'server-only';
import { createHash } from 'node:crypto';
import { JSDOM } from 'jsdom';

export interface ParsedHtmlResult {
  readonly title: string | null;
  readonly markdownContent: string;
  readonly textExcerpt: string | null;
  readonly contentHash: string | null;
  readonly author: string | null;
  readonly publisher: string | null;
  readonly publishedDate: string | null;
  readonly language: string | null;
  readonly isBotChallenge: boolean;
  readonly isEmpty: boolean;
  readonly warnings: readonly string[];
}

const BOT_CHALLENGE_PATTERNS = [
  /attention required! \| cloudflare/i,
  /just a moment\.\.\./i,
  /cf-browser-verification/i,
  /cloudflare ray id/i,
  /403 forbidden/i,
  /access denied/i,
  /please turn javascript on/i,
  /enable javascript and cookies to continue/i,
  /shieldsquare captcha/i,
  /datadome/i,
  /bot verification/i,
  /pardon our interruption/i,
  /robot or human/i,
];

const BOILERPLATE_SELECTORS = [
  'script',
  'style',
  'noscript',
  'iframe',
  'svg',
  'canvas',
  'nav',
  'header',
  'footer',
  'aside',
  'form',
  'dialog',
  '[role="navigation"]',
  '[role="banner"]',
  '[role="contentinfo"]',
  '[aria-hidden="true"]',
  '.cookie-banner',
  '#cookie-consent',
  '#cookie-notice',
  '.ad',
  '.ads',
  '.advertisement',
  '.social-share',
  '.related-posts',
  '.comments',
];

const MAX_DOM_ELEMENTS = 10000;
const MAX_MARKDOWN_BYTES = 500 * 1024; // 500 KB ceiling

/**
 * VerityScout AI — Safe HTML Parser & Main-Content Normalizer
 * Governed by: Step 34 (Source Extraction Adapter)
 *
 * Security Invariants:
 * 1. Script execution is strictly disabled (runScripts: undefined).
 * 2. Remote resource fetching (images, sub-frames, styles) is strictly disabled (resources: undefined).
 * 3. Boilerplate, navigation, ads, and cookies are stripped.
 * 4. Extracted text is normalized to clean Markdown; raw HTML is never passed upward.
 */
export function parseHtmlContent(html: string, sourceUrl: string): ParsedHtmlResult {
  const warnings: string[] = [];

  if (!html || html.trim().length === 0) {
    return {
      title: null,
      markdownContent: '',
      textExcerpt: null,
      contentHash: null,
      author: null,
      publisher: null,
      publishedDate: null,
      language: null,
      isBotChallenge: false,
      isEmpty: true,
      warnings: ['Document body is empty'],
    };
  }

  // 1. Detect Bot Challenge Signatures in Raw Markup
  for (const pattern of BOT_CHALLENGE_PATTERNS) {
    if (pattern.test(html)) {
      return {
        title: 'Access Blocked (Bot Challenge)',
        markdownContent: '',
        textExcerpt: 'Access denied: bot challenge or perimeter protection blocked automated retrieval.',
        contentHash: null,
        author: null,
        publisher: null,
        publishedDate: null,
        language: null,
        isBotChallenge: true,
        isEmpty: false,
        warnings: ['Bot challenge or perimeter protection detected in document'],
      };
    }
  }

  // 2. Parse DOM with JSDOM (Zero Scripts, Zero External Resources)
  let dom: JSDOM;
  try {
    dom = new JSDOM(html, {
      url: sourceUrl,
      runScripts: undefined, // Strictly inert
    });
  } catch (err) {
    return {
      title: null,
      markdownContent: '',
      textExcerpt: null,
      contentHash: null,
      author: null,
      publisher: null,
      publishedDate: null,
      language: null,
      isBotChallenge: false,
      isEmpty: true,
      warnings: [`DOM parsing failed: ${err instanceof Error ? err.message : String(err)}`],
    };
  }

  const { document } = dom.window;

  // Check element budget to prevent DoS
  const allElements = document.querySelectorAll('*');
  if (allElements.length > MAX_DOM_ELEMENTS) {
    warnings.push(`DOM element count (${allElements.length}) exceeded safety limit of ${MAX_DOM_ELEMENTS}`);
  }

  // 3. Extract Document Metadata
  const language = document.documentElement.getAttribute('lang')?.trim() ||
    getMetaContent(document, 'http-equiv', 'content-language') ||
    null;

  const title = getMetaContent(document, 'property', 'og:title') ||
    getMetaContent(document, 'name', 'twitter:title') ||
    document.querySelector('title')?.textContent?.trim() ||
    document.querySelector('h1')?.textContent?.trim() ||
    null;

  const author = getMetaContent(document, 'name', 'author') ||
    getMetaContent(document, 'property', 'article:author') ||
    document.querySelector('[rel="author"]')?.textContent?.trim() ||
    null;

  const publisher = getMetaContent(document, 'property', 'og:site_name') ||
    getMetaContent(document, 'name', 'publisher') ||
    null;

  const rawPubDate = getMetaContent(document, 'property', 'article:published_time') ||
    getMetaContent(document, 'name', 'pubdate') ||
    getMetaContent(document, 'name', 'date') ||
    document.querySelector('time[datetime]')?.getAttribute('datetime')?.trim() ||
    null;

  const publishedDate = parseIsoDateOrNull(rawPubDate);

  // 4. Strip Boilerplate & Navigation Elements
  for (const selector of BOILERPLATE_SELECTORS) {
    const nodes = document.querySelectorAll(selector);
    for (let i = 0; i < nodes.length; i++) {
      nodes[i]?.remove();
    }
  }

  // 5. Identify Main Content Container
  const mainContainer = document.querySelector('main') ||
    document.querySelector('article') ||
    document.querySelector('[role="main"]') ||
    document.body;

  if (!mainContainer) {
    return {
      title,
      markdownContent: '',
      textExcerpt: null,
      contentHash: null,
      author,
      publisher,
      publishedDate,
      language,
      isBotChallenge: false,
      isEmpty: true,
      warnings: ['No main content container found in document'],
    };
  }

  // 6. Convert DOM Subtree to Clean Markdown
  const markdownLines: string[] = [];
  walkDomToMarkdown(mainContainer, markdownLines);

  let markdownContent = markdownLines
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  if (markdownContent.length > MAX_MARKDOWN_BYTES) {
    markdownContent = markdownContent.slice(0, MAX_MARKDOWN_BYTES);
    warnings.push(`Extracted content was truncated to safety limit of ${MAX_MARKDOWN_BYTES} bytes`);
  }

  const isEmpty = markdownContent.length === 0;

  // 7. Compute Content Hash & Excerpt
  let contentHash: string | null = null;
  let textExcerpt: string | null = null;

  if (!isEmpty) {
    contentHash = createHash('sha256').update(markdownContent).digest('hex');
    textExcerpt = markdownContent.slice(0, 800).replace(/\s+/g, ' ').trim();
  }

  return {
    title,
    markdownContent,
    textExcerpt,
    contentHash,
    author,
    publisher,
    publishedDate,
    language,
    isBotChallenge: false,
    isEmpty,
    warnings,
  };
}

function getMetaContent(doc: Document, attrName: string, attrValue: string): string | null {
  const el = doc.querySelector(`meta[${attrName}="${attrValue}"]`);
  const content = el?.getAttribute('content')?.trim();
  return content && content.length > 0 ? content : null;
}

function parseIsoDateOrNull(dateStr: string | null): string | null {
  if (!dateStr) return null;
  try {
    const parsed = new Date(dateStr);
    if (isNaN(parsed.getTime())) return null;
    return parsed.toISOString();
  } catch {
    return null;
  }
}

/**
 * Traverses DOM tree and produces readable Markdown without raw HTML tags.
 */
function walkDomToMarkdown(node: Node, lines: string[]): void {
  if (node.nodeType === 3 /* TEXT_NODE */) {
    const text = node.textContent?.replace(/\s+/g, ' ');
    if (text && text.trim().length > 0) {
      lines.push(text.trim());
    }
    return;
  }

  if (node.nodeType !== 1 /* ELEMENT_NODE */) return;

  const el = node as HTMLElement;
  const tagName = el.tagName.toLowerCase();

  switch (tagName) {
    case 'h1': {
      const text = el.textContent?.trim();
      if (text) lines.push(`\n# ${text}\n`);
      break;
    }
    case 'h2': {
      const text = el.textContent?.trim();
      if (text) lines.push(`\n## ${text}\n`);
      break;
    }
    case 'h3': {
      const text = el.textContent?.trim();
      if (text) lines.push(`\n### ${text}\n`);
      break;
    }
    case 'h4':
    case 'h5':
    case 'h6': {
      const text = el.textContent?.trim();
      if (text) lines.push(`\n#### ${text}\n`);
      break;
    }
    case 'p': {
      const text = el.textContent?.trim();
      if (text) lines.push(`\n${text}\n`);
      break;
    }
    case 'li': {
      const text = el.textContent?.trim();
      if (text) lines.push(`- ${text}`);
      break;
    }
    case 'blockquote': {
      const text = el.textContent?.trim();
      if (text) lines.push(`\n> ${text}\n`);
      break;
    }
    case 'pre':
    case 'code': {
      const text = el.textContent?.trim();
      if (text) lines.push(`\n\`\`\`\n${text}\n\`\`\`\n`);
      break;
    }
    case 'table': {
      formatTableToMarkdown(el, lines);
      break;
    }
    default: {
      for (let i = 0; i < el.childNodes.length; i++) {
        const child = el.childNodes[i];
        if (child) walkDomToMarkdown(child, lines);
      }
      break;
    }
  }
}

function formatTableToMarkdown(tableEl: HTMLElement, lines: string[]): void {
  const rows = tableEl.querySelectorAll('tr');
  if (rows.length === 0) return;

  lines.push('\n');
  let isFirstRow = true;

  for (let r = 0; r < rows.length; r++) {
    const row = rows[r];
    if (!row) continue;
    const cells = row.querySelectorAll('th, td');
    if (cells.length === 0) continue;

    const cellTexts: string[] = [];
    for (let c = 0; c < cells.length; c++) {
      const text = cells[c]?.textContent?.replace(/[\r\n|]+/g, ' ').trim() || '';
      cellTexts.push(text);
    }

    lines.push(`| ${cellTexts.join(' | ')} |`);

    if (isFirstRow) {
      lines.push(`| ${cellTexts.map(() => '---').join(' | ')} |`);
      isFirstRow = false;
    }
  }
  lines.push('\n');
}

