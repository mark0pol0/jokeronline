import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import App from './App';

beforeEach(() => {
  window.localStorage.clear();
  window.history.replaceState({}, '', '/');
  document.documentElement.style.removeProperty('--jp-visual-viewport-height');
  document.documentElement.style.removeProperty('--jp-visual-viewport-bottom');
  Object.defineProperty(window, 'visualViewport', {
    configurable: true,
    value: undefined
  });
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

test('toggles and persists the visual theme preference', () => {
  render(<App />);

  fireEvent.click(screen.getByTestId('appearance-settings-trigger'));
  fireEvent.click(screen.getByTestId('appearance-theme-modern'));

  expect(window.localStorage.getItem('joker-pursuit.visual-theme')).toBe('modern');
  expect(document.body.dataset.visualTheme).toBe('modern');
  expect(screen.getByTestId('appearance-theme-modern')).toHaveAttribute('aria-checked', 'true');
});

test('uses parlor as the default visual theme', () => {
  const { container } = render(<App />);

  expect(container.querySelector('.App')).toHaveAttribute('data-visual-theme', 'parlor');
  expect(window.localStorage.getItem('joker-pursuit.visual-theme')).toBe('parlor');
});

test('initializes visual theme from local storage', () => {
  window.localStorage.setItem('joker-pursuit.visual-theme', 'modern');

  const { container } = render(<App />);

  expect(container.querySelector('.App')).toHaveAttribute('data-visual-theme', 'modern');
});

test('publishes visual viewport chrome offset for mobile Safari layouts', () => {
  const listeners: Record<string, EventListener> = {};
  const visualViewportMock = {
    width: 393,
    height: 700,
    offsetTop: 0,
    addEventListener: jest.fn((type: string, listener: EventListener) => {
      listeners[type] = listener;
    }),
    removeEventListener: jest.fn()
  };

  Object.defineProperty(window, 'innerHeight', {
    configurable: true,
    value: 760
  });
  Object.defineProperty(window, 'visualViewport', {
    configurable: true,
    value: visualViewportMock
  });

  render(<App />);

  expect(document.documentElement.style.getPropertyValue('--jp-visual-viewport-height')).toBe('700px');
  expect(document.documentElement.style.getPropertyValue('--jp-visual-viewport-bottom')).toBe('60px');

  visualViewportMock.height = 720;
  listeners.resize(new Event('resize'));

  expect(document.documentElement.style.getPropertyValue('--jp-visual-viewport-height')).toBe('720px');
  expect(document.documentElement.style.getPropertyValue('--jp-visual-viewport-bottom')).toBe('40px');
});
