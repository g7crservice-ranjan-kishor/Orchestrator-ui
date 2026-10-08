import { Fragment, ReactNode } from 'react';
import { Block, Inline, parseInline } from './markdown';

/**
 * Renders parsed Markdown as ordinary typographic HTML — headings, paragraphs, lists, tables.
 *
 * Deliberately built on the parsed model rather than `dangerouslySetInnerHTML`: the plan is written
 * by an agent from a user-supplied requirement, so it is untrusted text. Nothing here can inject
 * markup, and link targets are restricted by the parser to http(s), mailto and in-page anchors.
 */

function renderInline(tokens: Inline[]): ReactNode {
  return tokens.map((token, i) => {
    switch (token.kind) {
      case 'text':
        return <Fragment key={i}>{token.text}</Fragment>;
      case 'code':
        return (
          <code key={i} className="md-code">
            {token.text}
          </code>
        );
      case 'strong':
        return <strong key={i}>{renderInline(token.children)}</strong>;
      case 'em':
        return <em key={i}>{renderInline(token.children)}</em>;
      case 'link':
        return (
          <a key={i} href={token.href} target="_blank" rel="noreferrer noopener">
            {renderInline(token.children)}
          </a>
        );
    }
  });
}

/** One line (or cell) of Markdown with its inline formatting applied. */
export function InlineText({ text }: { text: string }) {
  return <>{renderInline(parseInline(text))}</>;
}

function renderBlock(block: Block, key: number): ReactNode {
  switch (block.kind) {
    case 'para':
      return (
        <p key={key} className="md-p">
          {block.text.split('\n').map((line, i) => (
            <Fragment key={i}>
              {i > 0 && <br />}
              <InlineText text={line} />
            </Fragment>
          ))}
        </p>
      );

    case 'heading': {
      const Tag = `h${Math.min(block.level + 2, 6)}` as 'h4';
      return (
        <Tag key={key} className="md-h">
          <InlineText text={block.text} />
        </Tag>
      );
    }

    case 'list': {
      const Tag = block.ordered ? 'ol' : 'ul';
      return (
        <Tag key={key} className="md-list">
          {block.items.map((item, i) => (
            <li key={i}>
              <InlineText text={item.text} />
              {item.blocks.length > 0 && <Blocks blocks={item.blocks} />}
            </li>
          ))}
        </Tag>
      );
    }

    case 'code':
      return (
        <pre key={key} className="md-pre">
          <code>{block.text}</code>
        </pre>
      );

    case 'table':
      return (
        <div key={key} className="md-table-wrap">
          <table className="md-table">
            <thead>
              <tr>
                {block.header.map((cell, i) => (
                  <th key={i}>
                    <InlineText text={cell} />
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {block.rows.map((row, i) => (
                <tr key={i}>
                  {block.header.map((_, j) => (
                    <td key={j}>
                      <InlineText text={row[j] ?? ''} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );

    case 'quote':
      return (
        <blockquote key={key} className="md-quote">
          <Blocks blocks={block.blocks} />
        </blockquote>
      );

    case 'rule':
      return <hr key={key} className="md-rule" />;
  }
}

/** Renders a sequence of parsed blocks. */
export function Blocks({ blocks }: { blocks: Block[] }) {
  if (blocks.length === 0) return null;
  return <div className="md">{blocks.map(renderBlock)}</div>;
}
