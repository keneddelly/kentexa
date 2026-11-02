import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import PostPhotos from './PostPhotos';

const photos = (n) => Array.from({ length: n }, (_, i) => ({ url: `${i + 1}.jpg` }));

test('three photos: one large, two small, a counter and the price on them', () => {
  render(<PostPhotos photos={photos(3)} price={45000} priceLabel="TZS 45,000" />);
  expect(screen.getAllByTestId('post-photo-cell')).toHaveLength(3);
  expect(screen.getAllByTestId('post-photo-cell')[0]).toHaveStyle({ gridRow: '1 / 3' });
  expect(screen.getByTestId('photo-counter')).toHaveTextContent('1/3');
  expect(screen.getByTestId('photo-price')).toHaveTextContent('TZS 45,000');
});

test('a tap opens the photo full screen and moves between them', () => {
  render(<PostPhotos photos={photos(4)} />);
  fireEvent.click(screen.getAllByTestId('post-photo-cell')[1]);
  expect(screen.getByTestId('viewer-counter')).toHaveTextContent('2/4');
  fireEvent.click(screen.getByLabelText('Picha inayofuata'));
  expect(screen.getByTestId('viewer-counter')).toHaveTextContent('3/4');
  fireEvent.click(screen.getByLabelText('Funga'));
  expect(screen.queryByTestId('photo-viewer')).toBeNull();
});

test('one photo is not drawn here (PostCard keeps its own frame)', () => {
  const { container } = render(<PostPhotos photos={photos(1)} />);
  expect(container).toBeEmptyDOMElement();
});
