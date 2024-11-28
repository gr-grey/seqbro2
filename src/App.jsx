import { useEffect, useState } from 'react';
import './App.css';
import NavBar from './NavBar';
import LeftPanel from './LeftPanel';
import TrackValues from './TrackValues';
import SeqBox from './SeqBox';
import { GenomeProvider } from "./GenomeContext";

function App() {
  return (
    <GenomeProvider>
      <NavBar />
      <div className="flex h-screen">
        {/* Left side of screen 1/4 or max-80 */}
        <div className="w-1/4 max-w-[20rem] border-r border-gray-300 p-4">
          <LeftPanel />
        </div>

        {/* Right side */}
        <div className="w-3/4 flex-grow p-2 relative overflow-visible">
          <SeqBox />
          <TrackValues />
        </div>
      </div>
      <p className="read-the-docs">Main Page</p>
    </GenomeProvider>
  );
}

export default App
