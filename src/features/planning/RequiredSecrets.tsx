import { useState } from 'react';
import { api, ApiError } from '../../lib/api';
import type { Draft, RequiredSecret } from '../../lib/types';
import { InlineText } from './Prose';

/**
 * An example value, however the planning agent wrote it: already marked up as code, a bare literal,
 * or a sentence describing the shape. Without this, its backticks appeared on screen verbatim.
 */
function Example({ text }: { text: string }) {
  const trimmed = text.trim();
  if (trimmed.includes('`')) return <InlineText text={trimmed} />;
  // A value with no whitespace is a literal to copy; anything else is prose and reads as prose.
  return /\s/.test(trimmed) ? (
    <InlineText text={trimmed} />
  ) : (
    <code className="md-code">{trimmed}</code>
  );
}

/**
 * Collects the credentials the **generated application** will need at runtime, as declared by the
 * planning agent (D-029).
 *
 * Values are write-only: they go straight to Key Vault, are never stored in the draft, and no
 * endpoint returns them — so once a credential is set the UI can only ever show *that* it is set,
 * never what it is. Replacing a value is possible; reading one back is not, by design.
 *
 * The plan cannot be approved until every credential here is provided, which is what stops a Task
 * being dispatched for an application that could never run.
 *
 * `embedded` drops the panel's own card and heading, for use inside the Plan view's credentials
 * section, which supplies both.
 */
export function RequiredSecrets({
  projectId,
  secrets,
  onChange,
  embedded = false,
}: {
  projectId: string;
  secrets: RequiredSecret[];
  onChange: (draft: Draft) => void;
  embedded?: boolean;
}) {
  const [values, setValues] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (secrets.length === 0) {
    return null;
  }

  const outstanding = secrets.filter((s) => !s.provided).length;

  async function save(name: string) {
    setSaving(name);
    setError(null);
    try {
      onChange(await api.setRequiredSecret(projectId, name, values[name] ?? ''));
      // Drop the value from component state the moment it is stored — no reason to keep it around.
      setValues((v) => ({ ...v, [name]: '' }));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not save the credential.');
    } finally {
      setSaving(null);
    }
  }

  return (
    <div className={embedded ? 'secrets-panel is-embedded' : 'card secrets-panel'}>
      {!embedded && (
        <div className="secrets-head">
          <h3>Application credentials</h3>
          <span className={outstanding > 0 ? 'badge badge-agent' : 'badge'}>
            {outstanding > 0 ? `${outstanding} still needed` : 'All provided'}
          </span>
        </div>
      )}
      <p className="muted">
        These are the credentials the application being built needs in order to run. They are stored
        in Key Vault, never in this database, and cannot be read back — you can replace a value, but
        not view it. <strong>The plan cannot be approved until every one is provided.</strong>
      </p>

      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}

      <ul className="secrets-list">
        {secrets.map((secret) => (
          <li key={secret.name} className="secret-row">
            <div className="secret-head">
              <code className="secret-name">{secret.name}</code>
              <span className={`badge ${secret.provided ? 'badge-set' : 'badge-unset'}`}>
                {secret.provided ? 'Set' : 'Not set'}
              </span>
            </div>
            {secret.description && (
              <p className="secret-desc">
                <InlineText text={secret.description} />
              </p>
            )}
            {secret.example && (
              <p className="muted secret-example">
                Example: <Example text={secret.example} />
              </p>
            )}
            <div className="secret-input">
              <input
                type="password"
                autoComplete="new-password"
                placeholder={secret.provided ? 'Replace the stored value' : 'Enter the value'}
                value={values[secret.name] ?? ''}
                onChange={(e) => setValues((v) => ({ ...v, [secret.name]: e.target.value }))}
                aria-label={`Value for ${secret.name}`}
              />
              <button
                onClick={() => void save(secret.name)}
                disabled={saving === secret.name || !(values[secret.name] ?? '').trim()}
              >
                {saving === secret.name ? 'Saving…' : secret.provided ? 'Replace' : 'Save'}
              </button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
