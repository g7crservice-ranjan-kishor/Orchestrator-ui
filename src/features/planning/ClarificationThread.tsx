import { useState } from 'react';
import { api, ApiError } from '../../lib/api';
import type { Clarification, Draft } from '../../lib/types';

/** EM clarification thread: shows questions and lets the admin answer unanswered ones. */
export function ClarificationThread({
  projectId,
  clarifications,
  onChange,
}: {
  projectId: string;
  clarifications: Clarification[];
  onChange: (draft: Draft) => void;
}) {
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);

  if (clarifications.length === 0) {
    return null;
  }

  async function answer(id: string) {
    setError(null);
    try {
      onChange(await api.answerClarification(projectId, id, drafts[id] ?? ''));
      setDrafts((d) => ({ ...d, [id]: '' }));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to answer.');
    }
  }

  return (
    <div className="card">
      <h3>Clarifications</h3>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {clarifications.map((c) => (
        <div key={c.id} style={{ marginBottom: '0.75rem' }}>
          <p>
            <strong>Q:</strong> {c.question}
          </p>
          {c.answer ? (
            <p className="muted">A: {c.answer}</p>
          ) : (
            <div className="actions">
              <input
                value={drafts[c.id] ?? ''}
                onChange={(e) => setDrafts((d) => ({ ...d, [c.id]: e.target.value }))}
                placeholder="Your answer"
              />
              <button onClick={() => void answer(c.id)} disabled={!drafts[c.id]?.trim()}>
                Answer
              </button>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
