import { render } from 'preact';
import { App } from './App';

const root = document.getElementById('discuss');
if (root) render(<App />, root);
