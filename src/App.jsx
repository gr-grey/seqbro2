import { useEffect, useState, useRef } from 'react';
import './App.css';
import Tippy from '@tippyjs/react';
import 'tippy.js/dist/tippy.css';
import DebugPanel from './DebugPanel';
import NavBar from './NavBar';
import GenomeForm from './GenomeForm';
import DallianceViewer from './DallianceViewer';
import Plot from 'react-plotly.js';
import useDebounce from './useDebounce';

function App() {
  // get sequence
  const [genome, setGenome] = useState("hg38");
  const [chromosome, setChromosome] = useState("chr7");
  const [coordinate, setCoordinate] = useState(5530600);
  const [strand, setStrand] = useState('-');
  const [gene, setGene] = useState('ACTB');

  // constants
  // scrollable content sequence len: 1000 characters
  const boxSeqHalfLen = 500;
  const boxSeqLen = 2 * boxSeqHalfLen;
  // pad 1000 char at a time
  const paddingLen = 1000;
  // starting seq len 3k, display middle 1k in box
  // left and right each has 1k padding
  const initHalfLen = 2000;
  const coordTicks = [0.0, 0.5, 1.0];
  const ticks = [0, 12.5, 25, 37.5, 50, 62.5, 75, 87.5, 100]; // Tick positions in percentages
  const plotTicks = [0, 50, 100]; // Tick positions in percentages


  const plotLeftMargin = 10;
  const plotLegendLayout = {
    y: 1.0, x: 1.0,
    xanchor: 'right', yanchor: 'top',
    scroll: true, // Enable scrolling for the legend
    bgcolor: 'rgba(255, 255, 255, 0.6)',
    bordercolor: 'rgba(0, 0, 0, 0.1)',
    borderwidth: 1,
  };

  const fullStart = useRef(null); const fullEnd = useRef(null);
  const boxStart = useRef(null); const boxEnd = useRef(null);
  const fullSeq = useRef(null);
  const [boxSeq, setBoxSeq] = useState("");

  const seqBoxRef = useRef(null);
  // width of the full seq in seqbox, like 9000px
  const boxSeqFullWidth = useRef(null);
  // seqBox on page, width in px, old clientWidth
  const boxWidth = useRef(null);
  // scrollWidth - clientWidth, the farthest scrollLeft can be
  const scrollLeftMax = useRef(null);
  // of the 1000 char in seqBox, how many are in view box
  const viewSeqLen = useRef(null);
  // coords at left, middle and right of sequence box viewing width
  const [viewCoords, setViewCoords] = useState([]);

  // scrolling and syncing vars
  // track whether we are scrolling in seqbox or in plotbox
  const scrollingBox = useRef(null);
  // record scrollLeft for the other box to sync to
  const scrollLeft = useRef(null);

  // Track if sequence is being replaced
  const [isReplacing, setIsReplacing] = useState(false);
  const [seqInited, setSeqInited] = useState(false);

  // const syncScrollPercent = useRef(0);
  const [commonScrollPercent, setCommonScrollPercent] = useState(0);
  const [toolTips, setToolTips] = useState([]);

  // toggle 1k full view or local sync view
  const [is1kMode, setIs1kMode] = useState(false);

  // global onnx inference session for puffin
  const puffinSession = useRef(null);
  const [isPuffinSessionReady, setIsPuffinSessionReady] = useState(false);
  // plotly plot part
  const [plotData, setPlotData] = useState(null);
  const [plotLayout, setPlotLayout] = useState(null);
  const plotRef = useRef(null);
  // start and end are buffers, save 1k(seq len) plot data
  // up and lower than the current location
  const plotDataStartBuffer = useRef([]);
  const plotDataView = useRef([]);
  const plotDataEndBuffer = useRef([]);

  // Dalliance genome viewer
  const viewerRef = useRef(null);
  const browserRef = useRef(null);

  // left < and right > buttons with continuous scrolling
  const [scrollInterval, setScrollInterval] = useState(null);

  // plot configure from puffin.config.json in public folder
  // const [config, setConfig] = useState(null);
  const puffinConfig = useRef(null);

  useEffect(() => {
    const loadModelAndConfig = async () => {
      try {
        const response = await fetch('/puffin.config.json');
        const data = await response.json();
        puffinConfig.current = data;
        // init puffin session at the beginning
        puffinSession.current = await window.ort.InferenceSession.create(data.modelPath);
        setIsPuffinSessionReady(true);
        console.log('Model and config loaded from puffin.config.json.');

      } catch (error) {
        console.error('Error loading configuration and initing model', error);
      }
    };
    loadModelAndConfig();
  }, []);


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

  // coords of viewing part of seqbox, left -> right: tick percent 0 -> 1
  const getViewCoords = (start, scrollChar, clientChar, scrollPercent, tickPercent) => {
    if (strand === '+') {
      return Math.floor(start + (scrollChar - clientChar) * scrollPercent + tickPercent * clientChar);
    } else {
      return Math.ceil(start + scrollChar - (scrollChar - clientChar) * scrollPercent - tickPercent * clientChar);
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

  // get indices for slicing the fullseq and get substring
  // with genomic coordinates, with strand consideration
  const getSliceIndicesFromCoords = (fullStart, fullEnd, subStart, subEnd) => {
    if (strand === '+') {
      return [subStart - fullStart, subEnd - fullStart];
    } else {
      return [fullEnd - subEnd, fullEnd - subStart];
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
      const [slice_start, slice_end] = getSliceIndicesFromCoords(full_start, full_end, box_start, box_end);
      setBoxSeq(seq.slice(slice_start, slice_end));

      setTimeout(() => {
        setSeqInited(true);
        // init tooltips
        setToolTips(getToolTips(box_start, box_end, strand));
      }, 10);
    }
    init();
  }, [chromosome, coordinate, strand]);

  // manually scroll to 50% after sequences were inited
  useEffect(() => {
    if (seqBoxRef.current && seqInited) {
      // set box widths (client and scroll width) after sequences were set
      const full_w = seqBoxRef.current.scrollWidth;
      const view_w = seqBoxRef.current.clientWidth;
      const lmax = full_w - view_w;
      // seq len = 1000, even num, need to shift right by half a character
      const middlePoint = 0.500 + 1 / boxSeqLen / 2;
      seqBoxRef.current.scrollLeft = lmax * middlePoint;
      // init scrollLeft value and scrollBox
      scrollLeft.current = lmax * middlePoint;
      scrollingBox.current = 'seqBox';

      // init viewing char number
      const viewLen = boxSeqLen / full_w * view_w;
      viewSeqLen.current = viewLen;
      // update global varialbes
      boxSeqFullWidth.current = full_w;
      boxWidth.current = view_w;
      scrollLeftMax.current = lmax;
      // syncScrollPercent.current = middlePoint;
      setCommonScrollPercent(middlePoint);

      // init view coords on tick/ ruler
      setViewCoords(coordTicks.map(i => getViewCoords(boxStart.current, boxSeqLen, viewLen, middlePoint, i)));
    }
  }, [seqInited]);

  // update sequence box size dimensions
  const updateSeqBoxWidths = () => {
    if (seqBoxRef.current && boxSeqFullWidth.current) {
      // scrollWidth is fixed once the first display seq is loaded
      const full_w = boxSeqFullWidth.current;
      const box_w = seqBoxRef.current.clientWidth;
      const leftEnd = full_w - box_w;
      const scroll_left = seqBoxRef.current.scrollLeft;
      const scrollPercent = scroll_left / leftEnd;

      const viewLen = boxSeqLen / full_w * box_w;
      // coords on tick/ ruler in view port
      const viewCoords = coordTicks.map(i => getViewCoords(boxStart.current, boxSeqLen, viewLen, scrollPercent, i));
      setViewCoords(viewCoords);

      // update varaibles
      boxWidth.current = box_w;
      viewSeqLen.current = viewLen;
      // syncScrollPercent.current = scrollPercent;
      setCommonScrollPercent(scrollPercent);
      scrollLeft.current = scroll_left;
      scrollLeftMax.current = leftEnd;

      // update plot widths for 1k view
      if (is1kMode) { relayout({ width: box_w }); }
    }
  };

  // update scroll and client width upon resizing
  useEffect(() => {
    const observer = new ResizeObserver(() => { updateSeqBoxWidths(); });

    if (seqBoxRef.current) { observer.observe(seqBoxRef.current); }

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
    let newBoxStart, newBoxEnd, sliceStart, sliceEnd, updateSeq;
    // swapping when scrolling to the left edge
    if ((edge === 'left' && strand === '+') || (edge === 'right' && strand === '-')) {
      newBoxStart = boxStart.current - boxSeqHalfLen;
      newBoxEnd = newBoxStart + boxSeqLen;
      updateSeq = newBoxStart - 500 <= fullStart.current ? true : false;
    } else {
      newBoxStart = boxStart.current + boxSeqHalfLen;
      newBoxEnd = newBoxStart + boxSeqLen;
      updateSeq = newBoxEnd + 500 >= fullEnd.current ? true : false;
    }

    [sliceStart, sliceEnd] = getSliceIndicesFromCoords(fullStart.current, fullEnd.current, newBoxStart, newBoxEnd);
    return { newBoxStart, newBoxEnd, sliceStart, sliceEnd, updateSeq };
  };

  // modularize handle scroll, separate infinite scrolling and syncing
  // set scrollingBox based on where the mouse is
  const handleMouseEnterSeqBox = () => { scrollingBox.current = 'seqBox'; };
  const handleMouseEnterPlot = () => { scrollingBox.current = 'plot'; };

  // update plot data after swapping
  const updatePlotBuffers = async (direction, newBoxStart, newBoxEnd) => {
    let newStartBuffer, newViewData, newEndBuffer;
    if ((direction === 'left' && strand === '+') || (direction === 'right' && strand === '-')) {
      // shift every thing to left by 500
      const [start, end] = [newBoxStart - boxSeqHalfLen, newBoxEnd - boxSeqHalfLen];
      const [sliceStart, sliceEnd] = getSliceIndicesFromCoords(fullStart.current, fullEnd.current, start, end);
      // run inference and get data
      const outputs = await runInference(fullSeq.current.slice(sliceStart - puffinConfig.current.puffinOffset, sliceEnd + puffinConfig.current.puffinOffset));
      newStartBuffer = getPlotData(outputs, start, end);
      newViewData = plotDataStartBuffer.current;
      newEndBuffer = plotDataView.current;

    } else {
      // shift every thing right by 500
      const [start, end] = [newBoxStart + boxSeqHalfLen, newBoxEnd + boxSeqHalfLen];
      const [sliceStart, sliceEnd] = getSliceIndicesFromCoords(fullStart.current, fullEnd.current, start, end);
      // run inference and get data
      const outputs = await runInference(fullSeq.current.slice(sliceStart - puffinConfig.current.puffinOffset, sliceEnd + puffinConfig.current.puffinOffset));
      newStartBuffer = plotDataView.current;
      newViewData = plotDataEndBuffer.current;
      newEndBuffer = getPlotData(outputs, start, end);
    }
    // udpate reference
    plotDataStartBuffer.current = newStartBuffer;
    plotDataView.current = newViewData;
    plotDataEndBuffer.current = newEndBuffer;
  };

  // Helper to handle sequence swapping
  const triggerInfiniteScroll = (direction) => {

    const seqBoxElem = seqBoxRef.current;
    const plotElem = plotRef.current;
    const full_w = boxSeqFullWidth.current;
    setIsReplacing(true);
    const { newBoxStart, newBoxEnd, sliceStart, sliceEnd, updateSeq } =
      getSwapSeqCoords(direction);
    // swap with new sequence in seqbox
    setBoxSeq(fullSeq.current.slice(sliceStart, sliceEnd));

    // swap with plot
    if ((direction === 'left' && strand === '+') || (direction === 'right' && strand === '-')) {
      setPlotData(plotDataStartBuffer.current);
    } else { setPlotData(plotDataEndBuffer.current); }

    // first update display, then update sequence (if needed)
    // then update plot buffer - always
    setTimeout(async () => {
      // scroll by half width to keep the same sequence in display
      if (direction === "left") {
        seqBoxElem.scrollLeft += 0.5 * full_w;
        plotElem.scrollLeft += 0.5 * full_w;
      } else {
        seqBoxElem.scrollLeft -= 0.5 * full_w;
        plotElem.scrollLeft -= 0.5 * full_w;
      }

      setIsReplacing(false);
      boxStart.current = newBoxStart;
      boxEnd.current = newBoxEnd;

      // Update the full sequence if needed
      if (updateSeq) { await updateFullSeq(direction); }

      // Once full sequence is updated, update plot buffers
      await updatePlotBuffers(direction, newBoxStart, newBoxEnd);
      setToolTips(getToolTips(newBoxStart, newBoxEnd, strand));

    }, 10);
  };

  // Sequence box scroll handler, handles infinite scroll for both seqbox and plot
  const handleSeqBoxScroll = () => {
    const seqElem = seqBoxRef.current;
    const scroll_left = seqElem.scrollLeft;
    const scrollPercent = scroll_left / scrollLeftMax.current;

    setViewCoords(coordTicks.map(i => getViewCoords(boxStart.current, boxSeqLen, viewSeqLen.current, scrollPercent, i)));
    // udpate reference tracker
    scrollLeft.current = scroll_left;
    // syncScrollPercent.current = scrollPercent;
    setCommonScrollPercent(scrollPercent);

    // disable infinite scrolling when in 1k mode
    if (!is1kMode && scrollPercent < 0.05 && !isReplacing) {
      triggerInfiniteScroll("left");
    } else if (!is1kMode && scrollPercent > 0.95 && !isReplacing) {
      triggerInfiniteScroll("right");
    }

    // Sync plot scrolling
    if (!is1kMode && scrollingBox.current === 'seqBox' && !isReplacing) {
      plotRef.current.scrollLeft = scroll_left;
    }
  };

  // Plot scroll handler, only syncs
  // other functionalities are done via scrolling seqbox
  const handlePlotScroll = () => {
    if (!is1kMode && scrollingBox.current === 'plot' && !isReplacing) {
      seqBoxRef.current.scrollLeft = plotRef.current.scrollLeft;
    }
  };

  // pad left or right when needed
  const updateFullSeq = async (direction) => {
    let padSeq;
    if ((direction === 'left' && strand === '+') || (direction === 'right' && strand === '-')) {
      const start = fullStart.current;
      // retrive 1000 (padding len) left to the current starting coord
      padSeq = await fetchSequence(start - paddingLen, start);
      fullStart.current = start - paddingLen; // Adjust seqStart
    } else {
      const end = fullEnd.current;
      padSeq = await fetchSequence(end, end + paddingLen);
      fullEnd.current = end + paddingLen;
    }
    // update fullSeq
    if (direction === 'left') { // prepend on left
      fullSeq.current = padSeq + fullSeq.current;
    } else { // append on right
      fullSeq.current = fullSeq.current + padSeq;
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

  // helper function to encode sequence
  const encodeSequence = (inputSequence) => {
    const seqEncoded = Array.from(inputSequence).map((char) => {
      switch (char) {
        case 'A': return [1, 0, 0, 0];
        case 'C': return [0, 1, 0, 0];
        case 'G': return [0, 0, 1, 0];
        case 'T': return [0, 0, 0, 1];
        default: return [0, 0, 0, 0];
      }
    });
    // transpose seqlen by 4 to 4 by seq_len
    return seqEncoded[0].map((_, colIndex) => seqEncoded.map(row => row[colIndex]));
  };

  const runInference = async (inputSequence) => {
    try {
      if (!puffinSession.current) {
        throw new Error('Model session is not initialized.');
      }

      // Encode the sequence
      const seqEncoded = encodeSequence(inputSequence);
      const seqEncodedTensor = new ort.Tensor('float32', seqEncoded.flat(), [1, 4, inputSequence.length]);

      // Run inference
      const feeds = { [puffinSession.current.inputNames[0]]: seqEncodedTensor };
      const results = await puffinSession.current.run(feeds);

      return results;
    } catch (error) {
      console.error("Error running inference:", error);
      return null;
    }
  };

  // start coord < end coord, same for + and -
  const getPlotData = (results, start, end) => {

    const xs = strand === '+' ? range(start, end) : range(end, start, -1); // Reverse coordinates for '-' strand
    // Dynamically create traces based on YAML configuration
    const test_traces = puffinConfig.current.traces.map((traceConfig) => {
      const yData = results[traceConfig.result_key]?.data; // Extract data using result_key
      if (!yData) return null; // Skip if data is unavailable

      return {
        x: xs,
        y: yData,
        mode: traceConfig.mode,
        name: traceConfig.name,
        line: traceConfig.line,
        xaxis: traceConfig.xaxis,
        yaxis: traceConfig.yaxis,
      };
    });
    return test_traces;
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
    if (!newIs1kMode) { // switching to not 1k mode, aka scroll mode
      // no margin to sync scroll
      relayout({ margin: { l: 0, r: 0, t: plotTopMargin, b: plotBottomMargin }, showlegend: false, width: newPlotWidth });
      setTimeout(() => { plotRef.current.scrollLeft = scrollLeft.current; }, 10);
    } else {
      relayout({ margin: { l: plotLeftMargin, r: plotLeftMargin, t: plotTopMargin, b: plotBottomMargin }, showlegend: showLegend, width: newPlotWidth, });
    }
  };

  // toggle button for showing legend
  const [showLegend, setShowLegend] = useState(false);

  const toggleLegend = () => {
    const newShowLegend = !showLegend;
    setShowLegend(newShowLegend);
    relayout({ showlegend: newShowLegend });
  };

  const [plotDivHeight, setPlotDivHeight] = useState(500);
  const plotTopMargin = 0;
  const plotBottomMargin = 15;
  // const rulerHeight = 30;

  // reruns everytime initSeq changes, which happens when genome form is updated
  // and fullSeq and everything gets reset
  useEffect(() => {
    const initPlot = async () => {
      // absolute coordinates 
      const [viewStart, viewEnd] = [boxStart.current, boxEnd.current];
      const [startBufferStart, startBufferEnd] = [viewStart - boxSeqHalfLen, viewEnd - boxSeqHalfLen];
      const [endBufferStart, endBufferEnd] = [viewStart + boxSeqHalfLen, viewEnd + boxSeqHalfLen];
      // slicing coords
      const [viewSliceStart, viewSliceEnd] = getSliceIndicesFromCoords(fullStart.current, fullEnd.current, viewStart - puffinConfig.current.puffinOffset, viewEnd + puffinConfig.current.puffinOffset);
      const [startSliceStart, startSliceEnd] = getSliceIndicesFromCoords(fullStart.current, fullEnd.current, startBufferStart - puffinConfig.current.puffinOffset, startBufferEnd + puffinConfig.current.puffinOffset);
      const [endSliceStart, endSliceEnd] = getSliceIndicesFromCoords(fullStart.current, fullEnd.current, endBufferStart - puffinConfig.current.puffinOffset, endBufferEnd + puffinConfig.current.puffinOffset);

      const viewSeq = fullSeq.current.slice(viewSliceStart, viewSliceEnd);
      const startBufferSeq = fullSeq.current.slice(startSliceStart, startSliceEnd);
      const endBufferSeq = fullSeq.current.slice(endSliceStart, endSliceEnd);

      const outputs = await runInference(viewSeq);
      console.log('init plot, run infernce for view sequence and left righ buffer');
      if (outputs) {
        const plotData = getPlotData(outputs, boxStart.current, boxEnd.current);
        setPlotData(plotData);
        plotDataView.current = plotData;
        const xaxisLayout = { tickformat: 'd', autorange: strand === '-' ? 'reversed' : true, };
        const totalPlots = puffinConfig.current.grid.rows * puffinConfig.current.grid.columns;
        const axisLayout = {};
        for (let i = 0; i < totalPlots; i++) {
          axisLayout[`xaxis${i + 1}`] = xaxisLayout;
        }
        setPlotLayout({
          // title: 'Puffin Model Plot',
          ...axisLayout,
          height: plotDivHeight,
          grid: puffinConfig.current.grid,
          width: is1kMode ? boxWidth.current : boxSeqFullWidth.current,
          template: 'plotly_white',
          margin: { l: plotLeftMargin, r: plotLeftMargin, t: plotTopMargin, b: plotBottomMargin },
          legend: plotLegendLayout,
          showlegend: showLegend,
        });
      }

      const startBufferOutputs = await runInference(startBufferSeq);
      const endBufferOutputs = await runInference(endBufferSeq);
      // set plot data for start and end buffers
      plotDataStartBuffer.current = getPlotData(startBufferOutputs, startBufferStart, startBufferEnd);
      plotDataEndBuffer.current = getPlotData(endBufferOutputs, endBufferStart, endBufferEnd);

      if (!is1kMode && plotRef.current && scrollLeftMax.current) {
        // manually scroll to halfway
        const middlePoint = 0.500 + 1 / boxSeqLen / 2;
        setTimeout(() => { plotRef.current.scrollLeft = middlePoint * scrollLeftMax.current; }, 10);
      }
    };
    // this updates plot whenever sequence gets reinit via form
    if (seqInited && isPuffinSessionReady) {

      initPlot();
    }
  }, [seqInited, isPuffinSessionReady]);

  const getPlotLinePercentage = (commonScrollPercent) => {
    const percent = (commonScrollPercent * (boxSeqLen - viewSeqLen.current) + viewSeqLen.current/2) / boxSeqLen;
    // adjust for left margin
    const fullLen = boxWidth.current - 2 * plotLeftMargin;
    const adjustedPercent = (plotLeftMargin + percent*fullLen) / boxWidth.current;
    return adjustedPercent * 100;
  };


  // tracking these values
  const debugVars = { boxSeqFullWidth, boxWidth, viewSeqLen, commonScrollPercent, fullStart, fullEnd, boxStart, boxEnd, fullSeq, boxSeq, genome, chromosome, strand, toolTips, is1kMode, scrollingBox, scrollLeft, scrollLeftMax, viewCoords, plotDivHeight, plotLayout };

  const genomeFormVars = { genome, setGenome, chromosome, setChromosome, coordinate, setCoordinate, strand, setStrand, gene, setGene };

  // sync dalliance genome browser as seq view box start, mid and end coord changes
  useEffect(() => {
    if (browserRef.current && viewCoords.length && viewCoords[0] && viewCoords[2]) {
      if (strand === '+') {
        browserRef.current.setLocation(chromosome, viewCoords[0], viewCoords[2]);
      } else { // minus strand
        browserRef.current.setLocation(chromosome, viewCoords[2], viewCoords[0]);
      }
    }
  }, [viewCoords]);


  const handleMouseDownResize = (e) => {
    e.preventDefault();

    // Attach event listeners for dragging
    document.addEventListener("mousemove", handleMouseMoveResize);
    document.addEventListener("mouseup", handleMouseUpResize);
  };

  const handleMouseMoveResize = (e) => {
    setPlotDivHeight((prevHeight) => {
      const newHeight = prevHeight + e.movementY;
      return Math.max(100, newHeight); // Set a minimum height to avoid collapsing
    });
  };

  const handleMouseUpResize = () => {
    // Remove event listeners when resizing stops
    document.removeEventListener("mousemove", handleMouseMoveResize);
    document.removeEventListener("mouseup", handleMouseUpResize);
  };

  // prevent excessive rerendering when resize plot area
  const debouncedHeight = useDebounce(plotDivHeight, 200);

  useEffect(() => {
    relayout({ height: debouncedHeight });
  }, [debouncedHeight]);

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
            {viewCoords.length && <div className="relative pt-3 pb-3 bg-white border-b border-gray-800">

              <div className="absolute pt-1 top-0 left-1/2 text-xs text-blue-600"
                style={{ left: "0%", transform: "translateX(0%)" }}
              >
                {Math.floor(viewCoords[0])}
              </div>

              <div className="absolute pt-1 top-0 transform -translate-x-1/2 text-xs text-blue-600"
                style={{ left: "50%" }}
              >
                {Math.floor(viewCoords[1])}
              </div>

              <div className="absolute pt-1 top-0 left-1/2 text-xs text-blue-600"
                style={{ left: "100%", transform: "translateX(-100%)" }}
              >
                {Math.floor(viewCoords[2])}
              </div>

              {ticks.map((pos, index) => (
                <div key={index} className="absolute top-5 bottom-0 w-[3px] bg-blue-500"
                  style={{ left: `${pos}%` }}
                ></div>
              ))}
            </div>}

            <div className='relative'>
              <div
                className="bg-white border border-gray-300 overflow-x-auto font-mono"
                ref={seqBoxRef}
                onScroll={handleSeqBoxScroll}
                style={{ whiteSpace: "nowrap" }}
                onMouseEnter={handleMouseEnterSeqBox}
              >
                {/* Red center line in sequence box */}
                <div
                  className="absolute top-0 bottom-0 w-[2px] bg-gray-500"
                  style={{ left: "50%" }}
                ></div>
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
          {/* <div className='relative'>
            <div className='overflow-x-auto border border-gray-300'
              ref={plotRef}
              onScroll={handlePlotScroll}
              onMouseEnter={handleMouseEnterPlot}
              style={{ height: `${plotDivHeight}px` }} // Set dynamic height
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
            <div
              className="w-full h-2 bg-gray-400 cursor-row-resize"
              onMouseDown={handleMouseDownResize}
            ></div>
          </div> */}
          <div className="relative">
            {/* title area */}
            {plotData && <div className="w-full h-4 mb-4 text-xl flex items-center justify-center">{puffinConfig.current.title}</div>}

            {/* Plot area */}
            <div className='relative'>
              <div
                className="overflow-x-auto border border-red-500"
                ref={plotRef}
                onScroll={handlePlotScroll}
                onMouseEnter={handleMouseEnterPlot}
                style={{ height: `${plotDivHeight + plotBottomMargin}px` }} // Set dynamic height
              >
                {/* Plotly plot */}
                {plotData && plotLayout && boxSeqFullWidth.current ? (
                  <>
                    <Plot
                      data={plotData}
                      layout={plotLayout}
                      config={{ responsive: false }}
                    />
                    <div className="absolute top-0 left-0 w-full h-full pointer-events-none">
                      {/* Central vertical line */}
                      <div
                        className="absolute h-full w-[2px] bg-gray-500 opacity-60"
                        style={{
                          // left: '50%', // Position at the horizontal center
                          left: is1kMode ? `${ getPlotLinePercentage(commonScrollPercent)}%` : '50%', 
                          zIndex: 1, // Place below subtitles
                        }}
                      ></div>
                      {puffinConfig.current.subtitles.map((title, index) => (
                        <div
                          key={index}
                          className="absolute w-full text-center text-sm font-semibold text-gray-700"
                          style={{
                            top: `${index * 25}%`, // Position each title vertically
                            transform: 'translateY(-75%)', // Center vertically relative to the calculated position
                          }}
                        >
                          {title}
                        </div>
                      ))}
                    </div>
                  </>
                ) : (
                  <p>Loading plot...</p>
                )}
              </div>
            </div>

            {/* axis area*/}
            <div
              className="relative w-full h-[30px] border-t border-gray-700"
            >

              {/* Ticks */}
              {plotTicks.map((pos, index) => (
                <div
                  key={index}
                  className="absolute w-[3px] h-2 bg-blue-500"
                  style={{
                    left: `${pos}%`, // Position ticks along the width
                    top: "0%", // Align ticks with the axis line
                  }}
                ></div>
              ))}
              {/* Coordinates */}
              <div>
                {viewCoords.length > 0 && (
                  <>
                    <div
                      className="absolute text-xs text-blue-600"
                      style={{
                        left: "0%", bottom: "0%", transform: "translateX(0%)",
                      }}
                    >
                      {Math.floor(viewCoords[0])}
                    </div>
                    <div
                      className="absolute text-xs text-blue-600"
                      style={{
                        left: "50%", bottom: "0%", transform: "translateX(-50%)",
                      }}
                    >
                      {Math.floor(viewCoords[1])}
                    </div>
                    <div
                      className="absolute text-xs text-blue-600"
                      style={{
                        left: "100%", bottom: "0%", transform: "translateX(-50%)",
                      }}
                    >
                      {Math.floor(viewCoords[2])}
                    </div>
                  </>
                )}
              </div>

            </div>

            {/* Resize line */}
            <div
              className="w-full h-1 bg-gray-500 cursor-row-resize"
              onMouseDown={handleMouseDownResize}
            ></div>
          </div>

          <DebugPanel {...debugVars} />
          {/* Center line for debug */}
          {/* <div className="absolute top-0 bottom-0 left-1/2 w-[2px] bg-blue-500"></div> */}
        </div>

      </div>
    </>
  );
}

export default App;