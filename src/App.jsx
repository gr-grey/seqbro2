import { useEffect, useState, useRef } from 'react';
import './App.css';
import Tippy from '@tippyjs/react';
import 'tippy.js/dist/tippy.css';

function App() {
  // get sequence
  const [genome, setGenome] = useState("hg38");
  const [chromosome, setChromosome] = useState("chr1");
  const [coordinate, setCoordinate] = useState(5530600);
  const [strand, setStrand] = useState('+');

  const [sequence, setSequence] = useState("");
  // scrollable content sequence len: 1000 characters
  const scrollHalfLen = 500;
  const scrollLen = 2 * scrollHalfLen; // retrieve center -/+ 500, 1001 sequencec in total
  // pad 1000 char at a time
  const paddingLen = 1000;
  const [seqStart, setSeqStart] = useState(null);
  const [seqEnd, setSeqEnd] = useState(null);
  const [displayStart, setDisplayStart] = useState(null);
  const [displayEnd, setDisplayEnd] = useState(null);
  const [displaySequence, setDisplaySequence] = useState("");
  const [displayCenter, setDisplayCenter] = useState(coordinate);
  const [tooltips, setToolTips] = useState([]);

  const seqBoxRef = useRef(null);

  // Track if sequence is being replaced
  const [isReplacing, setIsReplacing] = useState(false);
  const [scrollWidth, setScrollWidth] = useState(0);
  const [clientWidth, setClientWidth] = useState(0);
  // how many chars are in the sequence box window viewing window
  const [viewSeqLen, setViewSeqLen] = useState(0);

  // Sequence generator function (commonly referred to as "range", cf. Python, Clojure, etc.)
  const range = (start, stop, step = 1) =>
    Array.from(
      { length: Math.ceil((stop - start) / step) },
      (_, i) => start + i * step,
    );

  // update tool tips when display start or end coords changed
  useEffect(() => {
    const t = range(displayStart, displayStart + scrollLen); setToolTips(t);
    // console.log("update tooltips:");
  }, [displayStart]);

  const fetchSequence = async (start, end) => {
    const url = `https://tss.zhoulab.io/apiseq?seqstr=\[${genome}\]${chromosome}:${start}-${end}\ ${strand}`;
    try {
      const response = await fetch(url);
      const data = await response.json();
      const sequence = data[0]?.data || "";

      return sequence;
    } catch (error) {
      console.error("Failed to fetch sequence: ", error);
      return "";
    }
  };

  // load initial sequence
  useEffect(() => {
    const init = async () => {
      // starting seq len 4k, needs to be larger than display len
      const initHalfLen = 1000;
      const start = coordinate - initHalfLen;
      const end = coordinate + initHalfLen; // seqstr exclude last char
      const disStart = coordinate - scrollHalfLen;
      const disEnd = coordinate + scrollHalfLen;
      // temp sequence
      const seq = await fetchSequence(start, end);
      setSequence(seq); setDisplaySequence(seq.slice(disStart - start, disEnd - start));
      setSeqStart(start); setSeqEnd(end);
      setDisplayStart(disStart); setDisplayEnd(disEnd);

      // scroll to 50%
      setTimeout(() => {
        if (seqBoxRef.current) {
          setScrollWidth(seqBoxRef.current.scrollWidth);
          setClientWidth(seqBoxRef.current.clientWidth);
        }
      }, 10);
    }
    init();
  }, []);

  // scroll to 50% at init
  // shouldn't be triggered since we only set scrollWidth once
  useEffect(() => {
    if (seqBoxRef.current) {
      const halfway = (scrollWidth - clientWidth) / 2;
      seqBoxRef.current.scrollLeft = halfway;
      // init viewing char number as well
      setViewSeqLen(scrollLen / scrollWidth * seqBoxRef.current.clientWidth);
    }
  }, [scrollWidth]);


  // update sequence box size dimensions
  const updateSeqBoxWidths = () => {
    if (seqBoxRef.current) {
      setClientWidth(seqBoxRef.current.clientWidth);
      setViewSeqLen(scrollLen / scrollWidth * seqBoxRef.current.clientWidth);
    }
  };

  // update scroll and client width upon resizing
  useEffect(() => {
    const observer = new ResizeObserver(() => { updateSeqBoxWidths(); });
    if (seqBoxRef.current) { observer.observe(seqBoxRef.current); }
    return () => {
      if (seqBoxRef.current) { observer.unobserve(seqBoxRef.current); }
    };
  }, [seqBoxRef]);


  // Remap the mouse scrolling up and down to left and right
  // within SequenceBox
  useEffect(() => {
    const handleWheel = (event) => {
      // if mouse is inside sequenceBox
      if (seqBoxRef.current && seqBoxRef.current.contains(event.target)) {
        // deltaX is horizontal scroll, delta Y vertical
        // detect if the scrolling is dominated by vertical, if yes, remap to horizontal
        if (Math.abs(event.deltaY) > Math.abs(event.deltaX)) {
          event.preventDefault();
          seqBoxRef.current.scrollLeft += event.deltaY; // Map vertical scroll to horizontal
        }
      }
    };
    window.addEventListener("wheel", handleWheel, { passive: false });
    return () => { window.removeEventListener("wheel", handleWheel); };
  }, []);

  // left < and right > buttons with continuous scrolling
  const [scrollInterval, setScrollInterval] = useState(null);
  const startScrolling = (direction) => {
    if (!scrollInterval) {
      const interval = setInterval(() => {
        if (seqBoxRef.current) { seqBoxRef.current.scrollLeft += direction; } // use positive dir to scroll right, neg to scroll left
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


  const handleScroll = async () => {

    const elem = seqBoxRef.current;
    const leftEnd = scrollWidth - clientWidth;
    const scrollPercent = elem.scrollLeft / leftEnd;

    const center = Math.round(displayStart + (scrollLen - viewSeqLen) * scrollPercent + 0.5 * viewSeqLen);
    setDisplayCenter(center);

    if (scrollPercent < 0.05 && !isReplacing) { // scroll past left edge
      setIsReplacing(true);
      // shift display window to the left by scrollHalfLen
      const newDisplayStart = displayStart - scrollHalfLen;
      const newDisplayEnd = displayEnd - scrollHalfLen;
      const newDisplaySequence = sequence.slice(newDisplayStart - seqStart, newDisplayEnd - seqStart);
      setDisplaySequence(newDisplaySequence);
      // update display Start and End after setting the sequence, or else it'll reset it with new start and end
      setTimeout(() => {
        elem.scrollLeft += 0.5 * scrollWidth; // scroll 250 char (half of displaySeq len) to the right
        setIsReplacing(false);
        setDisplayStart(newDisplayStart); setDisplayEnd(newDisplayEnd);
        // update full seq by padding more to the left
        if (newDisplayStart <= seqStart) {
          updateFullSeqLeft(newDisplayStart);
        }
      }, 10);

      console.log({
        newDisplayStart,
        newDisplayEnd,
        sliceStart: newDisplayStart - seqStart,
        sliceEnd: newDisplayStart - seqStart + scrollLen,
        replacing: isReplacing,
      });

    } else if (scrollPercent > 0.95 && !isReplacing) { // scroll past right edge
      setIsReplacing(true);
      // shift display window to the right by scrollHalfLen
      const newDisplayStart = displayStart + scrollHalfLen;
      const newDisplayEnd = displayEnd + scrollHalfLen;
      const newDisplaySequence = sequence.slice(newDisplayStart - seqStart, newDisplayEnd - seqStart);
      setDisplaySequence(newDisplaySequence);

      setTimeout(() => {
        elem.scrollLeft -= 0.5 * scrollWidth; // scroll half of displaySeq len to the left
        setIsReplacing(false);
        setDisplayStart(newDisplayStart); setDisplayEnd(newDisplayEnd);
        if (newDisplayEnd >= seqEnd) { updateFullSeqRight(newDisplayEnd); } // pad on the right when run out paddings
      }, 10);

      console.log({
        newDisplayStart,
        newDisplayEnd,
        sliceStart: newDisplayStart - seqStart,
        sliceEnd: newDisplayStart - seqStart + scrollLen,
        replacing: isReplacing,
      });

    }
  };

  const updateFullSeqLeft = async (newDisplayStart) => {
    // Fetch additional sequence to pad on the left
    try {
      const padLeftSeq = await fetchSequence(newDisplayStart - paddingLen, newDisplayStart);
      setSequence((prevSequence) => padLeftSeq + prevSequence); // Prepend fetched sequence
      setSeqStart((prevSeqStart) => prevSeqStart - paddingLen); // Adjust seqStart
    } catch (error) {
      console.error("Error fetching additional sequence:", error);
    }
  };

  const updateFullSeqRight = async (newDisplayEnd) => {
    // Fetch additional sequence to pad on the right
    try {
      const padRightSeq = await fetchSequence(newDisplayEnd, newDisplayEnd + paddingLen);
      setSequence((prevSequence) => prevSequence + padRightSeq); // Append fetched sequence
      setSeqEnd((prevSeqEnd) => prevSeqEnd + paddingLen); // Adjust seqStart
    } catch (error) {
      console.error("Error fetching additional sequence:", error);
    }
  };

  // Add background color for beginning, middle and end of sequence for debug
  const getBackgroundColor = (index, seqLength) => {
    if (index < scrollLen * 0.06) {
      return "yellow"; // First 50 characters
    } else if (index === Math.floor(seqLength / 2)) {
      return "red"; // Middle character
    } else if (index >= seqLength - scrollLen * 0.06) {
      return "green"; // Last 50 characters
    }
    return "transparent"; // Default background
  };

  const ticks = [0, 12.5, 25, 37.5, 50, 62.5, 75, 87.5, 100]; // Tick positions in percentages


  return (
    <>
      <h1 className="text-xl text-center">SeqBro v2</h1>
      {/* sequence box */}
      <div className="relative">
        <div className="flex ml-2 mb-2">
          <button
            onMouseDown={() => startScrolling(-30)} // scroll left
            onMouseUp={stopScrolling}
            onMouseLeave={stopScrolling}
            className="px-1 mt-1 mr-1 bg-gray-50 border rounded-lg hover:bg-gray-200 text-xs"
          >
            &lt; {/* Left Arrow */}
          </button>
          <button
            onMouseDown={() => startScrolling(30)} // scroll right
            onMouseUp={stopScrolling}
            onMouseLeave={stopScrolling}
            className="px-1 mt-1 mr-1 bg-gray-50 border rounded-lg hover:bg-gray-200 text-xs"
          >
            &gt; {/* Right Arrow */}
          </button>
        </div>

        {/* Ruler */}
        <div className="relative pt-3 pb-3 ml-2 mr-2 bg-white border-b border-gray-800">
          <div className="absolute pt-1 top-0 text-xs text-blue-600"
            style={{ left: "0%", transform: "translateX(0%)" }}
          >
            {Math.round(displayCenter - viewSeqLen / 2)}
          </div>
          <div className="absolute pt-1 top-0 transform -translate-x-1/2 text-xs text-blue-600"
            style={{ left: "25%" }}
          >
            {Math.round(displayCenter - viewSeqLen / 4)}
          </div>
          <div className="absolute pt-1 top-0 left-1/2 transform -translate-x-1/2 text-xs text-blue-600">
            {displayCenter}
          </div>
          <div className="absolute pt-1 top-0 transform -translate-x-1/2 text-xs text-blue-600"
            style={{ left: "75%" }}
          >
            {Math.round(displayCenter + viewSeqLen / 4)}
          </div>
          <div className="absolute pt-1 top-0 text-xs text-blue-600"
            style={{ left: "100%", transform: "translateX(-100%)" }}
          >
            {Math.round(displayCenter + viewSeqLen / 2)}
          </div>
          {/* ticks */}
          {ticks.map((pos, index) => (
            <div key={index} className="absolute top-5 bottom-0 w-[3px] bg-blue-500"
              style={{ left: `${pos}%` }}
            ></div>
          ))}
        </div>

        <div
          className="bg-gray-50 pt-1 pb-2 ml-2 mr-2 border border-gray-300 overflow-x-auto font-mono"
          ref={seqBoxRef}
          onScroll={handleScroll}
          style={{ whiteSpace: "nowrap" }}
        >
          {displaySequence
            ? displaySequence.split("").map((char, index) => (
              <Tippy content={tooltips[index]} key={index}>
                <span style={{ backgroundColor: getBackgroundColor(index, displaySequence.length) }} >
                  {char}
                </span>
              </Tippy>
            ))
            : "Loading...."}
          {/* Center line for debug */}
          {/* <div className="absolute top-0 bottom-0 left-1/2 w-[2px] bg-blue-500"></div> */}
        </div>
      </div>

      <div className="border-t border-gray-200 mt-2">
        <h1>Debug:</h1>
        <ul className="space-y-2 text-sm">
          <li><span> --------SeqBox scrolling params---------</span></li>
          <li><span> ScrollWidth:</span> {scrollWidth}</li>
          <li><span> ClientWidth:</span> {clientWidth}</li>
          <li><span> viewSeqLen:</span> {viewSeqLen}</li>
          <li><span> --------Genome forms---------</span></li>
          <li><span> Genome:</span> {genome}</li>
          <li><span> Chromosome:</span> {chromosome}   </li>
          <li><span> strand:</span> {strand}</li>
          <li><span> Full seq Start - End (zero based, exclude last) coordinate:</span> {seqStart} - {seqEnd}</li>

          <li><span> Full seq length:</span> {sequence.length}; <span> display seq length:</span> {displaySequence.length}</li>

          <li><span> display start end:</span> {displayStart} - {displayEnd}</li>

          <li><span> display center:</span> {displayCenter}</li>

          <li><span> tooltip length</span> {tooltips.length}</li>

          <li><span> full seq:</span>
            {/* mini sequence box */}
            <div className="block max-w-2xl px-2 border border-gray-200 rounded-md break-words text-gray-700 text-wrap font-mono mt-2">{sequence}</div>
          </li>

          <li><span> display seq:</span>
            <div className="block max-w-2xl px-2 border border-gray-200 rounded-md break-words text-gray-700 text-wrap font-mono mt-2">{displaySequence}</div>
          </li>
        </ul>
      </div>
    </>
  );
}

export default App;
