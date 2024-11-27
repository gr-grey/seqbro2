import { useState } from 'react';
import './App.css';
import NavBar from './NavBar';
import LeftPanel from './LeftPanel';
import TrackValues from './TrackValues';
// import SequenceBox from './SequenceBox';
import { GenomeProvider, useGenomeContext } from "./GenomeContext";

// cannot put SequenceBox directly inside App
// GenomeProvider needs to wrap the entire component tree BEFORE
// useGenomeConetext can be accessed
const MainContent = () => {
  const { SequenceBox } = useGenomeContext();

  return (
      <div className="flex h-screen">
          {/* Left side of screen 1/4 or max-80 */}
          <div className="w-1/4 max-w-[20rem] border-r border-gray-300 p-4">
              <LeftPanel />
          </div>

          {/* Right side */}
          <div className="w-3/4 flex-grow p-2">
              <SequenceBox />
              <TrackValues />
          </div>
      </div>
  );
};

function App() {
  return (
      <GenomeProvider>
          <NavBar />
          <MainContent />
          <p className="read-the-docs">Main Page</p>
      </GenomeProvider>
  );
}

export default App
