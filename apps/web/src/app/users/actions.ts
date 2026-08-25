'use server';

import { revalidatePath } from 'next/cache';
import { createUser, type CreateUserResult } from '@/lib/bff';

export async function createUserAction(
  _previous: CreateUserResult | null,
  formData: FormData,
): Promise<CreateUserResult> {
  const result = await createUser({
    name: String(formData.get('name') ?? ''),
    email: String(formData.get('email') ?? ''),
  });

  if (result.status === 'created' || result.status === 'unconfirmed') {
    // An unconfirmed write may well have landed, so the list has to be
    // re-read either way — it is where the user finds out.
    revalidatePath('/users');
  }

  return result;
}
