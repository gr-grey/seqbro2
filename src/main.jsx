import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import EachMotif from './EachMotif.jsx'
import './index.css'
import { BrowserRouter, Routes, Route } from 'react-router-dom'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<App />}>
        </Route>
        <Route path="each_motif" element={<EachMotif />} />
      </Routes>
    </BrowserRouter>
  </React.StrictMode>,
)
