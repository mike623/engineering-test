import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ErrorPanel } from '../error-panel';
import { forceRetry } from '@/app/actions';

jest.mock('@/app/actions', () => ({ forceRetry: jest.fn() }));

const forced = forceRetry as jest.MockedFunction<typeof forceRetry>;

describe('the error state', () => {
  beforeEach(() => {
    forced.mockReset();
    forced.mockResolvedValue(undefined);
  });

  it('tells the reader the page failed and there was nothing to fall back to', () => {
    render(<ErrorPanel resource="/parcs" page="/" reset={jest.fn()} />);

    expect(screen.getByRole('alert')).toHaveTextContent('no earlier copy to fall back to');
  });

  it('actually retries when pressed, rather than only re-rendering', async () => {
    const reset = jest.fn();
    render(<ErrorPanel resource="/parcs" page="/" reset={reset} />);

    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));

    // The forced probe first: re-rendering alone would be refused by an open
    // breaker and the user would press a button that does nothing.
    expect(forced).toHaveBeenCalledWith('/parcs', '/');
    expect(reset).toHaveBeenCalled();
  });

  it('cannot be pressed twice while a retry is in flight', async () => {
    let release: () => void = () => undefined;
    forced.mockImplementation(() => new Promise<void>((resolve) => (release = resolve)));
    render(<ErrorPanel resource="/users" page="/users" reset={jest.fn()} />);

    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));

    const button = screen.getByRole('button', { name: 'Retrying…' });
    expect(button).toBeDisabled();

    release();
  });
});
