'use client';

import { useActionState, useState } from 'react';
import { Shuffle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
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

  // Only a created user is good news; everything else needs to read as a
  // warning without looking like the page itself broke.
  const tone =
    result.status === 'created'
      ? 'border-emerald-500/40 bg-emerald-50 text-emerald-900'
      : 'border-amber-500/40 bg-amber-50 text-amber-900';

  return (
    <p role="status" className={`rounded-md border px-3 py-2 text-sm ${tone}`}>
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
    <Card className="mb-6">
      <CardHeader>
        <CardTitle>Add a user</CardTitle>
        <CardDescription>
          Writes go through the BFF, which reconciles what upstream reports against what it stored.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form action={submit} className="grid gap-4 sm:grid-cols-2">
          <div className="grid gap-2">
            <Label htmlFor="name">Name</Label>
            <Input
              id="name"
              name="name"
              required
              value={draft.name}
              onChange={(event) => setDraft({ ...draft, name: event.target.value })}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              name="email"
              type="email"
              required
              value={draft.email}
              onChange={(event) => setDraft({ ...draft, email: event.target.value })}
            />
          </div>
          <div className="flex gap-2 sm:col-span-2">
            <Button type="submit" disabled={pending}>
              {pending ? 'Creating…' : 'Create user'}
            </Button>
            <Button type="button" variant="outline" onClick={() => setDraft(randomUser())}>
              <Shuffle className="size-4" />
              Fill random
            </Button>
          </div>
          {result ? (
            <div className="sm:col-span-2">
              <Outcome result={result} />
            </div>
          ) : null}
        </form>
      </CardContent>
    </Card>
  );
}
