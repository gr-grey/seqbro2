import { useEffect, useState } from 'react';
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
  const { SequenceBox, sequenceBoxRef } = useGenomeContext();

  // Remap the mouse scrolling up and down to left and right
  // within SequenceBox
  useEffect(() => {
    const handleWheel = (event) => {
      // if mouse is inside sequenceBox
      if (sequenceBoxRef.current && sequenceBoxRef.current.contains(event.target)) {
        // deltaX is horizontal scroll, delta Y vertical
        // detect if the scrolling is dominated by vertical, if yes, remap to horizontal
        if (Math.abs(event.deltaY) > Math.abs(event.deltaX)) {
          event.preventDefault();
          sequenceBoxRef.current.scrollLeft += event.deltaY; // Map vertical scroll to horizontal
        }
      }
    };
    window.addEventListener("wheel", handleWheel, { passive: false });
    return () => { window.removeEventListener("wheel", handleWheel); };
  }, []);

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
