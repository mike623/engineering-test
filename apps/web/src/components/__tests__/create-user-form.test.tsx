import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { CreateUserResult } from '@/lib/bff';
import { CreateUserForm } from '../create-user-form';

const submit = async (result: CreateUserResult) => {
  const action = jest.fn().mockResolvedValue(result);
  render(<CreateUserForm action={action} />);

  await userEvent.type(screen.getByLabelText('Name'), 'Grace');
  await userEvent.type(screen.getByLabelText('Email'), 'grace@example.com');
  await userEvent.click(screen.getByRole('button', { name: 'Create user' }));

  return screen.findByRole('status');
};

describe('creating a user', () => {
  it('confirms a create that upstream confirmed', async () => {
    const status = await submit({
      status: 'created',
      user: { id: 'b6d1f0a2-9c47-4f3b-8a11-7e5c2d9b0f34', name: 'Grace', email: 'grace@example.com' },
    });

    expect(status).toHaveTextContent('User created.');
  });

  it('says nothing was written when the write is confirmed to have failed', async () => {
    const status = await submit({ status: 'failed' });

    expect(status).toHaveTextContent('safe to try again');
  });

  it('does not claim a record was not created when it does not know', async () => {
    const status = await submit({ status: 'unconfirmed' });

    // The distinction is the whole point: telling someone their user was not
    // created, when it may have been, is how duplicates get made.
    expect(status).toHaveTextContent('could not confirm');
    expect(status).toHaveTextContent('Check the list below before trying again');
    expect(status).not.toHaveTextContent('safe to try again');
  });

  it('reports an address already in use', async () => {
    const status = await submit({ status: 'conflict' });

    expect(status).toHaveTextContent('already registered');
  });
});
