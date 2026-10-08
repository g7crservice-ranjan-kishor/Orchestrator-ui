import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { RequirementIntakePage } from './RequirementIntakePage';
import { api } from '../../lib/api';
import type { Requirement } from '../../lib/types';

const NEWLINE = String.fromCharCode(10);

const requirement = (over: Partial<Requirement> = {}): Requirement => ({
  id: 'r1',
  projectId: 'p1',
  text: ['Focus Timer – Browser-based timer', 'Build a focus timer that runs in the browser.'].join(
    NEWLINE,
  ),
  status: 'submitted',
  attachments: [],
  createdAt: new Date().toISOString(),
  ...over,
});

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/projects/p1/requirements']}>
      <Routes>
        <Route path="/projects/:id/requirements" element={<RequirementIntakePage />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('RequirementIntakePage', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('lists what has been submitted, with its heading and detail apart', async () => {
    vi.spyOn(api, 'listRequirements').mockResolvedValue([requirement()]);
    renderPage();

    expect(await screen.findByText('Focus Timer – Browser-based timer')).toBeInTheDocument();
    expect(screen.getByText('Build a focus timer that runs in the browser.')).toBeInTheDocument();
    expect(screen.getByText('Submitted')).toBeInTheDocument();
    expect(screen.getByText(/Attachments: none/)).toBeInTheDocument();
  });

  /** The requirement has to be long enough for the API's own minimum before the button will fire. */
  it('keeps the submit button disabled until there is a real requirement', async () => {
    vi.spyOn(api, 'listRequirements').mockResolvedValue([]);
    renderPage();

    const submit = await screen.findByRole('button', { name: /submit requirement/i });
    expect(submit).toBeDisabled();

    fireEvent.change(screen.getByLabelText(/requirement \(text\)/i), {
      target: { value: 'Build an employee management system' },
    });
    expect(submit).toBeEnabled();
  });

  it('submits the requirement and reloads the list', async () => {
    const list = vi.spyOn(api, 'listRequirements').mockResolvedValue([]);
    const create = vi.spyOn(api, 'createRequirement').mockResolvedValue(requirement());
    renderPage();

    fireEvent.change(await screen.findByLabelText(/requirement \(text\)/i), {
      target: { value: 'Build an employee management system' },
    });
    fireEvent.click(screen.getByRole('button', { name: /submit requirement/i }));

    await waitFor(() =>
      expect(create).toHaveBeenCalledWith('p1', 'Build an employee management system'),
    );
    expect(list).toHaveBeenCalledTimes(2);
  });

  /**
   * Attachments are chosen with the requirement, but the API takes them separately. The page has to
   * create first and upload against the id it gets back — the step a person used to do by hand.
   */
  it('uploads a chosen file against the requirement it just created', async () => {
    vi.spyOn(api, 'listRequirements').mockResolvedValue([]);
    vi.spyOn(api, 'createRequirement').mockResolvedValue(requirement({ id: 'new-1' }));
    const upload = vi.spyOn(api, 'uploadAttachment').mockResolvedValue(requirement());
    renderPage();

    const file = new File(['spec'], 'spec.pdf', { type: 'application/pdf' });
    fireEvent.change(await screen.findByLabelText('Choose attachments'), {
      target: { files: [file] },
    });
    expect(screen.getByText('spec.pdf')).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText(/requirement \(text\)/i), {
      target: { value: 'Build an employee management system' },
    });
    fireEvent.click(screen.getByRole('button', { name: /submit requirement/i }));

    await waitFor(() => expect(upload).toHaveBeenCalledWith('new-1', file));
  });

  /**
   * The API's multipart limit rejects an oversized file only after it has been transferred, so the
   * refusal has to happen here — and nothing should be created.
   */
  it('refuses a file over 10 MB before anything is uploaded', async () => {
    vi.spyOn(api, 'listRequirements').mockResolvedValue([]);
    const upload = vi.spyOn(api, 'uploadAttachment');
    renderPage();

    const big = new File(['x'], 'huge.pdf', { type: 'application/pdf' });
    Object.defineProperty(big, 'size', { value: 11 * 1024 * 1024 });
    fireEvent.change(await screen.findByLabelText('Choose attachments'), {
      target: { files: [big] },
    });

    expect(await screen.findByText(/larger than 10 MB/)).toBeInTheDocument();
    expect(screen.getByText('No file chosen')).toBeInTheDocument();
    expect(upload).not.toHaveBeenCalled();
  });

  it('filters the list by search', async () => {
    vi.spyOn(api, 'listRequirements').mockResolvedValue([
      requirement({ id: 'a', text: 'Focus timer' }),
      requirement({ id: 'b', text: 'Employee management system' }),
    ]);
    renderPage();

    await screen.findByText('Focus timer');
    fireEvent.change(screen.getByLabelText('Search requirements'), {
      target: { value: 'employee' },
    });

    expect(screen.queryByText('Focus timer')).not.toBeInTheDocument();
    expect(screen.getByText('Employee management system')).toBeInTheDocument();
  });

  it('says when a search matches nothing', async () => {
    vi.spyOn(api, 'listRequirements').mockResolvedValue([requirement({ text: 'Focus timer' })]);
    renderPage();

    await screen.findByText('Focus timer');
    fireEvent.change(screen.getByLabelText('Search requirements'), {
      target: { value: 'nothing like this' },
    });

    expect(screen.getByText('No requirement matches this search.')).toBeInTheDocument();
  });

  it('offers the way on to planning', async () => {
    vi.spyOn(api, 'listRequirements').mockResolvedValue([requirement()]);
    renderPage();

    const link = await screen.findByRole('link', { name: /proceed to planning/i });
    expect(link).toHaveAttribute('href', '/projects/p1/planning');
  });

  it('shows nothing to proceed with when there are no requirements', async () => {
    vi.spyOn(api, 'listRequirements').mockResolvedValue([]);
    renderPage();

    expect(await screen.findByText('No requirements submitted yet.')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /proceed to planning/i })).not.toBeInTheDocument();
  });

  it('reports a failure to load rather than showing an empty page', async () => {
    vi.spyOn(api, 'listRequirements').mockRejectedValue(new Error('offline'));
    renderPage();

    expect(await screen.findByText('Failed to load requirements.')).toBeInTheDocument();
  });

  it('opens the guidance on request', async () => {
    vi.spyOn(api, 'listRequirements').mockResolvedValue([]);
    renderPage();

    fireEvent.click(
      await screen.findByRole('button', { name: /need help writing a requirement/i }),
    );
    expect(screen.getByText('What the planning agent needs from you')).toBeInTheDocument();
  });
});
