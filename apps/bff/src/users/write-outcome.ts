import { User } from './user';

/**
 * A write against this upstream has five outcomes, not two. Collapsing the
 * last two into "error" would tell the caller a record does not exist when we
 * do not know that.
 */
export type WriteOutcome =
  /** The address is already taken. Nothing was written. */
  | { status: 'conflict' }
  /** We could not establish the state to write against. Nothing was written. */
  | { status: 'precheck-failed' }
  /** Upstream confirmed the write, or reconciliation found the row we wrote. */
  | { status: 'created'; user: User; recovered: boolean }
  /** The write failed and the row is confirmed absent. Safe to retry. */
  | { status: 'failed' }
  /** The write failed and we could not find out whether it landed. */
  | { status: 'unconfirmed' };
