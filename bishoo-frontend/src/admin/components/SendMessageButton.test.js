import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import SendMessageButton from './SendMessageButton';
import api from '../../api/api';

jest.mock('../../api/api', () => ({ __esModule: true, default: { post: jest.fn() } }));

// Owner 2026-11-09: admin sends a taarifa from the screen of that user, business, office, agent.
test('message one person from the screen, with a link inside KenteXa', async () => {
  api.post.mockResolvedValue({ data: { status: 'sent', recipientCount: 1 } });
  render(<SendMessageButton userId={7} name="Ar Samatta" label="Tuma taarifa kwa ofisi" />);
  fireEvent.click(screen.getByText('Tuma taarifa kwa ofisi'));
  const dialog = screen.getByRole('dialog', { name: 'Tuma taarifa kwa Ar Samatta' });
  expect(dialog).toHaveTextContent('Ar Samatta');
  fireEvent.change(screen.getByLabelText('Kichwa cha taarifa'), { target: { value: 'Bei za njia' } });
  fireEvent.change(screen.getByLabelText('Ujumbe wa taarifa'), { target: { value: 'Weka bei za njia zako.' } });
  fireEvent.change(screen.getByLabelText('Kiungo cha taarifa'), { target: { value: 'Workspace' } });
  await act(async () => { fireEvent.click(screen.getByTestId('send-message-submit')); });
  expect(api.post).toHaveBeenCalledWith('/announcements/messages', expect.objectContaining({ targetUserId: 7, title: 'Bei za njia', actionPage: 'Workspace', sendSms: false }));
  expect(screen.getByRole('status')).toHaveTextContent('Imetumwa kwa Ar Samatta');
});

test('no account behind it: no button', () => {
  const { container } = render(<SendMessageButton userId={null} name="X" />);
  expect(container).toBeEmptyDOMElement();
});
