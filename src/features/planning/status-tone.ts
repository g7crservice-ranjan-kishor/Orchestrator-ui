/** What the status means for the reader, which is what the colour and the pulse encode. */
export type StatusTone = 'running' | 'waiting' | 'done' | 'idle';

/**
 * Groups the seven draft statuses into the four things a reader actually needs to tell apart:
 * an agent is working, it is your turn, it is finished, or nothing has started.
 *
 * Only `running` pulses. A dot that blinks in every state says nothing — the movement has to mean
 * "something is happening right now", or it is decoration.
 */
export function statusTone(status: string): StatusTone {
  switch (status) {
    case 'planning':
    case 'backlogDrafting':
      return 'running';
    case 'clarifying':
    case 'planned':
    case 'backlogDrafted':
      return 'waiting';
    case 'approved':
      return 'done';
    default:
      // `intake`, and anything a later version adds — grey is the honest colour for "unknown".
      return 'idle';
  }
}

/** The phrase under the dot, so the colour is never the only carrier of meaning. */
export const TONE_HINT: Record<StatusTone, string> = {
  running: 'An agent is working',
  waiting: 'Waiting for you',
  done: 'Approved',
  idle: 'Not started',
};
