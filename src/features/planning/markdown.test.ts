import { describe, expect, it } from 'vitest';
import { parseBlocks, parseInline, plainText } from './markdown';

/**
 * The Markdown reader behind the Plan view. The properties that matter are that nesting survives
 * (the plan's hierarchy lives in indented lists) and that nothing is silently dropped.
 */
describe('parseBlocks', () => {
  it('reads headings, paragraphs and lists', () => {
    const blocks = parseBlocks('# Plan\n\n## Objective\n\nShip it.\n\n- one\n- two\n');
    expect(blocks.map((b) => b.kind)).toEqual(['heading', 'heading', 'para', 'list']);
    expect(blocks[0]).toMatchObject({ level: 1, text: 'Plan' });
    expect(blocks[3]).toMatchObject({ kind: 'list', ordered: false });
  });

  it('nests an indented list under its parent item', () => {
    const blocks = parseBlocks('- Story 1\n  - Task A\n  - Task B\n- Story 2\n');
    const list = blocks[0];
    expect(list.kind === 'list' && list.items).toHaveLength(2);
    if (list.kind !== 'list') throw new Error('expected a list');
    const nested = list.items[0].blocks[0];
    expect(nested).toMatchObject({ kind: 'list' });
    if (nested.kind !== 'list') throw new Error('expected a nested list');
    expect(nested.items.map((i) => i.text)).toEqual(['Task A', 'Task B']);
    expect(list.items[1].text).toBe('Story 2');
  });

  it('keeps an ordered list ordered', () => {
    const blocks = parseBlocks('1. first\n2. second\n');
    expect(blocks[0]).toMatchObject({ kind: 'list', ordered: true });
  });

  it('reads a table into a header and rows', () => {
    const blocks = parseBlocks('| Risk | Impact |\n| --- | --- |\n| CORS | Requests fail |\n');
    expect(blocks[0]).toEqual({
      kind: 'table',
      header: ['Risk', 'Impact'],
      rows: [['CORS', 'Requests fail']],
    });
  });

  it('keeps a fenced code block verbatim, including its blank lines', () => {
    const blocks = parseBlocks('```json\n{\n\n  "a": 1\n}\n```\n');
    expect(blocks[0]).toEqual({ kind: 'code', lang: 'json', text: '{\n\n  "a": 1\n}' });
  });

  /** The guarantee the redesign rests on: unrecognised text is still text, never nothing. */
  it('keeps text it does not recognise', () => {
    const blocks = parseBlocks('Just a sentence with <weird> markup.\n');
    expect(blocks).toEqual([{ kind: 'para', text: 'Just a sentence with <weird> markup.' }]);
  });
});

describe('parseInline', () => {
  it('reads bold, italic and code', () => {
    expect(parseInline('**bold** and `code`')).toEqual([
      { kind: 'strong', children: [{ kind: 'text', text: 'bold' }] },
      { kind: 'text', text: ' and ' },
      { kind: 'code', text: 'code' },
    ]);
  });

  /** `DATABASE_URL` must not become "DATABASE<em>URL</em>" — plans are full of such names. */
  it('does not italicise the underscores in an environment variable name', () => {
    expect(plainText('Set DATABASE_URL_PRIMARY before boot')).toBe(
      'Set DATABASE_URL_PRIMARY before boot',
    );
    expect(parseInline('DATABASE_URL_PRIMARY').every((t) => t.kind === 'text')).toBe(true);
  });

  it('keeps a link it can render and flattens one it cannot', () => {
    expect(parseInline('[docs](https://example.com)')).toEqual([
      { kind: 'link', href: 'https://example.com', children: [{ kind: 'text', text: 'docs' }] },
    ]);
    const unsafe = parseInline('[x](javascript:alert(1))');
    expect(unsafe.some((token) => token.kind === 'link')).toBe(false);
    expect(plainText('[x](javascript:alert(1))')).toBe('[x](javascript:alert(1))');
  });

  it('reduces formatting to plain text for labels and slugs', () => {
    expect(plainText('**Epic 4** — `Task` Management')).toBe('Epic 4 — Task Management');
  });
});
