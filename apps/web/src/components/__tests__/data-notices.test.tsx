import { render, screen } from '@testing-library/react';
import { IncompleteNotice, StaleNotice } from '../data-notices';

describe('the stale notice', () => {
  it('says nothing when the data is live', () => {
    const { container } = render(<StaleNotice stale={false} ageSeconds={0} />);

    expect(container).toBeEmptyDOMElement();
  });

  it('states the age in terms a reader can act on', () => {
    render(<StaleNotice stale ageSeconds={7_200} />);

    expect(screen.getByRole('status')).toHaveTextContent(
      'The live service is unavailable, so this is the last data we could fetch, from 2 hours ago.',
    );
  });
});

describe('the incomplete notice', () => {
  it('says nothing when every record arrived intact', () => {
    const { container } = render(<IncompleteNotice dropped={0} />);

    expect(container).toBeEmptyDOMElement();
  });

  it('counts what is missing rather than pretending the list is whole', () => {
    render(<IncompleteNotice dropped={3} />);

    expect(screen.getByRole('status')).toHaveTextContent(
      '3 records are not shown because they arrived incomplete.',
    );
  });

  it('reads properly for a single record', () => {
    render(<IncompleteNotice dropped={1} />);

    expect(screen.getByRole('status')).toHaveTextContent('1 record is not shown');
  });
});
