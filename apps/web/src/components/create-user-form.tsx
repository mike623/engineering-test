'use client';

import { useActionState, useState } from 'react';
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

/**
 * Enough entropy to keep repeated clicks out of the 409 path, generated on
 * click rather than on render so the server and client markup still agree.
 */
function randomUser() {
  const suffix = crypto.randomUUID().slice(0, 8);

  return { name: `Test User ${suffix}`, email: `test-${suffix}@example.com` };
}

export function CreateUserForm({
  action,
}: {
  action: (previous: CreateUserResult | null, formData: FormData) => Promise<CreateUserResult>;
}) {
  const [result, submit, pending] = useActionState(action, null);
  const [draft, setDraft] = useState({ name: '', email: '' });

  return (
    <form action={submit} className="form">
      <label>
        Name
        <input
          name="name"
          required
          value={draft.name}
          onChange={(event) => setDraft({ ...draft, name: event.target.value })}
        />
      </label>
      <label>
        Email
        <input
          name="email"
          type="email"
          required
          value={draft.email}
          onChange={(event) => setDraft({ ...draft, email: event.target.value })}
        />
      </label>
      <div className="form__buttons">
        <button type="button" onClick={() => setDraft(randomUser())}>
          Fill random
        </button>
        <button type="submit" disabled={pending}>
          {pending ? 'Creating…' : 'Create user'}
        </button>
      </div>
      {result ? <Outcome result={result} /> : null}
    </form>
  );
}
