import { ReactNode } from 'react';
import { CheckOutlined, DownOutlined } from '@ant-design/icons';
import { Blocks, InlineText } from './Prose';
import type { PlanSection } from './plan-model';

/** The small, shared pieces the Plan view is assembled from. */

/**
 * An expand/collapse panel. Built from a `<button>` rather than `<details>` so several panels can
 * be driven together ("Expand all") and so the open state survives re-renders of the plan.
 */
export function Disclosure({
  open,
  onToggle,
  head,
  className = '',
  children,
}: {
  open: boolean;
  onToggle: () => void;
  head: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={`pv-panel ${className} ${open ? 'is-open' : ''}`.trim()}>
      <button type="button" className="pv-panel-head" aria-expanded={open} onClick={onToggle}>
        <span className="pv-panel-head-main">{head}</span>
        <span className="pv-panel-toggle">
          <span className="pv-panel-toggle-text">{open ? 'Hide' : 'View details'}</span>
          <DownOutlined className="pv-chevron" aria-hidden />
        </span>
      </button>
      {open && <div className="pv-panel-body">{children}</div>}
    </div>
  );
}

/** Acceptance criteria as a checklist — one line per criterion, never a paragraph. */
export function Criteria({
  items,
  title = 'Acceptance criteria',
}: {
  items: string[];
  title?: string;
}) {
  if (items.length === 0) return null;
  return (
    <div className="pv-criteria-wrap">
      <h5 className="pv-label">
        {title} <span className="pv-count">{items.length}</span>
      </h5>
      <ul className="pv-criteria">
        {items.map((item, i) => (
          <li key={i}>
            <CheckOutlined className="pv-tick" aria-hidden />
            <span>
              <InlineText text={item} />
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** A labelled field — "Impact", "Objective" — kept short and scannable. */
export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="pv-field">
      <span className="pv-label">{label}</span>
      <div className="pv-field-value">{children}</div>
    </div>
  );
}

/** A section and everything nested inside it, as ordinary prose. */
export function SectionContent({ section }: { section: PlanSection }) {
  return (
    <>
      <Blocks blocks={section.blocks} />
      {section.children.map((child) => (
        <div key={child.id} className="pv-subsection">
          <h4 className="pv-subsection-title">
            <InlineText text={child.title} />
          </h4>
          <SectionContent section={child} />
        </div>
      ))}
    </>
  );
}

/** A key/value chip — how technical facts are shown instead of sentences. */
export function Chip({ label, value }: { label?: string; value: string }) {
  return (
    <span className="pv-chip">
      {label && <span className="pv-chip-label">{label}</span>}
      <InlineText text={value} />
    </span>
  );
}
