import { useEffect, useState, useRef } from 'react';
import './App.css';
import Tippy from '@tippyjs/react';
import 'tippy.js/dist/tippy.css';
import DebugPanel from './DebugPanel';
import NavBar from './NavBar';
import GenomeForm from './GenomeForm';
import DallianceViewer from './DallianceViewer';
import Plot from 'react-plotly.js';

function App() {
  // get sequence
  const [genome, setGenome] = useState("hg38");
  const [chromosome, setChromosome] = useState("chr7");
  const [coordinate, setCoordinate] = useState(5530600);
  const [strand, setStrand] = useState('+');
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
  const fullSeq = useRef(null);
  const [boxSeq, setBoxSeq] = useState("");

  // inference
  const plotFullSeq = useRef(null);
  // puffin inference lose 325 from start and end
  const puffin_offset = 325;

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

  const syncScrollPercent = useRef(0);
  const [toolTips, setToolTips] = useState([]);

  // toggle 1k full view or local sync view
  const [is1kMode, setIs1kMode] = useState(false);

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
      fullSeq.current = seq;
      setBoxSeq(seq.slice(box_start - full_start, box_end - full_start));
      // test: plot seq halflen = 500 + 325, plus strand only
      const plotStart = coordinate - boxSeqHalfLen - puffin_offset;
      const plotEnd = coordinate + boxSeqHalfLen + puffin_offset;
      plotFullSeq.current = seq.slice(plotStart - full_start, plotEnd - full_start);

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
      syncScrollPercent.current = 0.5;

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
      syncScrollPercent.current = scrollPercent;

      updateDallianceCoord(browserRef, newViewStart, viewLen);

      console.log(is1kMode);
      // update plot widths for 1k view
      if (is1kMode) {
        // updatePlotWidth(box_w);
        relayout({ width: box_w });
      }
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
  }, [seqBoxRef, is1kMode]);

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

  // modularize handle scroll, separate infinite scrolling, trigger swapping
  // and syncing between seqBoxRef and plotRef

  // Function to sync scroll positions between refs
  // Ref to prevent circular scroll updates
  const isSyncingScroll = useRef(false);
  const syncScroll = (sourceElem, targetElem) => {
    if (!sourceElem || !targetElem) return;

    // Prevent triggering a sync if already in progress
    if (isSyncingScroll.current) return;

    const scrollTarget = sourceElem.scrollLeft;
    // Calculate scroll percentage for the only purpose of tracking and debugging
    const scrollPercent =
      scrollTarget / (boxSeqFullWidth.current - boxWidth.current);
    // sourceElem.scrollLeft / (sourceElem.scrollWidth - sourceElem.clientWidth);
    syncScrollPercent.current = scrollPercent;

    // const targetScrollWidth = targetElem.scrollWidth - targetElem.clientWidth;
    // const newScrollLeft = scrollPercent * targetScrollWidth;
    // Set the flag and update the target scroll position
    isSyncingScroll.current = true;
    targetElem.scrollLeft = scrollTarget;

    // Reset the flag after the browser processes the scroll
    requestAnimationFrame(() => {
      isSyncingScroll.current = false;
    });
  };

  // Function to handle infinite scrolling logic
  const handleInfiniteScroll = (elem) => {
    const full_w = boxSeqFullWidth.current;
    const box_w = boxWidth.current;
    const leftEnd = full_w - box_w;
    const scrollPercent = elem.scrollLeft / leftEnd;

    const newViewStart = getViewStartCoord(
      boxStart.current,
      boxSeqLen,
      viewSeqLen.current,
      scrollPercent
    );
    setViewStart(newViewStart);

    // disable infinite scrolling when in 1k mode
    if (!is1kMode && scrollPercent < 0.05 && !isReplacing) {
      triggerInfiniteScroll("left", elem, full_w);
    } else if (!is1kMode && scrollPercent > 0.95 && !isReplacing) {
      triggerInfiniteScroll("right", elem, full_w);
    }
  };

  // Helper to handle sequence swapping
  const triggerInfiniteScroll = (direction, elem, full_w) => {
    setIsReplacing(true);
    const { newBoxStart, newBoxEnd, sliceStart, sliceEnd, updateSeq } =
      getSwapSeqCoords(direction);
    setBoxSeq(fullSeq.current.slice(sliceStart, sliceEnd));

    setTimeout(() => {
      if (direction === "left") elem.scrollLeft += 0.5 * full_w;
      else elem.scrollLeft -= 0.5 * full_w;

      setIsReplacing(false);
      boxStart.current = newBoxStart;
      boxEnd.current = newBoxEnd;

      if (updateSeq) {
        direction === "left" ? updateFullSeqLeft() : updateFullSeqRight();
      }

      setToolTips(getToolTips(newBoxStart, newBoxEnd, strand));
    }, 10);
  };

  // Sequence box scroll handler
  const handleSeqBoxScroll = () => {
    const seqElem = seqBoxRef.current;
    const plotElem = plotRef.current;

    if (seqElem) {
      // Handle infinite scrolling for the sequence box
      handleInfiniteScroll(seqElem);

      // Sync plot scrolling
      if (!is1kMode) {
        syncScroll(seqElem, plotElem);
      }
    }
  };

  // Plot scroll handler
  const handlePlotScroll = () => {
    const seqElem = seqBoxRef.current;
    const plotElem = plotRef.current;

    if (plotElem) {
      // Sync sequence box scrolling
      if (!is1kMode) {
        syncScroll(plotElem, seqElem);
      }

      // Future: Add infinite scroll logic 
    }
  };

  const updateFullSeqLeft = async () => {
    // Fetch additional sequence to pad on the left
    try {
      if (strand === '-') {
        // for minus strand, retrive at the end but prepend it 
        const end = fullEnd.current;
        const padLeftSeq = await fetchSequence(end, end + paddingLen);
        fullSeq.current = padLeftSeq + fullSeq.current;
        fullEnd.current = end + paddingLen;
      } else {
        const start = fullStart.current;
        // retrive 1000 (padding len) left to the current starting coord
        const padLeftSeq = await fetchSequence(start - paddingLen, start);
        fullSeq.current = fullSeq.current + padLeftSeq;
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
        fullSeq.current = fullSeq.current + padRightSeq; // Append fetched sequence
        fullStart.current = start - paddingLen; // Adjust seqStart
      } else {
        const end = fullEnd.current;
        // retrive 1000 (padding len) right to the end starting coord
        const padRightSeq = await fetchSequence(end, end + paddingLen);
        fullSeq.current = fullSeq.current + padRightSeq; // Append fetched sequence
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

  // onnx session to run puffin inference
  const [plotData, setPlotData] = useState(null);
  const [plotLayout, setPlotLayout] = useState(null);
  const plotRef = useRef(null);

  const runInference = async (inputSequence, modelPath) => {
    try {
      const session = await window.ort.InferenceSession.create(modelPath);

      // Encode the sequence
      const seqEncoded = Array.from(inputSequence).map((char) => {
        switch (char) {
          case 'A': return [1, 0, 0, 0];
          case 'C': return [0, 1, 0, 0];
          case 'G': return [0, 0, 1, 0];
          case 'T': return [0, 0, 0, 1];
          default: return [0, 0, 0, 0];
        }
      });

      const seqTransposed = seqEncoded[0].map((_, colIndex) =>
        seqEncoded.map(row => row[colIndex])
      );

      const seqEncodedTensor = new ort.Tensor('float32', seqTransposed.flat(), [1, 4, inputSequence.length]);

      // Run inference
      const feeds = { [session.inputNames[0]]: seqEncodedTensor };
      const results = await session.run(feeds);

      return results;
    } catch (error) {
      console.error("Error running inference:", error);
      return null;
    }
  };

  const plotLeftMargin = 10;
  const plotLegendLayout = {
    y: 1.0, x: 1.0,
    xanchor: 'right', yanchor: 'top',
    scroll: true, // Enable scrolling for the legend
    bgcolor: 'rgba(255, 255, 255, 0.6)',
    bordercolor: 'rgba(0, 0, 0, 0.1)',
    borderwidth: 1,
  };
  const getPlotData = (results) => {

    // Extract outputs
    const motifs = Array.from({ length: 18 }, (_, i) =>
      results[`motif${i + 1}`].data
    );
    const motifacts = Array.from({ length: 18 }, (_, i) =>
      results[`motifact${i + 1}`].data
    );
    const effects_motif = results["effects_motif"].data;
    const effects_total = results["effects_total"].data;
    const effects_inr = results["effects_inr"].data;
    const effects_sim = results["effects_sim"].data;

    const y_pred = results["y_pred"].data;
    // Plot data
    const tssList = ['YY1+', 'TATA+', 'U1 snRNP+', 'YY1-', 'ETS+', 'NFY+', 'ETS-', 'NFY-',
      'CREB+', 'CREB-', 'ZNF143+', 'SP+', 'SP-', 'NRF1-', 'NRF1+',
      'ZNF143-', 'TATA-', 'U1 snRNP-'];

    const colorArr = ['#1F77B4', '#E41A1C', '#9F9F9F', '#c2d5e8', '#19d3f3', '#00CC96',
      '#19e4f3', '#00cc5f', '#FF6692', '#ff66c2', '#17a4cf', '#FF7F0E',
      '#ff930e', '#b663fa', '#AB63FA', '#17BECF', '#ffc6ba', '#CFCFCF'];

    const traces = [];
    const xs =
      strand === '+'
      ? range(boxStart.current, boxEnd.current)    // Normal order for '+' strand
      : range(boxEnd.current, boxStart.current, -1); // Reverse coordinates for '-' strand


    // Add Motif Activations to Traces
    motifacts.forEach((data, index) => {
      traces.push({
        x: xs,
        y: data,
        mode: 'lines',
        name: tssList[index],
        line: { color: colorArr[index], width: 1 },
        legendgroup: index.toString(),
        xaxis: 'x1',
        yaxis: 'y1',
      });
    });

    // Add Motif Effect to Traces
    motifs.forEach((data, index) => {
      traces.push({
        x: xs,
        y: data,
        mode: 'lines',
        name: tssList[index],
        line: { color: colorArr[index], width: 1 },
        showlegend: false,
        xaxis: 'x2',
        yaxis: 'y2',
      });
    });

    // Add Effects to Traces
    traces.push({
      x: xs,
      y: effects_motif,
      mode: 'lines',
      name: 'motif_effects',
      line: { color: '#445B88', width: 1 },
      xaxis: 'x3',
      yaxis: 'y3',
    });
    traces.push({
      x: xs,
      y: effects_inr,
      mode: 'lines',
      name: 'inr_effects',
      line: { color: '#445B88', width: 1 },
      xaxis: 'x3',
      yaxis: 'y3',
    });
    traces.push({
      x: xs,
      y: effects_sim,
      mode: 'lines',
      name: 'sim_effects',
      line: { color: '#445B88', width: 1 },
      xaxis: 'x3',
      yaxis: 'y3',
    });

    traces.push({
      x: xs,
      y: y_pred,
      mode: 'lines',
      name: 'y_pred',
      line: { color: '#143066', width: 1 },
      xaxis: 'x4',
      yaxis: 'y4',
    });

    // Set Plot Data and Layout
    return traces;
  }

  const relayout = (updates) => {
    setPlotLayout((prevLayout) => ({
      ...prevLayout,
      ...updates, // Merge new updates into the existing layout
    }));
  };

  // toggle on and off 1k button
  const handle1kToggle = () => {
    const newIs1kMode = !is1kMode;
    setIs1kMode(newIs1kMode);
    const newPlotWidth = newIs1kMode ? boxWidth.current : boxSeqFullWidth.current;
    // updatePlotWidth(newPlotWidth);
    // relayout({ width: newPlotWidth });
    if (!newIs1kMode) { // switching to not 1k mode, aka scroll mode
      // no margin to sync scroll
      relayout({ margin: { l: 0, r: 0, t: 50, b: 20 }, showlegend: false, width: newPlotWidth });
      setTimeout(() => { syncScroll(plotRef.current, seqBoxRef.current); }, 10);
    } else {
      relayout({ margin: { l: plotLeftMargin, r: plotLeftMargin, t: 50, b: 20 }, showlegend: showLegend, width: newPlotWidth, });
    }
  };

  // toggle button for showing legend
  const [showLegend, setShowLegend] = useState(true);

  const toggleLegend = () => {
    const newShowLegend = !showLegend;
    setShowLegend(newShowLegend);
    relayout({ showlegend: newShowLegend });
  };

  // for now only run once at init
  useEffect(() => {
    const initPlot = async () => {
      const inputSequence = plotFullSeq.current; // Replace with your input sequence source
      const outputs = await runInference(inputSequence, '/testnet0.onnx');
      console.log('init plot');
      if (outputs) {
        setPlotData(getPlotData(outputs));
        const xaxisLayout = { tickformat: 'd', autorange: strand === '-' ? 'reversed' : true, };
        setPlotLayout({
          // title: 'Puffin Model Plot',
          xaxis: xaxisLayout,
          xaxis2: xaxisLayout,
          xaxis3: xaxisLayout,
          xaxis4: xaxisLayout,
          height: 500,
          // width: boxSeqFullWidth.current,
          width: is1kMode ? boxWidth.current : boxSeqFullWidth.current,
          template: 'plotly_white',
          grid: { rows: 4, columns: 1, pattern: 'independent' },
          margin: { l: plotLeftMargin, r: plotLeftMargin, t: 50, b: 20 },
          legend: plotLegendLayout,
        });
      }

      // sync to seqbox if not 1k
      if (!is1kMode) {
        setTimeout(() => { syncScroll(plotRef.current, seqBoxRef.current) }, 0);
      }
    };

    if (plotFullSeq.current && seqInited) {
      initPlot();
    }
  }, [seqInited]);

  const ticks = [0, 12.5, 25, 37.5, 50, 62.5, 75, 87.5, 100]; // Tick positions in percentages

  // tracking these values
  const debugVars = { boxSeqFullWidth, boxWidth, viewSeqLen, syncScrollPercent, fullStart, fullEnd, boxStart, boxEnd, fullSeq, boxSeq, viewStart, genome, chromosome, strand, toolTips, plotFullSeq, is1kMode };

  const genomeFormVars = { genome, setGenome, chromosome, setChromosome, coordinate, setCoordinate, strand, setStrand, gene, setGene };

  // Dalliance genome viewer
  const viewerRef = useRef(null);
  const browserRef = useRef(null);

  const updateDallianceCoord = (browserRef, viewStart, viewLen) => {
    if (strand === '+') {
      browserRef.current.setLocation(chromosome, viewStart, Math.round(viewStart + viewLen));
    } else { // minus strand
      browserRef.current.setLocation(chromosome, Math.round(viewStart - viewLen), viewStart);
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
          <div className={`relative`}>
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
            <div className="relative pt-3 pb-3 bg-white border-b border-gray-800">

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
              className="bg-gray-50 pt-1 pb-2 border border-gray-300 overflow-x-auto font-mono"
              ref={seqBoxRef}
              // onScroll={handleScroll}
              onScroll={handleSeqBoxScroll}
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
            </div>
          </div>

          <DallianceViewer
            viewerRef={viewerRef}
            browserRef={browserRef}
            chromosome={chromosome}
          />

          {/* two toggle buttons */}
          <div className="flex justify-between items-center w-full px-1 py-2">
            {/* 1k Mode Toggle */}
            <div className="flex items-center space-x-2">
              <span className="text-gray-700 font-medium">1K Mode (no infinite scroll)</span>
              <label className="relative inline-flex cursor-pointer items-center">
                <input
                  type="checkbox"
                  checked={is1kMode}
                  onChange={handle1kToggle}
                  className="peer sr-only"
                />
                <div className="peer h-6 w-11 rounded-full border bg-slate-200 after:absolute after:left-[2px] after:top-0.5 after:h-5 after:w-5 after:rounded-full after:border after:border-gray-300 after:bg-white after:transition-all after:content-[''] peer-checked:bg-sky-800 peer-checked:after:translate-x-full peer-checked:after:border-white peer-focus:ring-green-300"></div>
              </label>
            </div>

            {/* Legend Toggle */}
            {is1kMode && (<div className="flex items-center space-x-2">
              <span className="text-gray-700 font-medium">Show Legend</span>
              <label className="relative inline-flex cursor-pointer items-center">
                <input
                  type="checkbox"
                  checked={showLegend}
                  onChange={toggleLegend}
                  className="peer sr-only"
                />
                <div className="peer h-6 w-11 rounded-full border bg-slate-200 after:absolute after:left-[2px] after:top-0.5 after:h-5 after:w-5 after:rounded-full after:border after:border-gray-300 after:bg-white after:transition-all after:content-[''] peer-checked:bg-sky-800 peer-checked:after:translate-x-full peer-checked:after:border-white peer-focus:ring-green-300"></div>
              </label>
            </div>)}
          </div>

          {/* plotly puffin */}
          <div className='overflow-x-auto border border-gray-300'
            ref={plotRef}
            onScroll={handlePlotScroll}
          >
            {plotData && plotLayout && boxSeqFullWidth.current ? (
              <Plot
                data={plotData}
                layout={plotLayout}
                config={{ responsive: false }}
              />
            ) : (
              <p>Loading plot...</p>
            )}
          </div>

          <DebugPanel {...debugVars} />
          {/* Center line for debug */}
          <div className="absolute top-0 bottom-0 left-1/2 w-[2px] bg-blue-500"></div>
        </div>

      </div>
    </>
  );
}

export default App;