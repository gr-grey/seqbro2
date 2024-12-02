import { useEffect, useState, useRef } from 'react';
import './App.css';

function App() {
  // get sequence

  const [genome, setGenome] = useState("hg38");
  const [chromosome, setChromosome] = useState("chr1");
  const [coordinate, setCoordinate] = useState(5530600);
  const [strand, setStrand] = useState('+');

  const [sequence, setSequence] = useState("");
  const halfLen = 500; // retrieve center -/+ 500, 1001 sequencec in total
  const [seqStart, setSeqStart] = useState(null);
  const [seqEnd, setSeqEnd] = useState(null);
  const [displayStart, setDisplayStart] = useState(null);
  const [displayEnd, setDisplayEnd] = useState(null);
  const [displaySequence, setDisplaySequence] = useState("");
  const [displayCenter, setDisplayCenter] = useState(coordinate);

  const seqBoxRef = useRef(null);

  const fetchSequence = async (start, end) => {
    const url = `https://tss.zhoulab.io/apiseq?seqstr=\[${genome}\]${chromosome}:${start}-${end}\ ${strand}`;
    try {
      const response = await fetch(url);
      const data = await response.json();
      const sequence = data[0]?.data || "";
      // const tooltips = sequence.split('').map((_, index) => start + index);
      // console.log(tooltips);
      // console.log(sequence.split('').map((char, index) => {return {char, tooltip: index+start}}));
      return sequence;
      return sequence.split('').map((char, index) => {return {char, tooltip: index+start}});
      
    } catch (error) {
      console.error("Failed to fetch sequence: ", error);
      return "";
    }
  };

  // load initial sequence
  useEffect(() => {
    const init = async () => {
      const start = coordinate - halfLen;
      const end = coordinate + halfLen + 1; // seqstr exclude last char
      // temp sequence
      const seq = await fetchSequence(start, end);
      setSequence(seq);
      console.log(seq);
      setSeqStart(start); setSeqEnd(end);

      // scroll to 50%
      setTimeout(() => {
        const halfway = (seqBoxRef.current.scrollWidth - seqBoxRef.current.clientWidth) / 2;
        seqBoxRef.current.scrollLeft = halfway;
      }, 0);
    }
    init();
  }, []);

  const handleScroll = () => {

    const elem = seqBoxRef.current;
    const leftEnd = elem.scrollWidth - elem.clientWidth;
    const scrollPercent = elem.scrollLeft / leftEnd;
    const visibleSeqLen = (halfLen * 2 + 1) / elem.scrollWidth * elem.clientWidth;

    const center = Math.round(coordinate - halfLen - 1 + (halfLen * 2 + 1 - visibleSeqLen) * scrollPercent + 0.5 * visibleSeqLen);
    setDisplayCenter(center);
  };


  return (
    <>
      <h1 className="text-xl text-center">SeqBro v2</h1>
      {/* sequence box */}
      <div className="relative">
        <div className="bg-gray-50 pt-8 ml-2 mr-2 border border-gray-300 overflow-x-auto font-mono whitespace-nowrap"
          ref={seqBoxRef}
          onScroll={handleScroll}
        >
          {sequence}
          {/* {sequence.map((seqVal, i) => (
            <span key={i} title={seqVal.tooltip} style={{ backgroundColor: seqVal.color }}>{seqVal.char}</span>
          ))} */}
        </div>
        {/* center line for debug */}
        <div className="absolute top-0 bottom-0 left-1/2 w-[2px] bg-blue-500"></div>

      </div>

      <div className="border-t border-gray-200 mt-2">
        <h1>Debug:</h1>
        <ul className="space-y-2 text-sm">
          <li><span> Genome:</span> {genome}</li>
          <li><span> Chromosome:</span> {chromosome}   </li>
          <li><span> Full seq Start - Center - End (zero based, exclude last) coordinate:</span> {seqStart} - {coordinate} - {seqEnd}</li>
          <li><span> strand:</span> {strand}</li>

          <li><span> seq length:</span> {sequence.length}; <span> display seq length:</span> {displaySequence.length}</li>

          <li><span> display start - center end:</span> {displayStart} - {coordinate} - {displayEnd}</li>

          <li><span> display center:</span> {displayCenter}</li>

          <li><span> full seq:</span>
            {/* mini sequence box */}
            <div className="block max-w-2xl px-2 border border-gray-200 rounded-md break-words text-gray-700 text-wrap font-mono mt-2">{sequence}</div>
          </li>

        </ul>
      </div>
    </>
  );
}

export default App
