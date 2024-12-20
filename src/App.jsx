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
  const initHalfLen = 2000;

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
  const coordTicks = [0.0, 0.5, 1.0];

  // scrolling and syncing vars
  // track whether we are scrolling in seqbox or in plotbox
  const scrollingBox = useRef(null);
  // record scrollLeft for the other box to sync to
  const scrollLeft = useRef(null);

  // Track if sequence is being replaced
  const [isReplacing, setIsReplacing] = useState(false);
  const [seqInited, setSeqInited] = useState(false);

  const syncScrollPercent = useRef(0);
  const [toolTips, setToolTips] = useState([]);

  // toggle 1k full view or local sync view
  const [is1kMode, setIs1kMode] = useState(false);

  // inference
  const plotFullSeq = useRef(null);
  // puffin inference lose 325 from start and end
  const puffin_offset = 325;
  // plotly plot part
  const [plotData, setPlotData] = useState(null);
  const [plotLayout, setPlotLayout] = useState(null);
  const plotRef = useRef(null);
  // start and end are buffers, save 1k(seq len) plot data
  // up and lower than the current location
  const plotDataStartBuffer = useRef([]);
  const plotDataView = useRef([]);
  const plotDataEndBuffer = useRef([]);

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
      syncScrollPercent.current = middlePoint;

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
      syncScrollPercent.current = scrollPercent;
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
      const outputs = await runInference(fullSeq.current.slice(sliceStart - puffin_offset, sliceEnd + puffin_offset));
      newStartBuffer = getPlotData(outputs, start, end);
      newViewData = plotDataStartBuffer.current;
      newEndBuffer = plotDataView.current;

    } else {
      // shift every thing right by 500
      const [start, end] = [newBoxStart + boxSeqHalfLen, newBoxEnd + boxSeqHalfLen];
      const [sliceStart, sliceEnd] = getSliceIndicesFromCoords(fullStart.current, fullEnd.current, start, end);
      // run inference and get data
      const outputs = await runInference(fullSeq.current.slice(sliceStart - puffin_offset, sliceEnd + puffin_offset));
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
    syncScrollPercent.current = scrollPercent;

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

  // global onnx inference session for puffin
  const puffinSession = useRef(null);
  const [isPuffinSessionReady, setIsPuffinSessionReady] = useState(false);
  const modelPath = '/testnet0.onnx';

  const runInference = async (inputSequence) => {
    try {
      // const session = await window.ort.InferenceSession.create(modelPath);
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

  // init puffin session at the beginning
  useEffect(() => {
    const initializeModel = async () => {
      try {
        puffinSession.current = await window.ort.InferenceSession.create(modelPath);
        console.log('Model initialized');
        setIsPuffinSessionReady(true);
      } catch (error) {
        console.error(`Error initializing model`, error);
      }
    };

    initializeModel();
  }, []);

  const plotLeftMargin = 10;
  const plotLegendLayout = {
    y: 1.0, x: 1.0,
    xanchor: 'right', yanchor: 'top',
    scroll: true, // Enable scrolling for the legend
    bgcolor: 'rgba(255, 255, 255, 0.6)',
    bordercolor: 'rgba(0, 0, 0, 0.1)',
    borderwidth: 1,
  };

  // start coord < end coord, same for + and -
  const getPlotData = (results, start, end) => {

    // Extract outputs
    const motifs = Array.from({ length: 18 }, (_, i) =>
      results[`motif${i + 1}`].data
    );
    const motifacts = Array.from({ length: 18 }, (_, i) =>
      results[`motifact${i + 1}`].data
    );
    const effects_motif = results["effects_motif"].data;
    // const effects_total = results["effects_total"].data;
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
    const xs = strand === '+' ? range(start, end) : range(end, start, -1); // Reverse coordinates for '-' strand

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
    if (!newIs1kMode) { // switching to not 1k mode, aka scroll mode
      // no margin to sync scroll
      relayout({ margin: { l: 0, r: 0, t: 50, b: 20 }, showlegend: false, width: newPlotWidth });
      setTimeout(() => { plotRef.current.scrollLeft = scrollLeft.current; }, 10);
    } else {
      relayout({ margin: { l: plotLeftMargin, r: plotLeftMargin, t: 50, b: 20 }, showlegend: showLegend, width: newPlotWidth, });
    }
  };

  // toggle button for showing legend
  const [showLegend, setShowLegend] = useState(false);

  const toggleLegend = () => {
    const newShowLegend = !showLegend;
    setShowLegend(newShowLegend);
    relayout({ showlegend: newShowLegend });
  };

  // reruns everytime initSeq changes, which happens when genome form is updated
  // and fullSeq and everything gets reset
  useEffect(() => {
    const initPlot = async () => {
      // absolute coordinates 
      const [viewStart, viewEnd] = [boxStart.current, boxEnd.current];
      const [startBufferStart, startBufferEnd] = [viewStart - boxSeqHalfLen, viewEnd - boxSeqHalfLen];
      const [endBufferStart, endBufferEnd] = [viewStart + boxSeqHalfLen, viewEnd + boxSeqHalfLen];
      // slicing coords
      const [viewSliceStart, viewSliceEnd] = getSliceIndicesFromCoords(fullStart.current, fullEnd.current, viewStart - puffin_offset, viewEnd + puffin_offset);
      const [startSliceStart, startSliceEnd] = getSliceIndicesFromCoords(fullStart.current, fullEnd.current, startBufferStart - puffin_offset, startBufferEnd + puffin_offset);
      const [endSliceStart, endSliceEnd] = getSliceIndicesFromCoords(fullStart.current, fullEnd.current, endBufferStart - puffin_offset, endBufferEnd + puffin_offset);

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

  const ticks = [0, 12.5, 25, 37.5, 50, 62.5, 75, 87.5, 100]; // Tick positions in percentages

  // tracking these values
  const debugVars = { boxSeqFullWidth, boxWidth, viewSeqLen, syncScrollPercent, fullStart, fullEnd, boxStart, boxEnd, fullSeq, boxSeq, genome, chromosome, strand, toolTips, plotFullSeq, is1kMode, scrollingBox, scrollLeft, scrollLeftMax, viewCoords, plotData };

  const genomeFormVars = { genome, setGenome, chromosome, setChromosome, coordinate, setCoordinate, strand, setStrand, gene, setGene };

  // Dalliance genome viewer
  const viewerRef = useRef(null);
  const browserRef = useRef(null);

  // sync dalliance genome browser as seq view box start, mid and end coord changes
  useEffect(() => {
    if (browserRef.current && viewCoords.length) {
      if (strand === '+') {
        browserRef.current.setLocation(chromosome, viewCoords[0], viewCoords[2]);
      } else { // minus strand
        browserRef.current.setLocation(chromosome, viewCoords[2], viewCoords[0]);
      }
    }
  }, [viewCoords]);

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

            <div
              className="bg-gray-50 pt-1 pb-2 border border-gray-300 overflow-x-auto font-mono"
              ref={seqBoxRef}
              // onScroll={handleScroll}
              onScroll={handleSeqBoxScroll}
              style={{ whiteSpace: "nowrap" }}
              onMouseEnter={handleMouseEnterSeqBox}
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
            onMouseEnter={handleMouseEnterPlot}
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