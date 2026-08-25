'use client';

import { useActionState } from 'react';
import type { CreateUserResult } from '@/lib/bff';

/**
 * The three failure outcomes are deliberately worded differently. "Try again"
 * and "check before trying again" are different instructions, and telling a
 * user a record was not created when we do not know that is how duplicates
 * get made.
 */
function Outcome({ result }: { result: CreateUserResult }) {
  const message = {
    created: 'User created.',
    conflict: 'That address is already registered.',
    invalid: '',
    retryable: 'We could not reach the service, so nothing was created. Try again.',
    failed: 'The user was not created. Nothing was written, so it is safe to try again.',
    unconfirmed:
      'We could not confirm whether the user was created. Check the list below before trying again.',
  }[result.status];

  return (
    <p role="status" className="notice">
      {result.status === 'invalid' ? result.message : message}
    </p>
  );
}

export function CreateUserForm({
  action,
}: {
  action: (previous: CreateUserResult | null, formData: FormData) => Promise<CreateUserResult>;
}) {
  const [result, submit, pending] = useActionState(action, null);

  return (
    <form action={submit} className="form">
      <label>
        Name
        <input name="name" required />
      </label>
      <label>
        Email
        <input name="email" type="email" required />
      </label>
      <button type="submit" disabled={pending}>
        {pending ? 'Creating…' : 'Create user'}
      </button>
      {result ? <Outcome result={result} /> : null}
    </form>
  );
}
