import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { ApprovalPanel } from './ApprovalPanel';
import { api } from '../../lib/api';
import type { AdoTarget, Draft, PushResult } from '../../lib/types';

/**
 * The step that decides where work items get written.
 *
 * The organization, project and area path were given when the project was created, and checked
 * against Azure DevOps at that moment. Presenting an empty form here asked for them a second time
 * and invited a typo into the one step that writes to someone else's system. The area path is the
 * worst field to get wrong: a wrong one still succeeds, and simply files the work where nobody
 * is looking for it.
 *
 * The step itself stays — it is the confirmation before a write. It just no longer starts blank.
 */
const target: AdoTarget = {
  orgUrl: 'https://dev.azure.com/RanjanKishor0024',
  project: 'Task-Manager',
  areaPath: 'Task-Manager\\Focus Timer',
};

const confirmed = (over: Record<string, unknown> = {}) =>
  draft({
    approval: {
      approved: true,
      adoTargetConfirmed: true,
      confirmedTarget: target,
      pushedToAdo: false,
    },
    ...over,
  });

const draft = (over: Record<string, unknown> = {}) =>
  ({
    approval: {
      approved: true,
      adoTargetConfirmed: false,
      confirmedTarget: null,
      pushedToAdo: false,
      ...(over.approval as object),
    },
    backlog: [],
    ...over,
  }) as unknown as Draft;

function renderPanel(adoTarget: AdoTarget | null) {
  return render(
    <MemoryRouter>
      <ApprovalPanel
        projectId="p1"
        draft={draft()}
        busy={false}
        // The page runs whatever action a step hands it; running it here is what makes the
        // assertion about the confirmed target meaningful.
        onAction={async (action) => {
          await action();
        }}
        adoTarget={adoTarget}
      />
    </MemoryRouter>,
  );
}

describe('ApprovalPanel target confirmation', () => {
  it("fills in the project's own organization, project and area path", async () => {
    renderPanel(target);
    await waitFor(() => {
      expect(screen.getByDisplayValue(target.orgUrl)).toBeInTheDocument();
      expect(screen.getByDisplayValue(target.project)).toBeInTheDocument();
      expect(screen.getByDisplayValue(target.areaPath)).toBeInTheDocument();
    });
  });

  /** The area path in particular: a project's own is a child path, not the project root. */
  it('uses the full area path, not just the project name', async () => {
    renderPanel(target);
    await waitFor(() =>
      expect(screen.getByDisplayValue('Task-Manager\\Focus Timer')).toBeInTheDocument(),
    );
  });

  /** A project row that could not be read leaves the fields typeable, as they always were. */
  it('leaves the fields empty when there is no target to fill in', () => {
    const { container } = renderPanel(null);
    const filled = [...container.querySelectorAll('input')].filter((i) => i.value !== '');
    expect(filled).toEqual([]);
  });

  it('confirms the target that was filled in', async () => {
    const confirm = vi
      .spyOn(api, 'confirmAdoTarget')
      .mockResolvedValue(draft() as unknown as Awaited<ReturnType<typeof api.confirmAdoTarget>>);
    renderPanel(target);
    await waitFor(() => expect(screen.getByDisplayValue(target.orgUrl)).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: /confirm target/i }));
    await waitFor(() => expect(confirm).toHaveBeenCalledWith('p1', target));
  });
});

/**
 * Saying when something is happening.
 *
 * Each step makes a network call, and the push creates every work item in the backlog — the
 * slowest thing on this screen. The buttons were disabled while working but looked exactly the
 * same, so the only feedback was that clicking again did nothing, which is indistinguishable from
 * a button that is simply broken.
 */
describe('ApprovalPanel progress feedback', () => {
  const renderWith = (props: Record<string, unknown>) =>
    render(
      <MemoryRouter>
        <ApprovalPanel
          projectId="p1"
          draft={confirmed()}
          busy={false}
          onAction={async (action) => {
            await action();
          }}
          adoTarget={target}
          {...props}
        />
      </MemoryRouter>,
    );

  it('says the push is running while it runs', async () => {
    // Held open so the button can be observed mid-push, then released to observe it settle.
    let release: (value: PushResult) => void = () => undefined;
    vi.spyOn(api, 'pushToAdo').mockReturnValue(
      new Promise<PushResult>((resolve) => {
        release = resolve;
      }),
    );
    renderWith({});

    fireEvent.click(screen.getByRole('button', { name: /push to azure devops/i }));
    expect(await screen.findByRole('button', { name: /creating work items/i })).toBeInTheDocument();

    release({ created: 61, skipped: 0, items: [] });
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /push to azure devops/i })).toBeInTheDocument(),
    );
  });

  it('marks the running button busy for a screen reader', async () => {
    vi.spyOn(api, 'pushToAdo').mockReturnValue(
      new Promise(() => undefined) as ReturnType<typeof api.pushToAdo>,
    );
    renderWith({});

    fireEvent.click(screen.getByRole('button', { name: /push to azure devops/i }));
    const running = await screen.findByRole('button', { name: /creating work items/i });
    expect(running).toHaveAttribute('aria-busy', 'true');
    expect(running).toBeDisabled();
  });

  /** The other two steps make network calls too, and were equally silent. */
  it('says when the approval is running', () => {
    renderWith({ draft: draft({ approval: { approved: false } }), busy: true });
    expect(screen.getByRole('button', { name: /approving/i })).toBeInTheDocument();
  });

  it('says when the target confirmation is running', () => {
    renderWith({ draft: draft(), busy: true });
    expect(screen.getByRole('button', { name: /confirming/i })).toBeInTheDocument();
  });
});
