import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import TopicPicker from './TopicPicker';
import api from '../../api/api';

jest.mock('../../api/api', () => ({ post: jest.fn() }));
const topics = [
  { key: 'biashara', label: 'Biashara', note: 'Bei, wateja, mbinu' }, { key: 'kilimo', label: 'Kilimo' },
  { key: 'usafiri', label: 'Usafiri na mizigo' }, { key: 'michezo', label: 'Michezo' },
];

test('asks for at least 3 topics, then saves exactly the chosen ones (owner approved 2026-11-02)', async () => {
  api.post.mockResolvedValue({ data: topics.map((t) => ({ ...t, following: t.key !== 'michezo' })) });
  const onDone = jest.fn();
  render(<TopicPicker topics={topics} onDone={onDone} onLater={jest.fn()} />);
  fireEvent.click(screen.getByTestId('topic-biashara'));
  fireEvent.click(screen.getByTestId('topic-kilimo'));
  await act(async () => { fireEvent.click(screen.getByTestId('topics-save')); });
  expect(screen.getByRole('alert')).toHaveTextContent('angalau mada 3');
  expect(api.post).not.toHaveBeenCalled();
  fireEvent.click(screen.getByTestId('topic-usafiri'));
  await act(async () => { fireEvent.click(screen.getByTestId('topics-save')); });
  expect(api.post).toHaveBeenCalledWith('/feed/topics/follow', { keys: ['biashara', 'kilimo', 'usafiri'] });
  expect(onDone).toHaveBeenCalledWith(expect.arrayContaining([expect.objectContaining({ key: 'kilimo', following: true })]));
});

test('"Baadaye" closes without saving', () => {
  const onLater = jest.fn();
  render(<TopicPicker topics={topics} onDone={jest.fn()} onLater={onLater} />);
  fireEvent.click(screen.getByText('Baadaye'));
  expect(onLater).toHaveBeenCalled();
  expect(api.post).not.toHaveBeenCalled();
});
