import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { forceRetry } from '@/app/actions';
import { RefreshButton } from '../refresh-button';

jest.mock('@/app/actions', () => ({ forceRetry: jest.fn() }));

const forced = forceRetry as jest.MockedFunction<typeof forceRetry>;

describe('refreshing a page that did render', () => {
  beforeEach(() => {
    forced.mockReset();
    forced.mockResolvedValue(undefined);
  });

  it('forces a probe rather than re-reading whatever the BFF is already holding', async () => {
    render(<RefreshButton resource="/parcs" page="/" />);

    await userEvent.click(screen.getByRole('button', { name: 'Refresh' }));

    // Without the forced probe an open breaker serves the same stale copy back
    // and the button looks broken.
    expect(forced).toHaveBeenCalledWith('/parcs', '/');
  });
});
