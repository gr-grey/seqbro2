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
  const halfLen = 1000; // retrieve center -/+ 500, 1001 sequencec in total
  const quaterLen = 500;
  const [seqStart, setSeqStart] = useState(null);
  const [seqEnd, setSeqEnd] = useState(null);
  const [displayStart, setDisplayStart] = useState(null);
  const [displayEnd, setDisplayEnd] = useState(null);
  const [displaySequence, setDisplaySequence] = useState("");
  const [displayCenter, setDisplayCenter] = useState(coordinate);
  const [tooltips, setToolTips] = useState([]);

  const seqBoxRef = useRef(null);

  // Sequence generator function (commonly referred to as "range", cf. Python, Clojure, etc.)
  const range = (start, stop, step = 1) =>
    Array.from(
      { length: Math.ceil((stop - start) / step) },
      (_, i) => start + i * step,
    );

  // update tool tips when display start or end coords changed
  useEffect(() => {
    const t = range(displayStart, displayStart + halfLen); setToolTips(t);
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
      // starting seq len 2k
      const start = coordinate - halfLen * 2;
      const end = coordinate + halfLen * 2; // seqstr exclude last char
      const disStart = coordinate - quaterLen;
      const disEnd = coordinate + quaterLen;
      // temp sequence
      const seq = await fetchSequence(start, end);
      setSequence(seq); setDisplaySequence(seq.slice(disStart - start, disEnd - start));
      setSeqStart(start); setSeqEnd(end);
      setDisplayStart(disStart); setDisplayEnd(disEnd);

      // scroll to 50%
      setTimeout(() => {
        const halfway = (seqBoxRef.current.scrollWidth - seqBoxRef.current.clientWidth) / 2;
        seqBoxRef.current.scrollLeft = halfway;
      }, 10);
    }
    init();
  }, []);

  // Track if sequence is being replaced
  const [isReplacing, setIsReplacing] = useState(false);

  const handleScroll = async () => {

    const elem = seqBoxRef.current;
    const leftEnd = elem.scrollWidth - elem.clientWidth;
    const scrollPercent = elem.scrollLeft / leftEnd;
    const visibleSeqLen = halfLen / elem.scrollWidth * elem.clientWidth;

    const center = Math.round(displayStart + (halfLen - visibleSeqLen) * scrollPercent + 0.5 * visibleSeqLen);
    setDisplayCenter(center);

    if (scrollPercent < 0.05 && !isReplacing) { // scroll past left edge
      setIsReplacing(true);
      // shift display window to the left by quaterLen (250)
      const newDisplayStart = displayStart - quaterLen;
      const newDisplayEnd = displayEnd - quaterLen;
      const newDisplaySequence = sequence.slice(newDisplayStart - seqStart, newDisplayEnd - seqStart);
      setDisplaySequence(newDisplaySequence);
      // update display Start and End after setting the sequence, or else it'll reset it with new start and end
      setTimeout(() => {
        elem.scrollLeft += 0.5 * elem.scrollWidth; // scroll 250 char (half of displaySeq len) to the right
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
        sliceEnd: newDisplayStart - seqStart + halfLen,
        replacing: isReplacing,
      });

    } else if (scrollPercent > 0.95 && !isReplacing) { // scroll past right edge
      setIsReplacing(true);
      // shift display window to the right by quaterLen
      const newDisplayStart = displayStart + quaterLen;
      const newDisplayEnd = displayEnd + quaterLen;
      const newDisplaySequence = sequence.slice(newDisplayStart - seqStart, newDisplayEnd - seqStart);
      setDisplaySequence(newDisplaySequence);

      setTimeout(() => {
        elem.scrollLeft -= 0.5 * elem.scrollWidth; // scroll half of displaySeq len to the left
        setIsReplacing(false);
        setDisplayStart(newDisplayStart); setDisplayEnd(newDisplayEnd);
        if (newDisplayEnd >= seqEnd) { updateFullSeqRight(newDisplayEnd); } // pad on the right when run out paddings
      }, 10);

      console.log({
        newDisplayStart,
        newDisplayEnd,
        sliceStart: newDisplayStart - seqStart,
        sliceEnd: newDisplayStart - seqStart + halfLen,
        replacing: isReplacing,
      });

    }
  };

  const updateFullSeqLeft = async (newDisplayStart) => {
    // Fetch additional sequence to pad on the left
    try {
      const padLeftSeq = await fetchSequence(newDisplayStart - quaterLen, newDisplayStart);
      setSequence((prevSequence) => padLeftSeq + prevSequence); // Prepend fetched sequence
      setSeqStart((prevSeqStart) => prevSeqStart - quaterLen); // Adjust seqStart
    } catch (error) {
      console.error("Error fetching additional sequence:", error);
    }
  };

  const updateFullSeqRight = async (newDisplayEnd) => {
    // Fetch additional sequence to pad on the right
    try {
      const padRightSeq = await fetchSequence(newDisplayEnd, newDisplayEnd + quaterLen);
      setSequence((prevSequence) => prevSequence + padRightSeq); // Append fetched sequence
      setSeqEnd((prevSeqEnd) => prevSeqEnd + quaterLen); // Adjust seqStart
    } catch (error) {
      console.error("Error fetching additional sequence:", error);
    }
  };

  // Add background color for beginning, middle and end of sequence for debug
  const getBackgroundColor = (index, seqLength) => {
    if (index < 30) {
      return "yellow"; // First 50 characters
    } else if (index === Math.floor(seqLength / 2)) {
      return "red"; // Middle character
    } else if (index >= seqLength - 30) {
      return "green"; // Last 50 characters
    }
    return "transparent"; // Default background
  };

  return (
    <>
      <h1 className="text-xl text-center">SeqBro v2</h1>
      {/* sequence box */}
      <div className="relative">
        
        {/* Ruler */}
        <div className="relative pt-3 pb-3 ml-2 mr-2 bg-blue-100 border-b border-gray-300">
          <div className="absolute pt-1 top-0 left-1/2 transform -translate-x-1/2 text-xs text-blue-600">
            {displayCenter}
          </div>
          {/* tick at middle */}
          <div className="absolute top-5 bottom-0 left-1/2 w-[2px] bg-blue-500"></div>
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

export default App
