import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import InlineEntityText from './InlineEntityText';

describe('InlineEntityText', () => {
  test('renders plain text, references and hashtags without altering the text', () => {
    const ref = { entityType: 'business', entityId: 2, matchedText: 'BIS', startOffset: 0, endOffset: 3, source: 'automatic' };
    render(<InlineEntityText text="BIS – Vifaa #CCTV" references={[ref]} />);
    expect(screen.getByRole('button', { name: 'Biashara: BIS' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Hashtag CCTV' })).toBeInTheDocument();
    expect(screen.getByText(' – Vifaa ')).toBeInTheDocument();
  });

  test('calls the reference callback with the selected structured reference', () => {
    const ref = { entityType: 'product', entityId: 10, matchedText: 'GF-21', startOffset: 0, endOffset: 5, source: 'automatic' };
    const onReferenceClick = jest.fn();
    render(<InlineEntityText text="GF-21" references={[ref]} onReferenceClick={onReferenceClick} />);
    fireEvent.click(screen.getByRole('button', { name: 'GF-21' }));
    expect(onReferenceClick).toHaveBeenCalledWith(expect.objectContaining(ref));
  });

  test('calls hashtag callback with normalized visible label', () => {
    const onHashtagClick = jest.fn();
    render(<InlineEntityText text="#Biashara" onHashtagClick={onHashtagClick} />);
    fireEvent.click(screen.getByRole('button', { name: 'Hashtag Biashara' }));
    expect(onHashtagClick).toHaveBeenCalledWith('Biashara');
  });
});
