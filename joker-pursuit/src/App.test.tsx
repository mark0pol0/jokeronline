import React from 'react';
import { render, screen } from '@testing-library/react';
import App from './App';

test('renders home menu actions', () => {
  render(<App />);
  expect(screen.getByTestId('home-local-game')).toBeInTheDocument();
  expect(screen.getByTestId('home-play-online')).toBeInTheDocument();
});
