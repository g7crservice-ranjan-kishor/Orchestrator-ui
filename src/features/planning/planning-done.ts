import type { BacklogItem, Draft } from '../../lib/types';
import { parsePlan } from './plan-model';

/**
 * What to say when an agent finishes, and whether to say anything at all.
 *
 * A planning run takes minutes. The page polls while it works, and when the answer arrives the
 * spinner simply stops and a plan appears further down — which, if you looked away, is
 * indistinguishable from the page having always looked like that. There was no moment that said
 * *this just finished*.
 *
 * Two rules keep the message honest. It is only shown for a transition this page actually
 * watched, never for a draft that was already finished when the page opened — a congratulation
 * for work you did yesterday is noise. And a run that finished without producing anything is not
 * a success: `runNote` says why it came back empty, and that card is the one that should speak.
 */

/** The statuses an agent leaves behind when it has finished, and what it finished. */
export type DoneKind = 'plan' | 'backlog';

export interface PlanningDone {
  kind: DoneKind;
  title: string;
  /** The counts worth reading at a glance; empty when there is nothing countable. */
  facts: string[];
  /** What to do next, in the words of the thing that comes next on the page. */
  next: string;
}

/** The status an agent is in while it works, mapped to what finishing it means. */
const FINISHED: Partial<Record<string, DoneKind>> = {
  planning: 'plan',
  backlogDrafting: 'backlog',
};

/** Whether moving from `before` to `after` is an agent finishing its work. */
export function completionOf(
  before: string | null | undefined,
  after: string | null | undefined,
): DoneKind | null {
  if (!before || !after || before === after) return null;
  const kind = FINISHED[before];
  if (!kind) return null;
  // Finishing means leaving the working state for a settled one, not failing back into intake.
  const settled = kind === 'plan' ? ['planned', 'backlogDrafting'] : ['backlogDrafted', 'approved'];
  return settled.includes(after) ? kind : null;
}

/**
 * The words for the things a plan is counted in, singular and plural.
 *
 * Written out rather than derived. "story" + "s" is "storys", and a congratulation with a
 * mis-spelled plural in it reads as machine-made, which is the opposite of the point.
 */
const WORDS = {
  phase: ['phase', 'phases'],
  epic: ['epic', 'epics'],
  feature: ['feature', 'features'],
  story: ['story', 'stories'],
  task: ['task', 'tasks'],
} as const;

type CountedThing = keyof typeof WORDS;

/** The non-zero counts, in the order given, as "1 epic", "25 stories". */
function facts(counts: [CountedThing, number][]): string[] {
  return counts
    .filter(([, n]) => n > 0)
    .map(([thing, n]) => `${n} ${WORDS[thing][n === 1 ? 0 : 1]}`);
}

function backlogFacts(backlog: readonly BacklogItem[]): string[] {
  const count = (type: string) => backlog.filter((item) => item.type === type).length;
  return facts([
    ['epic', count('epic')],
    ['feature', count('feature')],
    ['story', count('story')],
    ['task', count('task')],
  ]);
}

function planFacts(markdown: string): string[] {
  const { stats } = parsePlan(markdown);
  return facts([
    ['phase', stats.phases],
    ['epic', stats.epics],
    ['story', stats.stories],
    ['task', stats.tasks],
  ]);
}

/**
 * The message for a finished run, or null when there is nothing worth announcing.
 *
 * A draft whose run left a `runNote` produced nothing, whatever its status says — the note is the
 * honest account of it, and claiming success beside it would be the page contradicting itself.
 */
export function describeCompletion(kind: DoneKind, draft: Draft): PlanningDone | null {
  if (draft.runNote) return null;

  if (kind === 'plan') {
    if (!draft.planMarkdown) return null;
    return {
      kind,
      title: 'Your plan is ready',
      facts: planFacts(draft.planMarkdown),
      next: 'Read it through below. Approve it when you are happy, or request changes and say what to fix.',
    };
  }

  if (draft.backlog.length === 0) return null;
  return {
    kind,
    title: 'Your backlog is ready',
    facts: backlogFacts(draft.backlog),
    next: 'Check it below, then approve it to push the work items to Azure DevOps.',
  };
}
