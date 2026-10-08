/**
 * Reads the planning agent's Markdown into the shape the Plan view renders.
 *
 * The agent is prompted for Objective / Scope / Phases / Risks / Breakdown (see the worker's
 * `em.md`), but it writes prose, not JSON — headings vary, hierarchies are sometimes headings and
 * sometimes nested lists. So this module recognises rather than requires: each top-level section is
 * classified by what it is called, and anything unrecognised is kept and rendered as-is under
 * "Additional detail". **No part of the plan is ever discarded** — the view is a different
 * presentation of the same text, not a summary of it.
 */

import { Block, ListItem, parseBlocks, plainText } from './markdown';

/** A heading and everything beneath it, nested by heading level. */
export interface PlanSection {
  id: string;
  title: string;
  level: number;
  blocks: Block[];
  children: PlanSection[];
}

/** Where a node sits in the Epic → Feature → Story → Task hierarchy. */
export type WorkKind = 'epic' | 'feature' | 'story' | 'task' | 'item';

/** One node of the work breakdown, however the agent expressed it (headings or nested lists). */
export interface WorkNode {
  id: string;
  kind: WorkKind;
  /** The numbering the agent used — "Epic 4", "Story 4.1.1" — shown as a chip. */
  label: string | null;
  title: string;
  /** Everything under the node except its acceptance criteria. */
  blocks: Block[];
  acceptance: string[];
  children: WorkNode[];
}

/** One delivery phase. */
export interface PhaseNode {
  id: string;
  label: string | null;
  title: string;
  /** First paragraph — the one-line "what this phase does" shown on the collapsed card. */
  summary: string | null;
  blocks: Block[];
  acceptance: string[];
  work: WorkNode[];
  sections: PlanSection[];
}

/** A repository the plan names, with its technical facts as chips rather than prose. */
export interface RepoCard {
  id: string;
  name: string;
  role: string | null;
  chips: { label: string; value: string }[];
  blocks: Block[];
}

export interface RiskCard {
  id: string;
  title: string;
  impact: string | null;
  mitigation: string | null;
  blocks: Block[];
}

export interface PlanStats {
  phases: number;
  epics: number;
  features: number;
  stories: number;
  tasks: number;
}

export interface PlanScope {
  section: PlanSection;
  inScope: string[];
  outOfScope: string[];
  /** Anything in the Scope section that was neither list — kept so nothing is lost. */
  extra: Block[];
}

export interface ParsedPlan {
  title: string | null;
  intro: Block[];
  objective: PlanSection | null;
  scope: PlanScope | null;
  repositories: RepoCard[];
  repositoriesLead: Block[];
  hasRepositoriesSection: boolean;
  phases: PhaseNode[];
  phasesLead: Block[];
  epics: WorkNode[];
  epicsLead: Block[];
  risks: RiskCard[];
  risksLead: Block[];
  technical: PlanSection[];
  credentials: PlanSection | null;
  other: PlanSection[];
  stats: PlanStats;
}

/* -- section tree ----------------------------------------------------------------------------- */

/** Stable, unique DOM ids for anchors and accordion state. */
class Slugger {
  private readonly seen = new Map<string, number>();

  next(text: string, fallback = 'section'): string {
    const base =
      plainText(text)
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 48) || fallback;
    const count = (this.seen.get(base) ?? 0) + 1;
    this.seen.set(base, count);
    return count === 1 ? base : `${base}-${count}`;
  }
}

function buildSections(
  blocks: Block[],
  slugger: Slugger,
): { title: string | null; intro: Block[]; sections: PlanSection[] } {
  let rest = blocks;
  let title: string | null = null;

  if (rest[0]?.kind === 'heading' && rest[0].level === 1) {
    title = rest[0].text;
    rest = rest.slice(1);
  }

  const levels = rest.filter((b): b is Block & { kind: 'heading' } => b.kind === 'heading');
  const sectionLevel = levels.length > 0 ? Math.min(...levels.map((h) => h.level)) : 2;

  const root: PlanSection = {
    id: 'root',
    title: '',
    level: sectionLevel - 1,
    blocks: [],
    children: [],
  };
  const stack: PlanSection[] = [root];

  for (const block of rest) {
    if (block.kind === 'heading' && block.level >= sectionLevel) {
      while (stack.length > 1 && stack[stack.length - 1].level >= block.level) stack.pop();
      const node: PlanSection = {
        id: slugger.next(block.text),
        title: block.text,
        level: block.level,
        blocks: [],
        children: [],
      };
      stack[stack.length - 1].children.push(node);
      stack.push(node);
    } else {
      stack[stack.length - 1].blocks.push(block);
    }
  }

  return { title, intro: root.blocks, sections: root.children };
}

/* -- small block utilities -------------------------------------------------------------------- */

function firstParagraph(blocks: Block[]): string | null {
  const para = blocks.find((b) => b.kind === 'para');
  return para && para.kind === 'para' ? para.text : null;
}

function firstList(blocks: Block[]): ListItem[] | null {
  const list = blocks.find((b) => b.kind === 'list');
  return list && list.kind === 'list' ? list.items : null;
}

/** Turns a list into plain strings, keeping any nested detail as an appended clause. */
function itemTexts(items: ListItem[]): string[] {
  return items.map((item) => item.text).filter((text) => text.trim() !== '');
}

const LABEL = (word: RegExp) =>
  new RegExp(`^\\s*(?:\\*\\*|__)?\\s*(?:${word.source})\\s*(?:\\*\\*|__)?\\s*[:：-]\\s*(.*)$`, 'i');

/**
 * Pulls a `Label: value` line out of a set of blocks, whether it was written as a paragraph or as
 * a bullet. Returns the value and the blocks with that line removed, so it is shown once, in its
 * own field, rather than twice.
 */
function liftLabeled(blocks: Block[], word: RegExp): { value: string | null; rest: Block[] } {
  const pattern = LABEL(word);
  const rest: Block[] = [];
  let value: string | null = null;

  for (const block of blocks) {
    if (value === null && block.kind === 'para') {
      const match = pattern.exec(block.text.split('\n')[0]);
      if (match) {
        const lines = block.text.split('\n');
        value = [match[1], ...lines.slice(1)].join(' ').trim();
        continue;
      }
    }
    if (block.kind === 'list') {
      const kept: ListItem[] = [];
      for (const item of block.items) {
        const match = value === null ? pattern.exec(item.text) : null;
        if (match) {
          value = [match[1], ...itemTexts(firstList(item.blocks) ?? [])].join(' ').trim();
        } else {
          kept.push(item);
        }
      }
      if (kept.length !== block.items.length) {
        if (kept.length > 0) rest.push({ ...block, items: kept });
        continue;
      }
    }
    rest.push(block);
  }

  return { value, rest };
}

const ACCEPTANCE = /acceptance\s+criteri(?:a|on)|acceptance\s+tests?/i;

/**
 * Lifts acceptance criteria into a checklist. The agent writes them either as a labelled paragraph
 * followed by a list, as a heading followed by a list, or as a bullet with a nested list — all
 * three appear in practice, so all three are handled.
 */
function liftAcceptance(blocks: Block[]): { acceptance: string[]; rest: Block[] } {
  const acceptance: string[] = [];
  const rest: Block[] = [];

  for (let i = 0; i < blocks.length; i += 1) {
    const block = blocks[i];
    const isLabel =
      (block.kind === 'para' && ACCEPTANCE.test(block.text) && block.text.length < 120) ||
      (block.kind === 'heading' && ACCEPTANCE.test(block.text));
    if (isLabel && blocks[i + 1]?.kind === 'list') {
      const next = blocks[i + 1];
      if (next.kind === 'list') acceptance.push(...itemTexts(next.items));
      i += 1;
      continue;
    }

    if (block.kind === 'list') {
      const kept: ListItem[] = [];
      for (const item of block.items) {
        const nested = firstList(item.blocks);
        if (ACCEPTANCE.test(item.text) && item.text.length < 120 && nested) {
          acceptance.push(...itemTexts(nested));
        } else {
          kept.push(item);
        }
      }
      if (kept.length !== block.items.length) {
        if (kept.length > 0) rest.push({ ...block, items: kept });
        continue;
      }
    }

    rest.push(block);
  }

  return { acceptance, rest };
}

/* -- classification --------------------------------------------------------------------------- */

type SectionKind =
  | 'objective'
  | 'scope'
  | 'repositories'
  | 'phases'
  | 'breakdown'
  | 'risks'
  | 'credentials'
  | 'technical'
  | 'other';

const SECTION_MATCHERS: [SectionKind, RegExp][] = [
  ['credentials', /credential|secret/i],
  ['scope', /\bscope\b/i],
  ['repositories', /^(repositor|repos\b|code ?base)/i],
  ['phases', /\b(phases?|milestones?|roadmap|delivery plan|iterations?|sprints?)\b/i],
  ['breakdown', /\b(breakdown|epics?|backlog|user stories|stories)\b/i],
  ['risks', /\b(risks?|assumptions?|constraints?|open questions?|considerations?)\b/i],
  ['objective', /^(objective|goal|purpose|overview|summary|context|problem|background)/i],
  [
    'technical',
    /\b(technical|architecture|api|contract|data ?(?:base|model)|schema|security|deploy|release|test|observability|monitoring|non-?functional|nfr|stack|tooling|ci\/cd|environments?|performance)\b/i,
  ],
];

const PHASE_HEADING = /^\s*(?:\*\*)?phase\b/i;

function classify(section: PlanSection): SectionKind {
  const title = plainText(section.title);
  if (PHASE_HEADING.test(title)) return 'phases';
  for (const [kind, pattern] of SECTION_MATCHERS) {
    if (pattern.test(title)) return kind;
  }
  return 'other';
}

/* -- work breakdown --------------------------------------------------------------------------- */

const KIND_BY_DEPTH: WorkKind[] = ['epic', 'feature', 'story', 'task'];
const WORK_LABEL = /^\s*(epic|feature|story|task|user story|pbi)\s*([\w.]*)\s*[—–:.)-]?\s*(.*)$/i;

/** True when a bullet reads like a work item rather than a sentence of prose. */
function looksLikeWork(text: string): boolean {
  return WORK_LABEL.test(plainText(text));
}

function splitLabel(title: string): { label: string | null; title: string; kind: WorkKind | null } {
  const plain = plainText(title);
  const match = WORK_LABEL.exec(plain);
  if (!match || !match[3]) return { label: null, title: plain, kind: null };
  const word = match[1].toLowerCase();
  const kind: WorkKind =
    word === 'user story' || word === 'pbi' ? 'story' : ((word as WorkKind) ?? 'item');
  const number = match[2] ? ` ${match[2].replace(/[.)]$/, '')}` : '';
  return {
    label: `${match[1][0].toUpperCase()}${match[1].slice(1)}${number}`.trim(),
    title: match[3].trim(),
    kind,
  };
}

/**
 * A paragraph that is wholly bold and names a work item — `**Epic 1: Backend foundation**` —
 * is a parent for the list that follows it. Agents write breakdowns this way far more often
 * than with real headings. The wholly-bold test matters: `looksLikeWork` alone would also
 * accept an ordinary sentence opening with "Tasks are owned by...".
 */
const BOLD_ONLY = /^\s*\*\*(.+)\*\*\s*$/;

function isWorkParent(block: Block): block is Block & { kind: 'para' } {
  return block.kind === 'para' && BOLD_ONLY.test(block.text) && looksLikeWork(block.text);
}

/**
 * Reads a run of blocks into work nodes, attaching each list to the bold parent above it.
 *
 * This replaces taking only the *first* list, which quietly made one epic's children the whole
 * tree: every later epic became loose prose, and the summary chips showed that one epic's
 * features as if they were the plan.
 */
function collectWork(
  blocks: Block[],
  depth: number,
  slugger: Slugger,
): { nodes: WorkNode[]; lead: Block[] } {
  const nodes: WorkNode[] = [];
  const lead: Block[] = [];
  let parent: WorkNode | null = null;

  for (const block of blocks) {
    if (isWorkParent(block)) {
      parent = toWorkNode(block.text, [], depth, slugger);
      nodes.push(parent);
    } else if (block.kind === 'list' && block.items.some((item) => looksLikeWork(item.text))) {
      const children = workFromList(block.items, parent ? depth + 1 : depth, slugger);
      if (parent) parent.children.push(...children);
      else nodes.push(...children);
    } else if (parent) {
      parent.blocks.push(block);
    } else {
      lead.push(block);
    }
  }
  return { nodes, lead };
}

function workFromList(items: ListItem[], depth: number, slugger: Slugger): WorkNode[] {
  return items.map((item) => toWorkNode(item.text, item.blocks, depth, slugger));
}

function toWorkNode(title: string, body: Block[], depth: number, slugger: Slugger): WorkNode {
  const { label, title: name, kind } = splitLabel(title);
  const { acceptance, rest } = liftAcceptance(body);

  // Children come from nested work lists (and the bold parents above them); a list of plain
  // prose stays a list.
  const { nodes: children, lead: blocks } = collectWork(rest, depth + 1, slugger);

  return {
    id: slugger.next(name || title, 'item'),
    kind: kind ?? KIND_BY_DEPTH[depth] ?? 'item',
    label,
    title: name || plainText(title),
    blocks,
    acceptance,
    children,
  };
}

function sectionToWorkNode(section: PlanSection, depth: number, slugger: Slugger): WorkNode {
  const node = toWorkNode(section.title, section.blocks, depth, slugger);
  const childNodes = section.children.map((child) => sectionToWorkNode(child, depth + 1, slugger));
  return { ...node, id: section.id, children: [...node.children, ...childNodes] };
}

/** Reads a breakdown section into Epic → Feature → Story → Task, from headings or from lists. */
function toWorkTree(section: PlanSection, slugger: Slugger): { nodes: WorkNode[]; lead: Block[] } {
  if (section.children.length > 0) {
    return {
      nodes: section.children.map((child) => sectionToWorkNode(child, 0, slugger)),
      lead: section.blocks,
    };
  }

  return collectWork(section.blocks, 0, slugger);
}

/* -- phases ----------------------------------------------------------------------------------- */

const PHASE_CONTENT = /^(objective|goal|summary|purpose|outcome|deliverable)/i;

function toPhaseNode(section: PlanSection, slugger: Slugger): PhaseNode {
  const { label, title } = splitPhaseLabel(section.title);
  const { acceptance: ownAcceptance, rest } = liftAcceptance(section.blocks);

  const acceptance = [...ownAcceptance];
  const work: WorkNode[] = [];
  const sections: PlanSection[] = [];
  const blocks: Block[] = [...rest];

  for (const child of section.children) {
    const childTitle = plainText(child.title);
    if (ACCEPTANCE.test(childTitle)) {
      acceptance.push(...itemTexts(firstList(child.blocks) ?? []));
      const { acceptance: nested, rest: leftovers } = liftAcceptance(child.blocks);
      acceptance.push(...nested);
      if (leftovers.some((b) => b.kind !== 'list')) {
        sections.push({ ...child, blocks: leftovers.filter((b) => b.kind !== 'list') });
      }
    } else if (looksLikeWork(childTitle)) {
      work.push(sectionToWorkNode(child, 0, slugger));
    } else {
      sections.push(child);
    }
  }

  // A phase written as prose often lists its stories as bullets rather than as sub-headings.
  const keptBlocks: Block[] = [];
  for (const block of blocks) {
    if (block.kind === 'list' && block.items.some((item) => looksLikeWork(item.text))) {
      work.push(...workFromList(block.items, 0, slugger));
    } else {
      keptBlocks.push(block);
    }
  }

  const objectiveSection = sections.find((s) => PHASE_CONTENT.test(plainText(s.title)));
  const summary =
    firstParagraph(keptBlocks) ??
    (objectiveSection ? firstParagraph(objectiveSection.blocks) : null) ??
    null;

  return {
    id: section.id,
    label,
    title,
    summary,
    blocks: keptBlocks,
    acceptance,
    work,
    sections,
  };
}

function splitPhaseLabel(title: string): { label: string | null; title: string } {
  const plain = plainText(title);
  const match = /^\s*(phase\s*[\w.]*)\s*[—–:-]?\s*(.*)$/i.exec(plain);
  if (!match) return { label: null, title: plain };
  return { label: match[1].trim(), title: (match[2] || plain).trim() };
}

function toPhases(
  sections: PlanSection[],
  slugger: Slugger,
): { phases: PhaseNode[]; lead: Block[] } {
  const phases: PhaseNode[] = [];
  const lead: Block[] = [];

  for (const section of sections) {
    if (PHASE_HEADING.test(plainText(section.title)) || section.children.length > 0) {
      // A "Phases" container: its children are the phases. A "Phase 1" heading is one itself.
      if (PHASE_HEADING.test(plainText(section.title))) {
        phases.push(toPhaseNode(section, slugger));
      } else {
        lead.push(...section.blocks);
        phases.push(...section.children.map((child) => toPhaseNode(child, slugger)));
      }
      continue;
    }

    // No sub-headings: phases were written as a list.
    let consumed = false;
    for (const block of section.blocks) {
      if (!consumed && block.kind === 'list' && block.items.length > 0) {
        for (const item of block.items) {
          const { label, title } = splitPhaseLabel(item.text);
          const { acceptance, rest } = liftAcceptance(item.blocks);
          const work: WorkNode[] = [];
          const keptBlocks: Block[] = [];
          for (const inner of rest) {
            if (inner.kind === 'list' && inner.items.some((i) => looksLikeWork(i.text))) {
              work.push(...workFromList(inner.items, 0, slugger));
            } else {
              keptBlocks.push(inner);
            }
          }
          phases.push({
            id: slugger.next(title, 'phase'),
            label,
            title,
            summary: firstParagraph(keptBlocks),
            blocks: keptBlocks,
            acceptance,
            work,
            sections: [],
          });
        }
        consumed = true;
      } else {
        lead.push(block);
      }
    }
  }

  return { phases, lead };
}

/* -- scope, repositories, risks ---------------------------------------------------------------- */

const IN_SCOPE = /^(in[-\s]?scope|included)\b/i;
const OUT_SCOPE = /^(out[-\s]?of[-\s]?scope|out[-\s]?scope|excluded|not in scope|non-goals?)\b/i;

/**
 * Which of the two lists a label introduces, if either.
 *
 * The agent usually qualifies the label rather than writing it bare — `**Out of scope** (keeps the
 * app "simple" per the requirement; candidate fast-follows)` — so a trailing parenthetical aside
 * and a trailing colon are removed before it is judged. The length check that follows is what
 * stops an ordinary sentence that merely begins "Included ..." from being read as a label.
 */
function scopeTargetOf(text: string): 'in' | 'out' | null {
  const label = plainText(text)
    .replace(/\s*\([^)]*\)\s*$/, '')
    .replace(/[:：]\s*$/, '')
    .trim();
  if (label.length === 0 || label.length > 40) return null;
  if (OUT_SCOPE.test(label)) return 'out';
  if (IN_SCOPE.test(label)) return 'in';
  return null;
}

function toScope(section: PlanSection): PlanScope {
  const inScope: string[] = [];
  const outOfScope: string[] = [];
  const extra: Block[] = [];

  for (const child of section.children) {
    const items = itemTexts(firstList(child.blocks) ?? []);
    const where = scopeTargetOf(child.title);
    const target = where === 'out' ? outOfScope : where === 'in' ? inScope : null;
    if (target && items.length > 0) {
      target.push(...items);
      extra.push(...child.blocks.filter((b) => b.kind !== 'list'));
    } else {
      extra.push({ kind: 'heading', level: 3, text: child.title }, ...child.blocks);
    }
  }

  // Or written as two labelled bullets / paragraphs inside one section.
  let pending: string[] | null = null;
  for (const block of section.blocks) {
    if (block.kind === 'para') {
      const where = scopeTargetOf(block.text);
      if (where) {
        // A label on a line of its own: the list that follows belongs to it.
        pending = where === 'out' ? outOfScope : inScope;
        continue;
      }
      pending = null;
      extra.push(block);
      continue;
    }

    if (block.kind === 'list') {
      const unlabelled: ListItem[] = [];
      for (const item of block.items) {
        const nested = firstList(item.blocks);
        const where = scopeTargetOf(item.text);
        const target = where === 'out' ? outOfScope : where === 'in' ? inScope : null;
        if (target && nested) {
          target.push(...itemTexts(nested));
        } else if (pending) {
          pending.push(item.text);
        } else {
          unlabelled.push(item);
        }
      }
      if (unlabelled.length === block.items.length && !pending) {
        // A single unlabelled list under "Scope" is what is in scope.
        if (inScope.length === 0 && outOfScope.length === 0) {
          inScope.push(...itemTexts(block.items));
        } else {
          extra.push(block);
        }
      } else if (unlabelled.length > 0) {
        extra.push({ ...block, items: unlabelled });
      }
      pending = null;
      continue;
    }

    extra.push(block);
  }

  return { section, inScope, outOfScope, extra };
}

const CHIP = /^([A-Za-z][\w /.+-]{1,26})\s*[:：]\s*(.+)$/;

function chipsFrom(blocks: Block[]): { chips: { label: string; value: string }[]; rest: Block[] } {
  const chips: { label: string; value: string }[] = [];
  const rest: Block[] = [];

  for (const block of blocks) {
    if (block.kind === 'list') {
      const kept: ListItem[] = [];
      for (const item of block.items) {
        const match = CHIP.exec(plainText(item.text));
        if (match && item.blocks.length === 0) {
          chips.push({ label: match[1].trim(), value: match[2].trim() });
        } else {
          kept.push(item);
        }
      }
      if (kept.length !== block.items.length) {
        if (kept.length > 0) rest.push({ ...block, items: kept });
        continue;
      }
    }
    rest.push(block);
  }

  return { chips, rest };
}

function toRepos(section: PlanSection, slugger: Slugger): { repos: RepoCard[]; lead: Block[] } {
  const repos: RepoCard[] = [];
  const lead: Block[] = [];

  const fromParts = (name: string, role: string | null, blocks: Block[]): RepoCard => {
    const { chips, rest } = chipsFrom(blocks);
    const { value: roleLabel, rest: withoutRole } = liftLabeled(rest, /(?:role|type|purpose)/);
    return {
      id: slugger.next(name, 'repo'),
      name,
      role: role ?? roleLabel ?? firstParagraph(withoutRole),
      chips,
      blocks: withoutRole.filter((b) => b.kind !== 'para' || b.text !== (role ?? '')),
    };
  };

  if (section.children.length > 0) {
    for (const child of section.children) {
      const { name, role } = splitRepoTitle(child.title);
      repos.push(fromParts(name, role, child.blocks));
    }
    lead.push(...section.blocks);
    return { repos, lead };
  }

  for (const block of section.blocks) {
    if (repos.length === 0 && block.kind === 'list') {
      for (const item of block.items) {
        const { name, role } = splitRepoTitle(item.text);
        repos.push(fromParts(name, role, item.blocks));
      }
      continue;
    }
    if (block.kind === 'table' && block.rows.length > 0) {
      for (const row of block.rows) {
        const chips = block.header
          .slice(1)
          .map((label, i) => ({ label, value: row[i + 1] ?? '' }))
          .filter((chip) => chip.value !== '');
        repos.push({
          id: slugger.next(row[0], 'repo'),
          name: plainText(row[0]),
          role: chips[0]?.value ?? null,
          chips: chips.slice(1),
          blocks: [],
        });
      }
      continue;
    }
    lead.push(block);
  }

  return { repos, lead };
}

function splitRepoTitle(title: string): { name: string; role: string | null } {
  const plain = plainText(title);
  const match = /^(.+?)\s*(?:[—–]|\s[-]\s|[:：]|\()\s*(.+?)\)?$/.exec(plain);
  if (!match) return { name: plain, role: null };
  return { name: match[1].trim(), role: match[2].trim() };
}

const INLINE_RISK = /^\s*(?:\*\*)?risk(?:\*\*)?\s*[:：-]\s*/i;

function toRiskCard(title: string, blocks: Block[], slugger: Slugger): RiskCard {
  const impact = liftLabeled(blocks, /impact|consequence|effect/);
  const mitigation = liftLabeled(impact.rest, /mitigation|mitigate|response|action|resolution/);

  let name = plainText(title).replace(INLINE_RISK, '');
  let inlineImpact: string | null = null;
  let inlineMitigation: string | null = null;

  // "Risk: X — Impact: Y — Mitigation: Z" written on one line.
  const impactAt = /(?:^|[\s—–-])impact\s*[:：]\s*/i.exec(name);
  const mitigationAt = /(?:^|[\s—–-])mitigation\s*[:：]\s*/i.exec(name);
  if (impactAt || mitigationAt) {
    const cut = Math.min(impactAt?.index ?? name.length, mitigationAt?.index ?? name.length);
    const tail = name.slice(cut);
    name = name.slice(0, cut).replace(/[\s—–-]+$/, '');
    const impactMatch = /impact\s*[:：]\s*([\s\S]*?)(?=(?:[\s—–-]|^)mitigation\s*[:：]|$)/i.exec(
      tail,
    );
    const mitigationMatch = /mitigation\s*[:：]\s*([\s\S]*)$/i.exec(tail);
    inlineImpact = impactMatch ? impactMatch[1].replace(/[\s—–-]+$/, '').trim() : null;
    inlineMitigation = mitigationMatch ? mitigationMatch[1].trim() : null;
  }

  return {
    id: slugger.next(name, 'risk'),
    title: name,
    impact: impact.value ?? inlineImpact,
    mitigation: mitigation.value ?? inlineMitigation,
    blocks: mitigation.rest,
  };
}

function toRisks(section: PlanSection, slugger: Slugger): { risks: RiskCard[]; lead: Block[] } {
  const risks: RiskCard[] = [];
  const lead: Block[] = [];

  if (section.children.length > 0) {
    for (const child of section.children) {
      risks.push(toRiskCard(child.title, child.blocks, slugger));
    }
    lead.push(...section.blocks);
    return { risks, lead };
  }

  for (const block of section.blocks) {
    if (block.kind === 'table' && block.rows.length > 0) {
      const index = (pattern: RegExp) => block.header.findIndex((h) => pattern.test(h));
      const impactAt = index(/impact|consequence/i);
      const mitigationAt = index(/mitigation|response|action/i);
      for (const row of block.rows) {
        risks.push({
          id: slugger.next(row[0], 'risk'),
          title: plainText(row[0]),
          impact: impactAt > 0 ? (row[impactAt] ?? null) : null,
          mitigation: mitigationAt > 0 ? (row[mitigationAt] ?? null) : null,
          blocks: [],
        });
      }
      continue;
    }
    if (block.kind === 'list') {
      for (const item of block.items) {
        risks.push(toRiskCard(item.text, item.blocks, slugger));
      }
      continue;
    }
    lead.push(block);
  }

  return { risks, lead };
}

/* -- statistics -------------------------------------------------------------------------------- */

function countWork(nodes: WorkNode[], seen: Set<string>, stats: PlanStats): void {
  for (const node of nodes) {
    const key = `${node.kind}|${node.title.toLowerCase()}`;
    if (!seen.has(key)) {
      seen.add(key);
      if (node.kind === 'epic') stats.epics += 1;
      else if (node.kind === 'feature') stats.features += 1;
      else if (node.kind === 'story') stats.stories += 1;
      else if (node.kind === 'task') stats.tasks += 1;
    }
    countWork(node.children, seen, stats);
  }
}

/* -- entry point ------------------------------------------------------------------------------- */

/** Reads a plan document. Safe on any input: unrecognised content is preserved, never dropped. */
export function parsePlan(markdown: string): ParsedPlan {
  const slugger = new Slugger();
  const { title, intro, sections } = buildSections(parseBlocks(markdown), slugger);

  const plan: ParsedPlan = {
    title,
    intro,
    objective: null,
    scope: null,
    repositories: [],
    repositoriesLead: [],
    hasRepositoriesSection: false,
    phases: [],
    phasesLead: [],
    epics: [],
    epicsLead: [],
    risks: [],
    risksLead: [],
    technical: [],
    credentials: null,
    other: [],
    stats: { phases: 0, epics: 0, features: 0, stories: 0, tasks: 0 },
  };

  const phaseSections: PlanSection[] = [];

  for (const section of sections) {
    switch (classify(section)) {
      case 'objective':
        if (plan.objective) plan.other.push(section);
        else plan.objective = section;
        break;
      case 'scope': {
        const scope = toScope(section);
        if (plan.scope) {
          plan.scope.inScope.push(...scope.inScope);
          plan.scope.outOfScope.push(...scope.outOfScope);
          plan.scope.extra.push(...scope.extra);
        } else {
          plan.scope = scope;
        }
        break;
      }
      case 'repositories': {
        plan.hasRepositoriesSection = true;
        const { repos, lead } = toRepos(section, slugger);
        plan.repositories.push(...repos);
        plan.repositoriesLead.push(...lead);
        break;
      }
      case 'phases':
        phaseSections.push(section);
        break;
      case 'breakdown': {
        const { nodes, lead } = toWorkTree(section, slugger);
        plan.epics.push(...nodes);
        plan.epicsLead.push(...lead);
        break;
      }
      case 'risks': {
        const { risks, lead } = toRisks(section, slugger);
        plan.risks.push(...risks);
        plan.risksLead.push(...lead);
        break;
      }
      case 'credentials':
        plan.credentials = section;
        break;
      case 'technical':
        plan.technical.push(section);
        break;
      default:
        plan.other.push(section);
    }
  }

  const { phases, lead } = toPhases(phaseSections, slugger);
  plan.phases = phases;
  plan.phasesLead = lead;

  const seen = new Set<string>();
  plan.stats.phases = phases.length;
  countWork(plan.epics, seen, plan.stats);
  for (const phase of phases) countWork(phase.work, seen, plan.stats);

  return plan;
}
