import { render } from 'preact';
import { describe, expect, it } from 'vitest';
import { App } from './App';

describe('App', () => {
  it('renders', () => {
    const root = document.createElement('div');
    render(<App />, root);

    expect(root.textContent).toBe('IPL discuss');
  });
});
