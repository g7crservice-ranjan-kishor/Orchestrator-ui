import { useState } from 'react';
import { Blocks, InlineText } from './Prose';
import { Criteria, Disclosure, SectionContent } from './PlanElements';
import type { PhaseNode, WorkKind, WorkNode } from './plan-model';

/** The hierarchy: Phase → Epic → Feature → Story → Task, as nested expandable cards. */

const KIND_LABEL: Record<WorkKind, string> = {
  epic: 'Epic',
  feature: 'Feature',
  story: 'Story',
  task: 'Task',
  item: 'Item',
};

const KIND_PLURAL: Record<WorkKind, string> = {
  epic: 'epics',
  feature: 'features',
  story: 'stories',
  task: 'tasks',
  item: 'items',
};

/** "1 story", "4 stories", "1 criterion", "3 criteria". */
function count(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

/** How many descendants of one kind a node has — the "4 tasks" line on a collapsed card. */
function countKind(nodes: WorkNode[], kind: WorkKind): number {
  return nodes.reduce(
    (total, node) => total + (node.kind === kind ? 1 : 0) + countKind(node.children, kind),
    0,
  );
}

function summarise(nodes: WorkNode[]): string[] {
  const parts: string[] = [];
  for (const kind of ['epic', 'feature', 'story', 'task'] as const) {
    const total = countKind(nodes, kind);
    if (total > 0) parts.push(count(total, KIND_LABEL[kind].toLowerCase(), KIND_PLURAL[kind]));
  }
  return parts;
}

function hasDetail(node: WorkNode): boolean {
  return node.blocks.length > 0 || node.acceptance.length > 0 || node.children.length > 0;
}

/**
 * The numbering, without the kind word the chip beside it already shows — otherwise an Epic
 * reads "Epic" "Epic 1". Returns null when the label carried nothing but the kind.
 */
function refLabel(node: WorkNode): string | null {
  if (!node.label) return null;
  const rest = node.label.replace(new RegExp(`^${node.kind}\\s*`, 'i'), '').trim();
  return rest || null;
}

function WorkItem({ node }: { node: WorkNode }) {
  const [open, setOpen] = useState(false);
  const ref = refLabel(node);

  const head = (
    <>
      <span className="pv-work-line">
        <span className={`pv-kind pv-kind-${node.kind}`}>{KIND_LABEL[node.kind]}</span>
        {ref && <span className="pv-ref">{ref}</span>}
        <span className="pv-work-title">
          <InlineText text={node.title} />
        </span>
      </span>
      {(summarise(node.children).length > 0 || node.acceptance.length > 0) && (
        <span className="pv-work-meta">
          {summarise(node.children).map((part) => (
            <span key={part}>{part}</span>
          ))}
          {node.acceptance.length > 0 && (
            <span>{count(node.acceptance.length, 'criterion', 'criteria')}</span>
          )}
        </span>
      )}
    </>
  );

  if (!hasDetail(node)) {
    return (
      <li className="pv-work pv-work-plain">
        <div className="pv-work-static">{head}</div>
      </li>
    );
  }

  return (
    <li className="pv-work">
      <Disclosure
        className="pv-work-panel"
        open={open}
        onToggle={() => setOpen((v) => !v)}
        head={head}
      >
        <Blocks blocks={node.blocks} />
        <Criteria items={node.acceptance} />
        <WorkList nodes={node.children} />
      </Disclosure>
    </li>
  );
}

/** A list of work items at one level of the hierarchy. */
export function WorkList({ nodes }: { nodes: WorkNode[] }) {
  if (nodes.length === 0) return null;
  return (
    <ul className="pv-work-list">
      {nodes.map((node) => (
        <WorkItem key={node.id} node={node} />
      ))}
    </ul>
  );
}

/** One delivery phase: a collapsed card summarising it, expanding to the full detail. */
export function PhaseCard({
  phase,
  index,
  open,
  onToggle,
}: {
  phase: PhaseNode;
  index: number;
  open: boolean;
  onToggle: () => void;
}) {
  const meta = summarise(phase.work);
  if (phase.acceptance.length > 0) {
    meta.push(count(phase.acceptance.length, 'criterion', 'criteria'));
  }

  return (
    <Disclosure
      className="pv-phase"
      open={open}
      onToggle={onToggle}
      head={
        <>
          <span className="pv-phase-top">
            <span className="pv-phase-index">{index}</span>
            <span>
              <span className="pv-phase-title">
                {phase.label && <span className="pv-ref pv-ref-phase">{phase.label} </span>}
                <InlineText text={phase.title} />
              </span>
              {phase.summary && (
                <span className="pv-phase-summary">
                  <InlineText text={phase.summary.split('\n')[0]} />
                </span>
              )}
            </span>
          </span>
          {meta.length > 0 && (
            <span className="pv-work-meta">
              {meta.map((part) => (
                <span key={part}>{part}</span>
              ))}
            </span>
          )}
        </>
      }
    >
      <Blocks blocks={phase.blocks} />
      {phase.sections.map((section) => (
        <div key={section.id} className="pv-subsection">
          <h4 className="pv-subsection-title">
            <InlineText text={section.title} />
          </h4>
          <SectionContent section={section} />
        </div>
      ))}
      {phase.work.length > 0 && (
        <div className="pv-subsection">
          <h4 className="pv-subsection-title">Work in this phase</h4>
          <WorkList nodes={phase.work} />
        </div>
      )}
      <Criteria items={phase.acceptance} />
    </Disclosure>
  );
}
