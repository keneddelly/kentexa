import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import ImageStudio from './ImageStudio';

test('Image Studio exposes fit, crop, output formats and background controls', () => {
  const onClose = jest.fn();
  render(<ImageStudio photo={{ preview: 'local-preview.jpg' }} onClose={onClose} onSave={jest.fn()} />);

  expect(screen.getByRole('dialog', { name: 'Kentexa Image Studio' })).toBeInTheDocument();
  fireEvent.click(screen.getByTestId('image-crop'));
  expect(screen.getByTestId('image-crop')).toHaveStyle({ background: '#eff6ff' });
  fireEvent.click(screen.getByTestId('image-fit'));
  expect(screen.getByTestId('image-fit')).toHaveStyle({ background: '#eff6ff' });
  fireEvent.click(screen.getByRole('button', { name: 'Portrait 4:5' }));
  fireEvent.click(screen.getByRole('button', { name: 'Nyeupe' }));
  fireEvent.click(screen.getByRole('button', { name: '↻ Zungusha' }));
  fireEvent.click(screen.getByRole('button', { name: 'Ghairi' }));
  expect(onClose).toHaveBeenCalledTimes(1);
});
