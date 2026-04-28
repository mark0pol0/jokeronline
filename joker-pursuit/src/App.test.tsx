import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import App from './App';

beforeEach(() => {
  window.localStorage.clear();
  window.history.replaceState({}, '', '/');
});

test('renders home menu actions', () => {
  render(<App />);
  expect(screen.getByTestId('home-local-game')).toBeInTheDocument();
  expect(screen.getByTestId('home-play-online')).toBeInTheDocument();
});

test('toggles and persists easy mode preference', () => {
  render(<App />);

  const toggle = screen.getByTestId('home-easy-mode-toggle');
  expect(toggle).toHaveAttribute('aria-pressed', 'false');

  fireEvent.click(toggle);

  expect(toggle).toHaveAttribute('aria-pressed', 'true');
  expect(window.localStorage.getItem('joker-pursuit.easy-mode')).toBe('true');
});

test('initializes easy mode from local storage', () => {
  window.localStorage.setItem('joker-pursuit.easy-mode', 'true');

  render(<App />);

  expect(screen.getByTestId('home-easy-mode-toggle')).toHaveAttribute('aria-pressed', 'true');
});
