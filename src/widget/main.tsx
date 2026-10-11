import { render } from 'preact';
import { App } from './App';
import { readConfig } from './lib/config';
import './tailwind.css';
import '../../styles/base.css';
import '../../styles/globals.css';

const root = document.getElementById('discuss');
if (root) render(<App config={readConfig(location.search)} />, root);
