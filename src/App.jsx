import { useState } from 'react';
import './App.css';
import NavBar from './NavBar';
import LeftPanel from './LeftPanel';
import TrackValues from './TrackValues';
import { GenomeProvider } from "./GenomeContext";

function App() {

  return (
    <GenomeProvider>
      <NavBar />
      <div className="flex h-screen">
        <LeftPanel />      
        <TrackValues />

      </div>
      <p className="read-the-docs">
        Main Page
      </p>
    </GenomeProvider>
  )
}

export default App
