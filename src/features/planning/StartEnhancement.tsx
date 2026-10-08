import { useState, type FormEvent } from 'react';
import { PlusOutlined, RocketOutlined } from '@ant-design/icons';
import { Alert, Button, Input, Modal, Radio } from 'antd';
import { api, ApiError } from '../../lib/api';
import type { Draft } from '../../lib/types';

/**
 * Starting a new planning cycle on a product that has already been built.
 *
 * It is a *separate* plan, not an edit of the existing one, and the wording says so — because the
 * alternative, re-planning in place, replaces the backlog and throws away the link to every work
 * item already in Azure DevOps. The backend refuses that outright; this is the thing to do instead.
 *
 * Shown only once there is something to enhance. Offering it on a product that has never been
 * pushed would be offering a button that can only fail, and the honest answer for that project is
 * to change the plan it already has.
 */
export function StartEnhancement({
  projectId,
  draft,
  onStarted,
}: {
  projectId: string;
  draft: Draft;
  onStarted: (draft: Draft) => void;
}) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState('');
  /*
   * Where the first sprint of this enhancement lands.
   *
   * `current` by default: an enhancement is normally wanted now, and work that cannot start until
   * the next rollover is work nobody is doing. A team that keeps its sprint boundaries clean picks
   * `next` so a sprint already in flight is not disturbed.
   */
  const [anchor, setAnchor] = useState<'current' | 'next'>('current');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /*
   * Only on a plan that has reached Azure DevOps, and only when nothing else is in flight. The
   * backend enforces both; hiding the button as well means a person is never invited to do
   * something that will be refused.
   */
  const pushed = draft.approval?.pushedToAdo ?? false;
  const planning = draft.status !== 'approved';
  if (!pushed || planning) {
    return null;
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const next = await api.startEnhancement(projectId, {
        title: title.trim(),
        sprintAnchor: anchor,
      });
      onStarted(next);
      setTitle('');
      setOpen(false);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not start the enhancement.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div className="card enh-invite">
        <span className="enh-invite-icon">
          <RocketOutlined />
        </span>
        <div className="enh-invite-text">
          <strong>This product is built. Want to add to it?</strong>
          <p className="muted">
            An enhancement is planned on top of what exists — a new plan of its own, numbered
            ENH-001 onwards. Nothing already in Azure DevOps is changed or removed.
          </p>
        </div>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => setOpen(true)}>
          Add enhancement
        </Button>
      </div>

      <Modal
        open={open}
        title="Add an enhancement"
        okText="Start planning"
        confirmLoading={busy}
        onOk={(e) => void submit(e as unknown as FormEvent)}
        onCancel={() => {
          setOpen(false);
          setError(null);
        }}
        okButtonProps={{ disabled: title.trim().length < 3 }}
      >
        <form onSubmit={submit} aria-label="Add an enhancement">
          <label className="enh-label" htmlFor="enh-title">
            What is it called?
          </label>
          <Input
            id="enh-title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Implement Dark Mode"
            maxLength={120}
            autoFocus
          />
          <fieldset className="enh-when">
            <legend>When should it start?</legend>
            <Radio.Group value={anchor} onChange={(e) => setAnchor(e.target.value)}>
              <Radio value="current">The sprint running now</Radio>
              <Radio value="next">The next sprint</Radio>
            </Radio.Group>
          </fieldset>

          <p className="muted enh-note">
            Write the detail as a <strong>requirement</strong> first, on the Requirement Intake page
            — planning reads the most recent one. The planning agent also reads the existing code,
            so it can work out what this change touches.
          </p>
          {error && <Alert type="error" message={error} showIcon className="enh-error" />}
        </form>
      </Modal>
    </>
  );
}
