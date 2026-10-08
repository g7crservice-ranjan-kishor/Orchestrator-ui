/**
 * A small, dependency-free Markdown reader.
 *
 * The planning agent returns the plan as free-form Markdown, so the Plan view has to *understand*
 * it rather than print it. This module does the first half of that: turning text into blocks and
 * inline runs. {@link ./plan-model} does the second half — recognising what those blocks mean.
 *
 * The one rule that matters: **nothing is ever dropped.** Anything unrecognised falls through to a
 * paragraph, so a plan written in a shape we did not anticipate still renders in full, just without
 * the richer treatment.
 */

/** An inline run inside a paragraph, list item or table cell. */
export type Inline =
  | { kind: 'text'; text: string }
  | { kind: 'code'; text: string }
  | { kind: 'strong'; children: Inline[] }
  | { kind: 'em'; children: Inline[] }
  | { kind: 'link'; href: string; children: Inline[] };

/** One item of a bullet or numbered list; `blocks` holds anything nested beneath it. */
export interface ListItem {
  text: string;
  blocks: Block[];
}

/** A block-level piece of a document. */
export type Block =
  | { kind: 'para'; text: string }
  | { kind: 'heading'; level: number; text: string }
  | { kind: 'list'; ordered: boolean; items: ListItem[] }
  | { kind: 'code'; lang: string; text: string }
  | { kind: 'table'; header: string[]; rows: string[][] }
  | { kind: 'quote'; blocks: Block[] }
  | { kind: 'rule' };

const HEADING = /^(#{1,6})\s+(.*)$/;
const FENCE = /^(```|~~~)(.*)$/;
const BULLET = /^(\s*)([-*+]|\d+[.)])\s+(.*)$/;
const RULE = /^\s*([-*_])\s*(\1\s*){2,}$/;

function indentOf(line: string): number {
  return line.length - line.trimStart().length;
}

function isTableSeparator(line: string): boolean {
  return line.includes('|') && line.includes('-') && /^[\s|:-]+$/.test(line);
}

function isTableStart(lines: string[], i: number): boolean {
  return (
    lines[i].includes('|') &&
    i + 1 < lines.length &&
    isTableSeparator(lines[i + 1]) &&
    !isTableSeparator(lines[i])
  );
}

/** Splits `| a | b |` into cells, tolerating the optional leading and trailing pipes. */
function tableCells(line: string): string[] {
  return line
    .trim()
    .replace(/^\|/, '')
    .replace(/\|$/, '')
    .split('|')
    .map((cell) => cell.trim());
}

/** True when the line begins some other block, so a paragraph must stop before it. */
function startsBlock(lines: string[], i: number): boolean {
  const line = lines[i];
  return (
    !line.trim() ||
    HEADING.test(line) ||
    FENCE.test(line.trim()) ||
    BULLET.test(line) ||
    RULE.test(line) ||
    line.trimStart().startsWith('>') ||
    isTableStart(lines, i)
  );
}

/** Removes the shared leading whitespace from a list item's continuation lines. */
function dedent(lines: string[]): string[] {
  const widths = lines.filter((l) => l.trim()).map(indentOf);
  const common = widths.length > 0 ? Math.min(...widths) : 0;
  return lines.map((line) => line.slice(common));
}

function parseList(chunk: string[]): Block {
  const base = indentOf(chunk[0]);
  const ordered = /\d/.test(BULLET.exec(chunk[0])![2]);
  const raw: { first: string; rest: string[] }[] = [];

  for (const line of chunk) {
    const bullet = BULLET.exec(line);
    if (bullet && indentOf(line) <= base) {
      raw.push({ first: bullet[3], rest: [] });
    } else if (raw.length > 0) {
      raw[raw.length - 1].rest.push(line);
    }
  }

  const items: ListItem[] = raw.map(({ first, rest }) => {
    const blocks = parseLines([first, ...dedent(rest)]);
    // The item's own text is its first paragraph; everything else nests beneath it.
    if (blocks[0]?.kind === 'para') {
      return { text: blocks[0].text, blocks: blocks.slice(1) };
    }
    return { text: '', blocks };
  });

  return { kind: 'list', ordered, items };
}

function parseLines(lines: string[]): Block[] {
  const blocks: Block[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    if (!line.trim()) {
      i += 1;
      continue;
    }

    const fence = FENCE.exec(line.trim());
    if (fence) {
      const closing = fence[1];
      const body: string[] = [];
      i += 1;
      while (i < lines.length && !lines[i].trim().startsWith(closing)) {
        body.push(lines[i]);
        i += 1;
      }
      i += 1; // the closing fence (or the end of the input)
      blocks.push({ kind: 'code', lang: fence[2].trim(), text: body.join('\n') });
      continue;
    }

    const heading = HEADING.exec(line);
    if (heading) {
      blocks.push({ kind: 'heading', level: heading[1].length, text: heading[2].trim() });
      i += 1;
      continue;
    }

    if (RULE.test(line)) {
      blocks.push({ kind: 'rule' });
      i += 1;
      continue;
    }

    if (line.trimStart().startsWith('>')) {
      const quoted: string[] = [];
      while (i < lines.length && lines[i].trimStart().startsWith('>')) {
        quoted.push(lines[i].trimStart().replace(/^>\s?/, ''));
        i += 1;
      }
      blocks.push({ kind: 'quote', blocks: parseLines(quoted) });
      continue;
    }

    if (isTableStart(lines, i)) {
      const header = tableCells(lines[i]);
      i += 2; // the header and its separator
      const rows: string[][] = [];
      while (i < lines.length && lines[i].includes('|') && lines[i].trim()) {
        rows.push(tableCells(lines[i]));
        i += 1;
      }
      blocks.push({ kind: 'table', header, rows });
      continue;
    }

    if (BULLET.test(line)) {
      const base = indentOf(line);
      const chunk: string[] = [];
      while (i < lines.length) {
        const current = lines[i];
        const isItem = BULLET.test(current);
        const isContinuation = current.trim() !== '' && indentOf(current) > base;
        const isBlankInsideList =
          !current.trim() &&
          i + 1 < lines.length &&
          lines[i + 1].trim() !== '' &&
          (indentOf(lines[i + 1]) > base || BULLET.test(lines[i + 1]));
        if (!isItem && !isContinuation && !isBlankInsideList) break;
        chunk.push(current);
        i += 1;
      }
      blocks.push(parseList(chunk));
      continue;
    }

    const paragraph: string[] = [lines[i]];
    i += 1;
    while (i < lines.length && !startsBlock(lines, i)) {
      paragraph.push(lines[i]);
      i += 1;
    }
    blocks.push({ kind: 'para', text: paragraph.join('\n').trim() });
  }

  return blocks;
}

/** Reads a Markdown document into blocks. */
export function parseBlocks(markdown: string): Block[] {
  return parseLines(markdown.replace(/\r\n?/g, '\n').split('\n'));
}

const INLINE =
  /(`+)([\s\S]*?)\1|\*\*([\s\S]+?)\*\*|__([\s\S]+?)__|\*([^*\n]+?)\*|(?<![A-Za-z0-9])_([^_\n]+?)_(?![A-Za-z0-9])|\[([^\]]*)\]\(([^)\s]+)(?:\s+"[^"]*")?\)/;

/** Only link targets that cannot execute script; anything else renders as plain text. */
function safeHref(href: string): string | null {
  return /^(https?:\/\/|mailto:|#|\/)/i.test(href) ? href : null;
}

/** Reads the inline formatting of one line of text. */
export function parseInline(text: string): Inline[] {
  const tokens: Inline[] = [];
  let rest = text;

  const push = (value: string) => {
    if (value) tokens.push({ kind: 'text', text: value });
  };

  for (let match = INLINE.exec(rest); match; match = INLINE.exec(rest)) {
    push(rest.slice(0, match.index));
    const [full, , code, strongStars, strongUnderscores, emStar, emUnderscore, linkText, href] =
      match;

    if (code !== undefined) {
      tokens.push({ kind: 'code', text: code.trim() });
    } else if (strongStars ?? strongUnderscores) {
      tokens.push({ kind: 'strong', children: parseInline(strongStars ?? strongUnderscores) });
    } else if (emStar ?? emUnderscore) {
      tokens.push({ kind: 'em', children: parseInline(emStar ?? emUnderscore) });
    } else {
      const safe = href ? safeHref(href) : null;
      if (safe) {
        tokens.push({ kind: 'link', href: safe, children: parseInline(linkText) });
      } else {
        push(full);
      }
    }
    rest = rest.slice(match.index + full.length);
  }

  push(rest);
  return tokens;
}

function flatten(tokens: Inline[]): string {
  return tokens
    .map((token) =>
      token.kind === 'text' || token.kind === 'code' ? token.text : flatten(token.children),
    )
    .join('');
}

/** The plain text of an inline string — used for slugs, labels and comparisons. */
export function plainText(text: string): string {
  return flatten(parseInline(text)).trim();
}
