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

  // use buttons to scroll left and right
  const scrollLeft = () => {
    if (sequenceBoxRef.current) { sequenceBoxRef.current.scrollLeft -= 100; }
  };
  const scrollRight = () => {
    if (sequenceBoxRef.current) { sequenceBoxRef.current.scrollLeft += 100; }
  };

  // left < and right > buttons with continuous scrolling
  const [scrollInterval, setScrollInterval] = useState(null);
  const startScrolling = (direction) => {
    if (!scrollInterval) {
      const interval = setInterval(() => {
        if (sequenceBoxRef.current) { sequenceBoxRef.current.scrollLeft += direction; } // use positive dir to scroll right, neg to scroll left
      }, 50); // adjust interval for smoothness
      setScrollInterval(interval);
    }
  };
  const stopScrolling = () => {
    if (scrollInterval) {
      clearInterval(scrollInterval);
      setScrollInterval(null);
    }
  };

  return (
    <div className="flex h-screen">
      {/* Left side of screen 1/4 or max-80 */}
      <div className="w-1/4 max-w-[20rem] border-r border-gray-300 p-4">
        <LeftPanel />
      </div>

      {/* Right side */}
      <div className="w-3/4 flex-grow p-2">
        <div className="flex mb-2">
          <button
            onMouseDown={() => startScrolling(-30)} // scroll left
            onMouseUp={stopScrolling}
            onMouseLeave={stopScrolling}
            className="px-2 py-1 mr-2 bg-gray-50 border rounded-lg hover:bg-gray-200"
          >
            &lt; {/* Left Arrow */}
          </button>
          <button
            onMouseDown={() => startScrolling(30)} // scroll right
            onMouseUp={stopScrolling}
            onMouseLeave={stopScrolling}
            className="px-2 py-1 mr-2 bg-gray-50 border rounded-lg hover:bg-gray-200"
          >
            &gt; {/* Right Arrow */}
          </button>

        </div>
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
