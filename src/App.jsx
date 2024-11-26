import { useState } from 'react';
import './App.css';
import NavBar from './NavBar';
import LeftPanel from './LeftPanel';
import RightPanel from './RightPanel';
import { GenomeProvider } from "./GenomeContext";

function App() {

  return (
    <GenomeProvider>
      <NavBar />
      <div className="flex h-screen">
        <LeftPanel />      
        <RightPanel />

      </div>
      <p className="read-the-docs">
        Main Page
      </p>
    </GenomeProvider>
  )
}

export default App
