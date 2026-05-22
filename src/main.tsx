import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './styles/colors_and_type.css';
import './styles/app.css';
import './styles/app-views.css';
import './styles/view-attention.css';
import './styles/view-projects.css';

const root = document.getElementById('root');
if (!root) throw new Error('#root not found in index.html');
createRoot(root).render(<React.StrictMode><App /></React.StrictMode>);
