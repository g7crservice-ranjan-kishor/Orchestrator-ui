import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { TechnicalDetails } from './TechnicalDetails';
import { api } from '../../lib/api';
import type { Draft, TechnicalDetail } from '../../lib/types';

/**
 * The technology decisions, as a person meets them.
 *
 * Two failures sit either side of this panel. The Employee Management System's plan named
 * PostgreSQL while the project was pinned to SQL Server — a decision made in silence, surfacing
 * only when a connection string refused to parse. And asking someone for a thing their own
 * requirement already states is how a tool teaches people to click past its questions.
 *
 * So what matters here is that a detected value arrives **already filled in**, that every value
 * says **where it came from**, and that the row nobody has answered is the one that stands out.
 */

const detail = (over: Partial<TechnicalDetail> = {}): TechnicalDetail => ({
  field: 'frontend',
  label: 'Frontend',
  value: 'React',
  source: 'requirement',
  required: true,
  question: 'Which frontend framework should this be built with?',
  ...over,
});

const AUTH_GAP = detail({
  field: 'auth',
  label: 'Authentication',
  value: null,
  source: 'missing',
  question: 'How should people sign in?',
});

describe('TechnicalDetails', () => {
  beforeEach(() => vi.restoreAllMocks());

  const show = (details: TechnicalDetail[], onChange = vi.fn()) =>
    render(<TechnicalDetails projectId="p1" details={details} onChange={onChange} />);

  it('shows a detected value already filled in, not as a question', () => {
    show([detail()]);
    expect(screen.getByText('React')).toBeInTheDocument();
    expect(screen.queryByLabelText('Frontend')).not.toBeInTheDocument();
  });

  /** The whole reason the source is on screen: a fact and a guess must not look identical. */
  it('says where each value came from', () => {
    show([
      detail(),
      detail({ field: 'database', label: 'Database', value: 'SQL Server', source: 'project' }),
      AUTH_GAP,
    ]);
    expect(screen.getByText('Detected from requirement')).toBeInTheDocument();
    expect(screen.getByText('From existing project configuration')).toBeInTheDocument();
    expect(screen.getByText(/Needs your input/)).toBeInTheDocument();
  });

  it('asks only about what nobody has answered', () => {
    show([detail(), AUTH_GAP]);
    expect(screen.getByText('How should people sign in?')).toBeInTheDocument();
    expect(screen.getByLabelText('Authentication')).toBeInTheDocument();
  });

  it('counts only the required gaps as outstanding', () => {
    show([
      AUTH_GAP,
      detail({
        field: 'integrations',
        label: 'Integrations',
        value: null,
        source: 'missing',
        required: false,
      }),
    ]);
    expect(screen.getByText('1 still needed')).toBeInTheDocument();
  });

  it('says so when nothing is left to answer', () => {
    show([detail()]);
    expect(screen.getByText('All answered')).toBeInTheDocument();
  });

  it('saves an answer a person types', async () => {
    const onChange = vi.fn();
    const set = vi.spyOn(api, 'setTechnicalDetail').mockResolvedValue({} as Draft);
    show([AUTH_GAP], onChange);

    fireEvent.change(screen.getByLabelText('Authentication'), {
      target: { value: 'Seeded administrator' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(set).toHaveBeenCalledWith('p1', 'auth', 'Seeded administrator'));
    expect(onChange).toHaveBeenCalled();
  });

  /** A detected value a person disagrees with must be correctable, or the table is just a notice. */
  it('lets a detected value be changed', async () => {
    const set = vi.spyOn(api, 'setTechnicalDetail').mockResolvedValue({} as Draft);
    show([detail()]);

    fireEvent.click(screen.getByRole('button', { name: 'Change' }));
    fireEvent.change(screen.getByLabelText('Frontend'), { target: { value: 'Angular' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(set).toHaveBeenCalledWith('p1', 'frontend', 'Angular'));
  });

  it('will not save an empty answer', () => {
    show([AUTH_GAP]);
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
  });

  it('reports a failure rather than appearing to have saved', async () => {
    vi.spyOn(api, 'setTechnicalDetail').mockRejectedValue(new Error('nope'));
    show([AUTH_GAP]);

    fireEvent.change(screen.getByLabelText('Authentication'), { target: { value: 'JWT' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument());
  });

  it('shows nothing at all before anything has been resolved', () => {
    const { container } = show([]);
    expect(container).toBeEmptyDOMElement();
  });

  /**
   * The usual answers are offered, so nobody has to remember how this tool spells them — but the
   * field stays typable, because the list is what the detector recognises, not what a product may
   * be built with.
   */
  describe('suggests the usual answers', () => {
    const withOptions = detail({
      field: 'database',
      label: 'Database',
      value: null,
      source: 'missing',
      question: 'Which database should this use?',
      options: ['SQL Server', 'PostgreSQL', 'MongoDB'],
    });

    /** antd mirrors each option for screen readers, so count the rendered ones only. */
    const shown = () =>
      [...document.querySelectorAll('.ant-select-item-option-content')].map((n) => n.textContent);

    it('offers each option in the popup', async () => {
      show([withOptions]);
      fireEvent.mouseDown(screen.getByLabelText('Database'));
      await waitFor(() => expect(shown()).toEqual(['SQL Server', 'PostgreSQL', 'MongoDB']));
    });

    it('narrows the list as you type', async () => {
      show([withOptions]);
      const input = screen.getByLabelText('Database');
      fireEvent.mouseDown(input);
      fireEvent.change(input, { target: { value: 'mongo' } });
      await waitFor(() => expect(shown()).toEqual(['MongoDB']));
    });

    it('carries a mark beside every option', async () => {
      show([withOptions]);
      fireEvent.mouseDown(screen.getByLabelText('Database'));
      await waitFor(() => expect(shown()).toHaveLength(3));
      const marks = document.querySelectorAll('.ant-select-item-option-content .tech-icon');
      expect(marks).toHaveLength(3);
    });

    /** A chosen value shows the same mark its option did, so the two read as one thing. */
    it('carries the mark on the answered row too', () => {
      show([detail({ field: 'backend', label: 'Backend', value: 'Node.js', source: 'user' })]);
      expect(document.querySelector('.tech-value .tech-icon')).not.toBeNull();
    });

    it('still accepts something that is not on the list', async () => {
      const saved = vi.spyOn(api, 'setTechnicalDetail').mockResolvedValue({} as Draft);
      show([withOptions]);
      fireEvent.change(screen.getByLabelText('Database'), { target: { value: 'DuckDB' } });
      fireEvent.click(screen.getByRole('button', { name: 'Save' }));
      await waitFor(() =>
        expect(saved).toHaveBeenCalledWith(expect.anything(), 'database', 'DuckDB'),
      );
    });

    /**
     * A name is not picked from a menu. The row needs a chosen database beside it to be shown at
     * all, so that is set up here rather than relying on the row being filtered away — which is a
     * different rule, tested separately.
     */
    it('offers nothing for a field with no usual answers', async () => {
      show([
        detail({ field: 'database', label: 'Database', value: 'PostgreSQL', source: 'user' }),
        detail({
          field: 'databaseName',
          label: 'Database name',
          value: null,
          source: 'missing',
          required: false,
          options: [],
        }),
      ]);
      fireEvent.mouseDown(screen.getByLabelText('Database name'));
      await waitFor(() => expect(shown()).toEqual([]));
    });
  });

  /**
   * Two adjacent database rows read as one question asked twice, and the name was answered 'SQL' —
   * the kind, typed into the name. There is nothing to name until something is chosen.
   */
  describe('the database name waits for a database', () => {
    const name = detail({
      field: 'databaseName',
      label: 'Database name',
      value: null,
      source: 'missing',
      required: false,
    });
    const db = (over: Partial<TechnicalDetail>) =>
      detail({ field: 'database', label: 'Database', ...over });

    it('hides the name while no database is chosen', () => {
      show([db({ value: null, source: 'missing' }), name]);
      expect(screen.queryByText('Database name')).toBeNull();
      expect(screen.getByText('Database')).toBeInTheDocument();
    });

    it('shows the name once a database is chosen', () => {
      show([db({ value: 'PostgreSQL', source: 'user' }), name]);
      expect(screen.getByText('Database name')).toBeInTheDocument();
    });

    it('keeps it hidden when the requirement rules a database out', () => {
      show([db({ value: 'Out of scope', source: 'requirement' }), name]);
      expect(screen.queryByText('Database name')).toBeNull();
    });
  });
});
