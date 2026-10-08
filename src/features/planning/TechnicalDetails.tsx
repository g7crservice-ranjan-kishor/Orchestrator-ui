import { useState } from 'react';
import { AutoComplete } from 'antd';
import { api, ApiError } from '../../lib/api';
import { TechnologyIcon } from './TechnologyIcon';
import type { Draft, DetailSource, TechnicalDetail } from '../../lib/types';

/**
 * The technology this product will be built with, and where each decision came from.
 *
 * **Why the source is on screen.** The Employee Management System's plan named PostgreSQL while
 * the project was pinned to SQL Server — an assumption made in silence that surfaced only when a
 * connection string refused to parse. A value with no provenance cannot be checked: "SQL Server"
 * read off the project and "SQL Server" guessed by an agent look identical, and only one of them
 * is a fact. So every row says who decided it.
 *
 * **Why most rows are already filled.** Asking someone for something their own requirement states,
 * in its own words, is how a tool teaches people to click past its questions. Detection runs
 * first; the only rows that ask anything are the ones genuinely nobody has answered.
 */

const SOURCE_LABEL: Record<DetailSource, string> = {
  requirement: 'Detected from requirement',
  project: 'From existing project configuration',
  user: 'You answered this',
  missing: 'Needs your input',
};

/** Tone, not decoration: the one row a person must act on has to be findable at a glance. */
const SOURCE_TONE: Record<DetailSource, string> = {
  requirement: 'badge-set',
  project: 'badge-set',
  user: 'badge-agent',
  missing: 'badge-unset',
};

function Row({
  detail,
  projectId,
  onChange,
}: {
  detail: TechnicalDetail;
  projectId: string;
  onChange: (draft: Draft) => void;
}) {
  // A filled row is read-only until asked otherwise: the common case is agreeing with it, and an
  // input box in every row turns a summary into a form nobody reads.
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(detail.value ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const unanswered = detail.source === 'missing';
  const open = editing || unanswered;
  const options = detail.options ?? [];
  const inputId = `tech-input-${detail.field}`;

  async function save() {
    setSaving(true);
    setError(null);
    try {
      onChange(await api.setTechnicalDetail(projectId, detail.field, value.trim()));
      setEditing(false);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not save this detail.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <li className={`tech-row${unanswered ? ' is-unanswered' : ''}`}>
      <div className="tech-head">
        <span className="tech-label">{detail.label}</span>
        <span className={`badge ${SOURCE_TONE[detail.source]}`}>
          {SOURCE_LABEL[detail.source]}
          {unanswered && !detail.required ? ' (optional)' : ''}
        </span>
      </div>

      {open ? (
        <>
          {unanswered && <p className="tech-question">{detail.question}</p>}
          <div className="tech-input">
            {/*
              A suggestion list, not a menu. Typing stays open because the list is what this tool
              recognises, not what a product may be built with — pinning the field to it would turn
              every unlisted technology into one nobody can answer with.

              `AutoComplete` rather than a bare input with a `datalist`: the native list is drawn by
              the browser, so it ignored every style on this page and arrived as a black box. This
              is the same control, and the same popup, as the database picker elsewhere.
            */}
            <AutoComplete
              className="tech-combo"
              id={inputId}
              value={value}
              onChange={setValue}
              options={options.map((option) => ({
                value: option,
                label: (
                  <span className="tech-option">
                    <TechnologyIcon name={option} />
                    {option}
                  </span>
                ),
              }))}
              filterOption={(input, option) =>
                (option?.value ?? '').toLowerCase().includes(input.trim().toLowerCase())
              }
              placeholder={detail.required ? 'Required' : 'Leave blank if not needed'}
              aria-label={detail.label}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && value.trim()) void save();
              }}
            />
            <button onClick={() => void save()} disabled={saving || !value.trim()}>
              {saving ? 'Saving…' : 'Save'}
            </button>
            {editing && (
              <button
                className="ghost"
                onClick={() => {
                  setValue(detail.value ?? '');
                  setEditing(false);
                }}
              >
                Cancel
              </button>
            )}
          </div>
        </>
      ) : (
        <div className="tech-value">
          {/* The same mark the popup offered, so a chosen row and its option read as one thing. */}
          <span className="tech-option">
            {detail.value && <TechnologyIcon name={detail.value} />}
            {detail.value}
          </span>
          <button className="ghost" onClick={() => setEditing(true)}>
            Change
          </button>
        </div>
      )}

      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
    </li>
  );
}

/** What the API records when the requirement rules a decision out. Mirrors `OUT_OF_SCOPE`. */
const OUT_OF_SCOPE = 'Out of scope';

/**
 * Which rows are worth showing yet.
 *
 * "What should the database be called?" sitting directly under "Which database?" reads as the same
 * question asked twice, and on the first real run it was answered "SQL" — the kind, typed into the
 * name. Naming a database nobody has chosen is premature anyway, so the row waits until there is a
 * database to name, and disappears again if the answer is that nothing is stored on a server.
 */
function visible(details: TechnicalDetail[]): TechnicalDetail[] {
  const database = details.find((d) => d.field === 'database');
  const chosen =
    database !== undefined &&
    database.source !== 'missing' &&
    database.value !== null &&
    database.value !== OUT_OF_SCOPE;
  return chosen ? details : details.filter((d) => d.field !== 'databaseName');
}

/**
 * `embedded` drops the card and heading, for use inside a section that supplies both.
 */
export function TechnicalDetails({
  projectId,
  details,
  onChange,
  embedded = false,
}: {
  projectId: string;
  details: TechnicalDetail[];
  onChange: (draft: Draft) => void;
  embedded?: boolean;
}) {
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (details.length === 0) return null;

  // Only required ones count: a product that mentions no integrations probably has none, and
  // counting that as outstanding would make the badge cry wolf.
  const outstanding = details.filter((d) => d.source === 'missing' && d.required).length;

  async function refresh() {
    setRefreshing(true);
    setError(null);
    try {
      onChange(await api.refreshTechnicalDetails(projectId));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not re-read the requirement.');
    } finally {
      setRefreshing(false);
    }
  }

  return (
    <div className={embedded ? 'tech-panel is-embedded' : 'card tech-panel'}>
      {!embedded && (
        <div className="tech-panel-head">
          <h3>Technical details</h3>
          <span className={outstanding > 0 ? 'badge badge-unset' : 'badge badge-set'}>
            {outstanding > 0 ? `${outstanding} still needed` : 'All answered'}
          </span>
        </div>
      )}

      <p className="muted">
        What this product will be built with. Anything your requirement named has been filled in
        already — check it, and change anything that is wrong.{' '}
        {outstanding > 0 && (
          <strong>The plan cannot be approved until the highlighted rows are answered.</strong>
        )}
      </p>

      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}

      <ul className="tech-list">
        {visible(details).map((detail) => (
          <Row key={detail.field} detail={detail} projectId={projectId} onChange={onChange} />
        ))}
      </ul>

      <div className="tech-foot">
        <button className="ghost" onClick={() => void refresh()} disabled={refreshing}>
          {refreshing ? 'Re-reading…' : 'Re-read the requirement'}
        </button>
        <span className="muted">Anything you answered yourself is kept.</span>
      </div>
    </div>
  );
}
