import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import AgentVehicleCard from './AgentVehicleCard';
import api from '../../api/api';

jest.mock('react-i18next', () => {
  const texts = require('../../locales/sw.json');
  return { useTranslation: () => ({ t: (key) => key.split('.').reduce((o, k) => (o ? o[k] : undefined), texts) ?? key }) };
});
jest.mock('../../api/api', () => ({ patch: jest.fn() }));

test('the agent changes their vehicle (not only boda) and the heaviest load, and saves it', async () => {
  api.patch.mockResolvedValue({ data: {} });
  const onSaved = jest.fn();
  render(<AgentVehicleCard agentType="boda" maxWeightKg={20} onSaved={onSaved} />);
  for (const label of ['Boda', 'Bajaji', 'Baiskeli', 'Gari', 'Kirikuu / Van', 'Lori', 'Miguu']) expect(screen.getByText(label)).toBeInTheDocument();
  expect(screen.queryByText('Hifadhi usafiri')).toBeNull();                 // nothing changed yet
  fireEvent.click(screen.getByTestId('vehicle-bajaji'));
  fireEvent.change(screen.getByRole('spinbutton'), { target: { value: '80' } });
  fireEvent.click(screen.getByText('Hifadhi usafiri'));
  await waitFor(() => expect(api.patch).toHaveBeenCalledWith('/agents/my-profile', { agentType: 'bajaji', maxWeightKg: 80 }));
  expect(onSaved).toHaveBeenCalledWith({ agentType: 'bajaji', maxWeightKg: 80 });
});
