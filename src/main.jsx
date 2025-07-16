// src/main.jsx
import React from 'react';
import ReactDOM from 'react-dom/client';
import Root from './App.jsx'; 
import './index.css'; // Tailwind CSS import
import './App.css';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <Root />
  </React.StrictMode>,
);