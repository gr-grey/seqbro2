import { useEffect, useState, useRef } from 'react';
import './App.css';
import Tippy from '@tippyjs/react';
import 'tippy.js/dist/tippy.css';
import DebugPanel from './DebugPanel';
import NavBar from './NavBar';
import GenomeForm from './GenomeForm';
import DallianceViewer from './DallianceViewer';

function App() {
  // get sequence
  const [genome, setGenome] = useState("hg38");
  const [chromosome, setChromosome] = useState("chr7");
  const [coordinate, setCoordinate] = useState(5530600);
  const [strand, setStrand] = useState('-');
  const [gene, setGene] = useState('ACTB');

  // scrollable content sequence len: 1000 characters
  const boxSeqHalfLen = 500;
  const boxSeqLen = 2 * boxSeqHalfLen;
  // pad 1000 char at a time
  const paddingLen = 1000;
  // starting seq len 3k, display middle 1k in box
  // left and right each has 1k padding
  const initHalfLen = 1500;

  const fullStart = useRef(null); const fullEnd = useRef(null);
  const boxStart = useRef(null); const boxEnd = useRef(null);
  const [fullSeq, setFullSeq] = useState("");
  const [boxSeq, setBoxSeq] = useState("");

  const seqBoxRef = useRef(null);
  // width of the full seq in seqbox, like 9000px
  const boxSeqFullWidth = useRef(null);
  // seqBox on page, width in px, old clientWidth
  const boxWidth = useRef(null);
  // of the 1000 char in seqBox, how many are in view box
  const viewSeqLen = useRef(null);
  // coords at left end of ruler
  const [viewStart, setViewStart] = useState(null);

  // Track if sequence is being replaced
  const [isReplacing, setIsReplacing] = useState(false);
  const [seqInited, setSeqInited] = useState(false);

  const [syncScrollPercent, setSyncScrollPercent] = useState(0);
  const [toolTips, setToolTips] = useState([]);

  // Sequence generator function (commonly referred to as "range", cf. Python, Clojure, etc.)
  const range = (start, stop, step = 1) =>
    Array.from(
      { length: Math.ceil((stop - start) / step) },
      (_, i) => start + i * step,
    );

  // set tool tips according to strand
  const getToolTips = (start, end, strand) => {
    if (strand === '-') {
      return range(end, start, -1); // Reverse range for '-' strand
    } else {
      return range(start, end); // Normal range for '+' strand
    }
  };

  // calculate coord at the left of the ruler, count for strand
  const getViewStartCoord = (start, scrollChar, clientChar, scrollPercent) => {
    if (strand === '-') {
      return Math.round(start + scrollChar - (scrollChar - clientChar) * scrollPercent);
    } else {
      return Math.round(start + (scrollChar - clientChar) * scrollPercent);
    }
  };

  // get ruler maker/ tick coordinates, count for strand
  const getRulerTickCoord = (percent) => {
    if (strand === '-') {
      return Math.round(viewStart - percent * viewSeqLen.current);
    } else {
      return Math.round(viewStart + percent * viewSeqLen.current);
    }
  };

  // seqstr exclude last char
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
      setSeqInited(false);
      const full_start = coordinate - initHalfLen;
      const full_end = coordinate + initHalfLen;
      const box_start = coordinate - boxSeqHalfLen;
      const box_end = coordinate + boxSeqHalfLen;
      const seq = await fetchSequence(full_start, full_end);

      // update coords
      fullStart.current = full_start;
      fullEnd.current = full_end;
      boxStart.current = box_start;
      boxEnd.current = box_end;
      // update sequence
      setFullSeq(seq);
      setBoxSeq(seq.slice(box_start - full_start, box_end - full_start));

      // set box widths (client and scroll width) after sequences were set
      setTimeout(() => {
        if (seqBoxRef.current) {
          boxWidth.current = seqBoxRef.current.clientWidth;
          boxSeqFullWidth.current = seqBoxRef.current.scrollWidth;
          setSeqInited(true);
          // init tooltips
          setToolTips(getToolTips(box_start, box_end, strand));
        }
      }, 10);
    }
    init();
  }, [chromosome, coordinate, strand]);

  // manually scroll to 50% after sequences were inited
  useEffect(() => {
    if (seqBoxRef.current && boxSeqFullWidth.current && seqInited) {
      const full_w = boxSeqFullWidth.current;
      const view_w = boxWidth.current;
      const halfway = (full_w - view_w) / 2;
      seqBoxRef.current.scrollLeft = halfway;
      setSyncScrollPercent(0.5);

      // init viewing char number
      const viewLen = boxSeqLen / full_w * view_w;
      viewSeqLen.current = viewLen;
      // init view start coord
      setViewStart(getViewStartCoord(boxStart.current, boxSeqLen, viewLen, 0.5));
    }
  }, [seqInited]);

  // update sequence box size dimensions
  const updateSeqBoxWidths = () => {
    if (seqBoxRef.current && boxSeqFullWidth.current) {
      // scrollWidth is fixed once the first display seq is loaded
      const full_w = boxSeqFullWidth.current;
      const box_w = seqBoxRef.current.clientWidth;
      const leftEnd = full_w - box_w;
      const scrollPercent = seqBoxRef.current.scrollLeft / leftEnd;

      const viewLen = boxSeqLen / full_w * box_w;
      // coord of first char in view port
      // this usually doesn't change but just in case
      const newViewStart = getViewStartCoord(boxStart.current, boxSeqLen, viewLen, scrollPercent);
      setViewStart(newViewStart);

      // update varaibles
      boxWidth.current = box_w;
      viewSeqLen.current = viewLen;
      setSyncScrollPercent(scrollPercent);

      updateDallianceCoord(browserRef,newViewStart, viewLen);
    }
  };

  // update scroll and client width upon resizing
  useEffect(() => {
    const observer = new ResizeObserver(() => { updateSeqBoxWidths(); });

    if (seqBoxRef.current) {
      observer.observe(seqBoxRef.current);
    }

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

  // swap viewing sequence in display box, counting strand
  const getSwapSeqCoords = (edge) => {
    // swapping when scrolling to the left edge
    if (edge === 'left') {
      if (strand === '-') {
        const newBoxStart = boxStart.current + boxSeqHalfLen;
        const newBoxEnd = newBoxStart + boxSeqLen;
        const sliceStart = fullEnd.current - newBoxStart;
        const sliceEnd = sliceStart + boxSeqLen;
        const updateSeq = newBoxEnd + 500 >= fullEnd.current ? true : false;
        return { newBoxStart, newBoxEnd, sliceStart, sliceEnd, updateSeq };
      } else {
        const newBoxStart = boxStart.current - boxSeqHalfLen;
        const newBoxEnd = newBoxStart + boxSeqLen;
        const sliceStart = newBoxStart - fullStart.current;
        const sliceEnd = sliceStart + boxSeqLen;
        const updateSeq = newBoxStart - 500 <= fullStart.current ? true : false;
        return { newBoxStart, newBoxEnd, sliceStart, sliceEnd, updateSeq };
      }
    } else if (edge === 'right') { // swapping when scroll to right edge
      if (strand === '-') {
        const newBoxStart = boxStart.current - boxSeqHalfLen;
        const newBoxEnd = newBoxStart + boxSeqLen;
        const sliceStart = fullEnd.current - newBoxEnd;
        const sliceEnd = sliceStart + boxSeqLen;
        const updateSeq = newBoxStart - 500 <= fullStart.current ? true : false;
        return { newBoxStart, newBoxEnd, sliceStart, sliceEnd, updateSeq };
      } else {
        const newBoxStart = boxStart.current + boxSeqHalfLen;
        const newBoxEnd = newBoxStart + boxSeqLen;
        const sliceStart = newBoxStart - fullStart.current;
        const sliceEnd = sliceStart + boxSeqLen;
        const updateSeq = newBoxEnd + 500 >= fullEnd.current ? true : false;
        return { newBoxStart, newBoxEnd, sliceStart, sliceEnd, updateSeq };
      }
    }
  };

  const handleScroll = async () => {

    const elem = seqBoxRef.current;
    const full_w = boxSeqFullWidth.current;
    const box_w = boxWidth.current;
    const leftEnd = full_w - box_w;
    const scrollPercent = elem.scrollLeft / leftEnd;
    // const startCoord = boxStart.current;

    const newViewStart = getViewStartCoord(boxStart.current, boxSeqLen, viewSeqLen.current, scrollPercent);
    // coord of first char in view port
    setViewStart(newViewStart);

    // record scroll percent for 1k to sync to
    setSyncScrollPercent(scrollPercent);

    if (scrollPercent < 0.05 && !isReplacing) { // scroll past left edge
      setIsReplacing(true);
      // shift display window to the left by boxSeqHalfLen
      const { newBoxStart, newBoxEnd, sliceStart, sliceEnd, updateSeq } = getSwapSeqCoords('left');
      setBoxSeq(fullSeq.slice(sliceStart, sliceEnd));

      // update display Start and End after setting the sequence, or else it'll reset it with new start and end
      setTimeout(() => {
        elem.scrollLeft += 0.5 * full_w;
        setIsReplacing(false);
        boxStart.current = newBoxStart;
        boxEnd.current = newBoxEnd;
        // update full seq by padding more to the left
        if (updateSeq) { updateFullSeqLeft(); }
        // update tooltips
        setToolTips(getToolTips(newBoxStart, newBoxEnd, strand));
      }, 10);

    } else if (scrollPercent > 0.95 && !isReplacing) { // scroll past right edge
      setIsReplacing(true);
      const { newBoxStart, newBoxEnd, sliceStart, sliceEnd, updateSeq } = getSwapSeqCoords('right');
      setBoxSeq(fullSeq.slice(sliceStart, sliceEnd));

      // update display Start and End after setting the sequence, or else it'll reset it with new start and end
      setTimeout(() => {
        elem.scrollLeft -= 0.5 * full_w;
        setIsReplacing(false);
        boxStart.current = newBoxStart;
        boxEnd.current = newBoxEnd;
        // update full seq by padding more to the left
        if (updateSeq) { updateFullSeqRight(); }
        // update tooltips
        setToolTips(getToolTips(newBoxStart, newBoxEnd, strand));
      }, 10);

    }
  };

  const updateFullSeqLeft = async () => {
    // Fetch additional sequence to pad on the left
    try {
      if (strand === '-') {
        // for minus strand, retrive at the end but prepend it 
        const end = fullEnd.current;
        const padLeftSeq = await fetchSequence(end, end + paddingLen);
        setFullSeq((prevSequence) => padLeftSeq + prevSequence);
        fullEnd.current = end + paddingLen;
      } else {
        const start = fullStart.current;
        // retrive 1000 (padding len) left to the current starting coord
        const padLeftSeq = await fetchSequence(start - paddingLen, start);
        setFullSeq((prevSequence) => padLeftSeq + prevSequence); // Prepend fetched sequence
        fullStart.current = start - paddingLen; // Adjust seqStart
      }
    } catch (error) {
      console.error("Error fetching additional sequence:", error);
    }
  };

  const updateFullSeqRight = async () => {
    // Fetch additional sequence to pad on the left
    try {
      if (strand === '-') {
        // minus strand, same as update right in plus, but append instead of prepend
        const start = fullStart.current;
        const padRightSeq = await fetchSequence(start - paddingLen, start);
        setFullSeq((prevSequence) => prevSequence + padRightSeq); // Prepend fetched sequence
        fullStart.current = start - paddingLen; // Adjust seqStart
      } else {
        const end = fullEnd.current;
        // retrive 1000 (padding len) right to the end starting coord
        const padRightSeq = await fetchSequence(end, end + paddingLen);
        setFullSeq((prevSequence) => prevSequence + padRightSeq); // Append fetched sequence
        fullEnd.current = end + paddingLen; // Adjust full sequence end coord
      }
    } catch (error) {
      console.error("Error fetching additional sequence:", error);
    }
  };

  // Add background color for beginning, middle and end of sequence for debug
  const getBackgroundColor = (index, seqLength) => {
    if (index < boxSeqLen * 0.06) {
      return "yellow"; // First 50 characters
    } else if (index === Math.floor(seqLength / 2)) {
      return "red"; // Middle character
    } else if (index >= seqLength - boxSeqLen * 0.06) {
      return "green"; // Last 50 characters
    }
    return "transparent"; // Default background
  };

  const ticks = [0, 12.5, 25, 37.5, 50, 62.5, 75, 87.5, 100]; // Tick positions in percentages

  // tracking these values
  const debugVars = { boxSeqFullWidth, boxWidth, viewSeqLen, syncScrollPercent, fullStart, fullEnd, boxStart, boxEnd, fullSeq, boxSeq, viewStart, genome, chromosome, strand, toolTips, };

  const genomeFormVars = { genome, setGenome, chromosome, setChromosome, coordinate, setCoordinate, strand, setStrand, gene, setGene };

  // Dalliance genome viewer
  const viewerRef = useRef(null);
  const browserRef  = useRef(null);

  const updateDallianceCoord = (browserRef, viewStart, viewLen) => {
    if (strand === '+') {
      browserRef.current.setLocation(chromosome, viewStart, Math.round(viewStart+viewLen));
    } else { // minus strand
      browserRef.current.setLocation(chromosome, Math.round(viewStart-viewLen), viewStart);
    }
  };
  // sync dalliance genome browser as seq view box start coord changes
  useEffect(() => {
    if (browserRef.current && viewStart) {
      updateDallianceCoord(browserRef, viewStart, viewSeqLen.current);
    }
  }, [viewStart]);

  return (
    <>
      <NavBar />
      <div className="flex h-screen">
        {/* Left side of screen 1/4 or max-80 */}
        <div className="w-1/4 max-w-[15rem] border-r border-gray-300 p-4">
          <GenomeForm {...genomeFormVars} />
        </div>

        {/* Right side */}
        <div className="w-3/4 flex-grow p-2 relative overflow-visible">
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

              <div className="absolute pt-1 top-0 left-1/2 text-xs text-blue-600"
                style={{ left: "0%", transform: "translateX(0%)" }}
              >
                {viewStart}
              </div>

              <div className="absolute pt-1 top-0 transform -translate-x-1/2 text-xs text-blue-600"
                style={{ left: "50%" }}
              >
                {getRulerTickCoord(0.5)}
              </div>

              <div className="absolute pt-1 top-0 left-1/2 text-xs text-blue-600"
                style={{ left: "100%", transform: "translateX(-100%)" }}
              >
                {getRulerTickCoord(1.0)}
              </div>

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
              {boxSeq
                ? boxSeq.split("").map((char, index) => (
                  <Tippy content={toolTips[index]} key={index}>
                    <span style={{ backgroundColor: getBackgroundColor(index, boxSeq.length) }} >
                      {char}
                    </span>
                  </Tippy>
                  // vanila tooltips
                  // <span
                  //   key={index}
                  //   className="inline-block"
                  //   title={toolTips[index]} // Native tooltip with coordinate
                  //   style={{ backgroundColor: getBackgroundColor(index, boxSeq.length) }}
                  // >
                  //   {char}
                  // </span>
                ))
                : "Loading...."}
              {/* Center line for debug */}
              <div className="absolute top-0 bottom-0 left-1/2 w-[2px] bg-blue-500"></div>
            </div>
          </div>

          <DallianceViewer
            viewerRef={viewerRef}
            browserRef={browserRef}
            chromosome={chromosome}
          />

          <DebugPanel {...debugVars} />
        </div>
      </div>
    </>
  );
}

export default App;
