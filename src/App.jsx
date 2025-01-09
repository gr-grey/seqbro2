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
import { range, encodeSequence, getViewCoords, fetchSequence, getSliceIndicesFromCoords, hexToHsl, hslToCss, } from './utils';

function App() {
  // get sequence
  const [genome, setGenome] = useState("hg38");
  const [chromosome, setChromosome] = useState("chr7");
  const [coordinate, setCoordinate] = useState(5530600);
  const [strand, setStrand] = useState('+');
  const [gene, setGene] = useState('ACTB');

  // constants
  // scrollable content sequence len: 1000 characters
  const boxSeqHalfLen = 1000;
  const boxSeqLen = 2 * boxSeqHalfLen;
  const paddingLen = 4000;
  const fullSeqLenCap = 12000; // len limit for fullseq
  // starting seq len 4k, display middle 1k in box
  const initHalfLen = 2500;
  const coordTicks = [0.0, 0.5, 1.0];
  const ticks = [0, 12.5, 25, 37.5, 50, 62.5, 75, 87.5, 100]; // Tick positions in percentages

  // testing 2k plot seq
  // double the box width to be plot widht
  const plotSeqHalfLen = 1000;
  const plotRefScrollLeftMax = useRef(null);
  const plotRefViewSeqHalfLen = plotSeqHalfLen / 2;

  const plotLeftMargin = 0;

  const plotLegendLayout = (xval) => {
    return ({
      y: 1.0, x: xval,
      xanchor: 'right', yanchor: 'top',
      scroll: true, // Enable scrolling for the legend
      bgcolor: 'rgba(255, 255, 255, 0.6)',
      bordercolor: 'rgba(0, 0, 0, 0.1)',
      borderwidth: 1,
    });
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
  // updating stuff in the background
  // if we are still setting the background sequence and buffers
  // do not trigger replacing activities
  const [isUpdatingBack, setIsUpdatingBack] = useState(false);
  const [commonScrollPercent, setCommonScrollPercent] = useState(0);

  // toggle 1k full view or local sync view
  const [is1kMode, setIs1kMode] = useState(true);

  // global onnx inference session for puffin
  const puffinSession = useRef(null);
  const [isPuffinSessionReady, setIsPuffinSessionReady] = useState(false);
  const annoSession = useRef(null);

  // plotly plot part
  const [plotDivHeight, setPlotDivHeight] = useState(500);
  const plotTopMargin = 0;
  const plotBottomMargin = 15;

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

  // toggle on and off helper line
  const [showCentralLine, setShowCentralLine] = useState(false);

  // toggle button for showing legend
  const [showLegend, setShowLegend] = useState(false);

  // annotation colors, tooltips
  const [tooltips, setTooltips] = useState([]);
  // background color for motifs
  const [annoColors, setAnnoColors] = useState([]);
  const tooltipsStartBuffer = useRef([]);
  const tooltipsView = useRef([]);
  const tooltipsEndBuffer = useRef([]);
  const annoColorsStartBuffer = useRef([]);
  const annoColorsView = useRef([]);
  const annoColorsEndBuffer = useRef([]);

  const colorArrInHsl = useRef([]);
  const motifNameArr = useRef([]);
  const scaledAnnoScoresThreshold = useRef(null);

  // squeeze 1k seq, set width so all 1k fits in
  const [oneKCharWidth, setOneKCharWidth] = useState(null);

  const [isPlotInited, setIsPlotInited] = useState(false);

  useEffect(() => {
    const loadModelAndConfig = async () => {
      try {
        const response = await fetch('/puffin.config.json');
        const data = await response.json();
        puffinConfig.current = data;
        // init puffin session at the beginning
        puffinSession.current = await window.ort.InferenceSession.create(data.modelPath);
        annoSession.current = await window.ort.InferenceSession.create(data.annoModelPath);
        setIsPuffinSessionReady(true);
        console.log('Model and config loaded from puffin.config.json.');

      } catch (error) {
        console.error('Error loading configuration and initing model', error);
      }
    };
    loadModelAndConfig();
  }, []);

  // load initial sequence
  useEffect(() => {
    const init = async () => {
      setSeqInited(false);
      const full_start = coordinate - initHalfLen;
      const full_end = coordinate + initHalfLen;
      const box_start = coordinate - boxSeqHalfLen;
      const box_end = coordinate + boxSeqHalfLen;
      const seq = await fetchSequence(full_start, full_end, genome, chromosome, strand);

      // update coords
      fullStart.current = full_start;
      fullEnd.current = full_end;
      boxStart.current = box_start;
      boxEnd.current = box_end;
      // update sequence
      fullSeq.current = seq;
      const [slice_start, slice_end] = getSliceIndicesFromCoords(full_start, full_end, box_start, box_end, strand);
      setBoxSeq(seq.slice(slice_start, slice_end));

      setTimeout(() => {
        setSeqInited(true);
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
      setViewCoords(coordTicks.map(i => getViewCoords(boxStart.current, boxSeqLen, viewLen, middlePoint, i, strand)));

      // set oneK seq character width
      setOneKCharWidth(view_w / boxSeqLen);
    }
  }, [seqInited]);


  // calculate scroll left position to align the center coord
  const getPlotScrollLeftPercent = (cenCoord) => {
    // plus strand only for now
    const [scrollStartCoord, scrollEndCoord] = [boxStart.current + plotRefViewSeqHalfLen, boxEnd.current - plotRefViewSeqHalfLen];
    // number of coords needed to scroll
    const scrollCoord = strand === '+' ? cenCoord - scrollStartCoord : scrollEndCoord - cenCoord;
    if (scrollCoord <= 0) {
      return 0;
    } else if (scrollCoord >= plotSeqHalfLen) {
      // scroll to the very end
      return 1;
    } else {
      return scrollCoord / plotSeqHalfLen;
    }
  };

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
      const coords = coordTicks.map(i => getViewCoords(boxStart.current, boxSeqLen, viewLen, scrollPercent, i, strand));
      const viewCoords = coords;
      setViewCoords(viewCoords);

      // update varaibles
      boxWidth.current = box_w;
      viewSeqLen.current = viewLen;
      // syncScrollPercent.current = scrollPercent;
      setCommonScrollPercent(scrollPercent);
      scrollLeft.current = scroll_left;
      scrollLeftMax.current = leftEnd;

      // update plot scroll left max
      plotRefScrollLeftMax.current = box_w;

      // update plot widths for 1k view
      // for now manually set doulbe size
      if (is1kMode) {
        relayout({ width: box_w * 2 });
        // sync scroll
        plotRef.current.scrollLeft = getPlotScrollLeftPercent(coords[1]) * plotRefScrollLeftMax.current;
      }

      // update character width in 1k seq box
      setOneKCharWidth(box_w / boxSeqLen);
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
  const getSwapSeqCoords = (edge, shiftVal) => {
    let newBoxStart, newBoxEnd, sliceStart, sliceEnd, updateSeq;
    // swapping when scrolling to the left edge
    if ((edge === 'left' && strand === '+') || (edge === 'right' && strand === '-')) {
      newBoxStart = boxStart.current - shiftVal;
      newBoxEnd = newBoxStart + boxSeqLen;
      updateSeq = newBoxStart - 500 <= fullStart.current ? true : false;
    } else {
      newBoxStart = boxStart.current + shiftVal;
      newBoxEnd = newBoxStart + boxSeqLen;
      updateSeq = newBoxEnd + 500 >= fullEnd.current ? true : false;
    }

    [sliceStart, sliceEnd] = getSliceIndicesFromCoords(fullStart.current, fullEnd.current, newBoxStart, newBoxEnd, strand);
    return { newBoxStart, newBoxEnd, sliceStart, sliceEnd, updateSeq };
  };

  // modularize handle scroll, separate infinite scrolling and syncing
  // set scrollingBox based on where the mouse is
  const handleMouseEnterSeqBox = () => { scrollingBox.current = 'seqBox'; };
  const handleMouseEnterPlot = () => { scrollingBox.current = 'plot'; };

  // update plot data after swapping
  const updatePlotBuffers = async (direction, newBoxStart, newBoxEnd) => {
    let newStartBuffer, newViewData, newEndBuffer, newTooltipsStartBuffer, newTooltipsView, newTooltipsEndBuffer, newAnnoColorsStartBuffer, newAnnoColorsView, newAnnoColorsEndBuffer;
    if ((direction === 'left' && strand === '+') || (direction === 'right' && strand === '-')) {
      // shift every thing to smaller by 500
      const [start, end] = [newBoxStart - boxSeqHalfLen, newBoxEnd - boxSeqHalfLen];
      const [sliceStart, sliceEnd] = getSliceIndicesFromCoords(fullStart.current, fullEnd.current, start, end, strand);
      // run inference and get data
      const outputs = await runInference(fullSeq.current.slice(sliceStart - puffinConfig.current.puffinOffset, sliceEnd + puffinConfig.current.puffinOffset));
      newStartBuffer = getPlotData(outputs, start, end);
      newViewData = plotDataStartBuffer.current;
      newEndBuffer = plotDataView.current;

      // anno update
      const [newTooltips, newAnnoColors] = await runAnnoProcessing(outputs, start, end, strand, colorArrInHsl.current, scaledAnnoScoresThreshold.current, motifNameArr.current);

      newTooltipsStartBuffer = newTooltips;
      newTooltipsView = tooltipsStartBuffer.current;
      newTooltipsEndBuffer = tooltipsView.current;

      newAnnoColorsStartBuffer = newAnnoColors;
      newAnnoColorsView = annoColorsStartBuffer.current;
      newAnnoColorsEndBuffer = annoColorsView.current;

    } else {
      // shift every thing bigger by 500
      const [start, end] = [newBoxStart + boxSeqHalfLen, newBoxEnd + boxSeqHalfLen];
      const [sliceStart, sliceEnd] = getSliceIndicesFromCoords(fullStart.current, fullEnd.current, start, end, strand);
      // run inference and get data
      const outputs = await runInference(fullSeq.current.slice(sliceStart - puffinConfig.current.puffinOffset, sliceEnd + puffinConfig.current.puffinOffset));
      newStartBuffer = plotDataView.current;
      newViewData = plotDataEndBuffer.current;
      newEndBuffer = getPlotData(outputs, start, end);

      // anno update
      const [newTooltips, newAnnoColors] = await runAnnoProcessing(outputs, start, end, strand, colorArrInHsl.current, scaledAnnoScoresThreshold.current, motifNameArr.current);

      newTooltipsStartBuffer = tooltipsView.current;
      newTooltipsView = tooltipsEndBuffer.current;
      newTooltipsEndBuffer = newTooltips;

      newAnnoColorsStartBuffer = annoColorsView.current;
      newAnnoColorsView = annoColorsEndBuffer.current;
      newAnnoColorsEndBuffer = newAnnoColors;

    }
    // udpate reference
    plotDataStartBuffer.current = newStartBuffer;
    plotDataView.current = newViewData;
    plotDataEndBuffer.current = newEndBuffer;

    tooltipsStartBuffer.current = newTooltipsStartBuffer;
    tooltipsView.current = newTooltipsView;
    tooltipsEndBuffer.current = newTooltipsEndBuffer;

    annoColorsStartBuffer.current = newAnnoColorsStartBuffer;
    annoColorsView.current = newAnnoColorsView;
    annoColorsEndBuffer.current = newAnnoColorsEndBuffer;
  };

  const setPlotBuffersNew = async (startBufferMid, endBufferMid) => {
    const convOffset = puffinConfig.current.puffinOffset;
    try {
      const [startBufferStart, startBufferEnd] = [startBufferMid - plotSeqHalfLen, startBufferMid + plotSeqHalfLen];
      const [endBufferStart, endBufferEnd] = [endBufferMid - plotSeqHalfLen, endBufferMid + plotSeqHalfLen];

      const [startSliceStart, startSliceEnd] = getSliceIndicesFromCoords(fullStart.current, fullEnd.current, startBufferStart - convOffset, startBufferEnd + convOffset, strand);
      const [endSliceStart, endSliceEnd] = getSliceIndicesFromCoords(fullStart.current, fullEnd.current, endBufferStart - convOffset, endBufferEnd + convOffset, strand);

      const startBufferOutputs = await runInference(fullSeq.current.slice(startSliceStart, startSliceEnd));
      const endBufferOutputs = await runInference(fullSeq.current.slice(endSliceStart, endSliceEnd));
      // set plot data for start and end buffers
      plotDataStartBuffer.current = getPlotData(startBufferOutputs, startBufferStart, startBufferEnd);
      plotDataEndBuffer.current = getPlotData(endBufferOutputs, endBufferStart, endBufferEnd);

      const [starBufferTooltips, startBufferAnnoColors] = await runAnnoProcessing(startBufferOutputs, startBufferStart, startBufferEnd, strand, colorArrInHsl.current, scaledAnnoScoresThreshold.current, motifNameArr.current);
      const [endBufferTooltips, endBufferAnnoColors] = await runAnnoProcessing(endBufferOutputs, endBufferStart, endBufferEnd, strand, colorArrInHsl.current, scaledAnnoScoresThreshold.current, motifNameArr.current);

      tooltipsStartBuffer.current = starBufferTooltips;
      annoColorsStartBuffer.current = startBufferAnnoColors;
      tooltipsEndBuffer.current = endBufferTooltips;
      annoColorsEndBuffer.current = endBufferAnnoColors;

      console.log(`finished buffer for plot`);

    } catch (error) {
      console.error('Error setting plot buffer', error)
    }
  };

  // Helper to handle sequence swapping
  const triggerInfiniteScroll = (direction) => {

    const seqBoxElem = seqBoxRef.current;
    const plotElem = plotRef.current;
    const full_w = boxSeqFullWidth.current;

    // Do not proceed if background updates are in progress
    if (isUpdatingBack || isReplacing) return;

    setIsReplacing(true);
    const { newBoxStart, newBoxEnd, sliceStart, sliceEnd, updateSeq } = getSwapSeqCoords(direction, boxSeqHalfLen);

    // swap with new sequence in seqbox
    setBoxSeq(fullSeq.current.slice(sliceStart, sliceEnd));
    // swap with plot and annos
    if ((direction === 'left' && strand === '+') || (direction === 'right' && strand === '-')) {
      setPlotData(plotDataStartBuffer.current);
      setTooltips(tooltipsStartBuffer.current);
      setAnnoColors(annoColorsStartBuffer.current);
    } else {
      setPlotData(plotDataEndBuffer.current);
      setTooltips(tooltipsEndBuffer.current);
      setAnnoColors(annoColorsEndBuffer.current);
    }

    // first update display, then update sequence (if needed)
    // then update plot buffer and annos - always
    // Update display and buffers asynchronously
    setTimeout(async () => {
      // Scroll by half width to keep the same sequence in display
      const scrollOffset = 0.5 * full_w;
      if (direction === "left") {
        seqBoxElem.scrollLeft += scrollOffset;
        plotElem.scrollLeft += scrollOffset;
      } else {
        seqBoxElem.scrollLeft -= scrollOffset;
        plotElem.scrollLeft -= scrollOffset;
      }

      setIsReplacing(false);
      boxStart.current = newBoxStart;
      boxEnd.current = newBoxEnd;

      // If sequence update is needed, ensure it's safe to update
      if (updateSeq) {
        setIsUpdatingBack(true);
        try {
          await updateFullSeq(direction);
          await updatePlotBuffers(direction, newBoxStart, newBoxEnd);
        } finally {
          setIsUpdatingBack(false); // Ensure the flag is cleared
        }
      } else {
        // Even if no sequence update is needed, ensure plot buffers are updated
        setIsUpdatingBack(true);
        try {
          await updatePlotBuffers(direction, newBoxStart, newBoxEnd);
        } finally { setIsUpdatingBack(false); }
      }
    }, 10);
  };

  // Helper to handle sequence swapping
  const infiniteScroll1k = (direction) => {

    const seqBoxElem = seqBoxRef.current;
    const plotElem = plotRef.current;
    const full_w = boxSeqFullWidth.current;

    // Do not proceed if background updates are in progress
    if (isUpdatingBack || isReplacing) return;

    setIsReplacing(true);
    const { newBoxStart, newBoxEnd, sliceStart, sliceEnd, updateSeq } = getSwapSeqCoords(direction, 500);

    // swap with new sequence in seqbox
    setBoxSeq(fullSeq.current.slice(sliceStart, sliceEnd));
    // swap with plot and annos
    if ((direction === 'left' && strand === '+') || (direction === 'right' && strand === '-')) {
      setPlotData(plotDataStartBuffer.current);
      setTooltips(tooltipsStartBuffer.current);
      setAnnoColors(annoColorsStartBuffer.current);
    } else {
      setPlotData(plotDataEndBuffer.current);
      setTooltips(tooltipsEndBuffer.current);
      setAnnoColors(annoColorsEndBuffer.current);
    }

    // first update display, then update sequence (if needed)
    // then update plot buffer and annos - always
    // Update display and buffers asynchronously
    setTimeout(async () => {
      // Scroll by half width to keep the same sequence in display
      const scrollOffset = 0.25 * full_w;
      const plotScrollOffset = 0.5 * full_w;
      if (direction === "left") {
        seqBoxElem.scrollLeft += scrollOffset;
        plotElem.scrollLeft += plotScrollOffset;
      } else {
        seqBoxElem.scrollLeft -= scrollOffset;
        plotElem.scrollLeft -= plotScrollOffset;
      }

      setIsReplacing(false);
      boxStart.current = newBoxStart;
      boxEnd.current = newBoxEnd;

      setIsUpdatingBack(true);

      // If sequence update is needed, ensure it's safe to update
      if (updateSeq) {
        await updateFullSeq(direction);
      } 
      if ((direction === 'left' && strand === '+') || (direction === 'right' && strand === '-'))  {
        // update start
        // const [newStartBuffer, newEndBuffer] = [newBoxStart-500, newBoxEnd-500];
        await setPlotBuffersNew(newBoxStart+ boxSeqHalfLen/2, newBoxEnd - boxSeqHalfLen/2);
        setIsUpdatingBack(false); // Ensure the flag is cleared
      }
    }, 0);
  };


  // Sequence box scroll handler, handles infinite scroll for both seqbox and plot
  const handleSeqBoxScroll = () => {
    // don't scroll if replacing
    if (isReplacing) return;
    
    const seqElem = seqBoxRef.current;
    const scroll_left = seqElem.scrollLeft;
    const scrollPercent = scroll_left / scrollLeftMax.current;

    const coords = coordTicks.map(i => getViewCoords(boxStart.current, boxSeqLen, viewSeqLen.current, scrollPercent, i, strand));
    setViewCoords(coords);
    // udpate reference tracker
    scrollLeft.current = scroll_left;
    setCommonScrollPercent(scrollPercent);

    // Disable infinite scrolling when background updates are in progress

    // disable infinite scrolling when in 1k mode
    // if (!is1kMode && scrollPercent < 0.05 && !isReplacing) {
    //   triggerInfiniteScroll("left");
    // } else if (!is1kMode && scrollPercent > 0.95 && !isReplacing) {
    //   triggerInfiniteScroll("right");
    // }

    // Sync plot scrolling
    if (!isReplacing && scrollingBox.current === 'seqBox') {
      if (is1kMode) {
        // test 1k sync
        const plotScrollPercent = getPlotScrollLeftPercent(coords[1]);
        // trigger infinite scroll if the plot gets to the edge
        if (plotScrollPercent < 0.05) {
          infiniteScroll1k('left');
        } else {
          plotRef.current.scrollLeft = getPlotScrollLeftPercent(coords[1]) * plotRefScrollLeftMax.current;
        }
      } else {
        plotRef.current.scrollLeft = scroll_left;
      }
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
      // retrive padding len left to the current starting coord
      padSeq = await fetchSequence(start - paddingLen, start, genome, chromosome, strand);
      fullStart.current = start - paddingLen; // Adjust seqStart
    } else {
      const end = fullEnd.current;
      padSeq = await fetchSequence(end, end + paddingLen, genome, chromosome, strand);
      fullEnd.current = end + paddingLen;
    }
    // update fullSeq
    if (direction === 'left') { // Prepend on the left
      fullSeq.current = padSeq + fullSeq.current;
      // full seq length limit: keep the left-most 12k characters
      if (fullSeq.current.length > fullSeqLenCap) {
        fullSeq.current = fullSeq.current.slice(0, fullSeqLenCap);
        // adjust coords after chopping
        strand === '+' ? fullEnd.current = fullStart.current + fullSeqLenCap
          : fullStart.current = fullEnd.current - fullSeqLenCap;
      }
    } else { // Append on the right
      fullSeq.current = fullSeq.current + padSeq;
      // full seq length limit: keep the right-most 12k characters
      if (fullSeq.current.length > fullSeqLenCap) {
        fullSeq.current = fullSeq.current.slice(-fullSeqLenCap);
        // adjust coords after chopping
        strand === '-' ? fullEnd.current = fullStart.current + fullSeqLenCap
          : fullStart.current = fullEnd.current - fullSeqLenCap;
      }
    }
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

  // Updated getTooltips function
  const annoSetup = (start, end, strand, maxIndices, maxValues, maxAll, colorHslArr, colorThreshold, motifNames) => {
    // Reverse range if strand is '-'
    const coordinates = strand === '-' ? range(end, start, -1) : range(start, end);

    // Initialize arrays
    const tooltips = [];
    const annoColors = [];
    const scaledAnnoScores = [];

    // Loop through each base pair to calculate values
    coordinates.forEach((coordinate, index) => {
      const motifIndex = maxIndices[index];
      const motifScore = maxValues[index];
      const scaledScore = motifScore / maxAll; // Scale the score by maxAll

      // Add scaled score to the array
      scaledAnnoScores.push(scaledScore);

      // Generate tooltip
      if (scaledScore < colorThreshold) {
        tooltips.push(`${coordinate}`); // Only coordinate if below threshold
      } else {
        const motifName = motifNames[Number(motifIndex)]; // Get motif name
        tooltips.push(`${coordinate} ${motifName}: ${motifScore.toFixed(3)} (${scaledScore.toFixed(3)})`);
      }

      // Generate annotation color
      if (scaledScore < colorThreshold) {
        annoColors.push("#FFFFFF"); // White if below threshold
      } else {
        const [h, s, l] = colorHslArr[motifIndex]; // Get HSL values for the motif
        const blendedLightness = 100 - (100 - l) * scaledScore; // Adjust lightness for intensity
        annoColors.push(hslToCss(h, s, blendedLightness));
      }
    });

    // Return tooltips and annotation colors
    return { tooltips, annoColors };
  };

  // use inference results for annotations
  // when udpate, we slice left or right half of the result extend it to the current array
  const runAnnoProcessing = async (results, start, end, strand, colorHslArr, colorThreshold, motifNames) => {
    // remove slicing test
    try {
      // Collect motif scores
      const motifScores = [];

      for (const key of puffinConfig.current.annoInputs) {
        const tensor = results[key]; // Access the tensor using the key
        if (!tensor || tensor.data.length !== end - start) { // inference output has same length as seq box
          throw new Error(`Invalid tensor data for ${key}`);
        }
        motifScores.push(Array.from(tensor.data)); // Convert tensor data to an array
      }

      // Flatten and create input tensor
      const flatMotifScores = motifScores.flat();
      const stackedTensor = new ort.Tensor('float32', flatMotifScores, [puffinConfig.current.annoInputs.length, end - start]);

      // Run the post-processing model
      const feeds = { motif_scores: stackedTensor };
      const outputs = await annoSession.current.run(feeds);

      const maxValues = outputs.max_values.data;
      const maxIndices = outputs.max_indices.data;
      const maxAll = outputs.max_all.data[0];

      const { tooltips, annoColors } = annoSetup(start, end, strand, maxIndices, maxValues, maxAll, colorHslArr, colorThreshold, motifNames);

      return [tooltips, annoColors];

    } catch (error) {
      console.error("Error during post-processing:", error);
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
    // for now manually set width to be twice under 1k mode
    const newPlotWidth = newIs1kMode ? boxWidth.current * 2 : boxSeqFullWidth.current;
    if (!newIs1kMode) { // switching to not 1k mode, aka scroll mode
      // no margin to sync scroll
      relayout({ margin: { l: 0, r: 0, t: plotTopMargin, b: plotBottomMargin }, showlegend: false, width: newPlotWidth });
      setTimeout(() => { plotRef.current.scrollLeft = scrollLeft.current; }, 10);
    } else {
      relayout({
        margin: { l: plotLeftMargin, r: plotLeftMargin, t: plotTopMargin, b: plotBottomMargin }, width: newPlotWidth, showlegend: showLegend,
      });
      setTimeout(() => { plotRef.current.scrollLeft = getPlotScrollLeftPercent(viewCoords[1]) * plotRefScrollLeftMax.current; }, 10);
    }
  };

  const toggleLegend = () => {
    const newShowLegend = !showLegend;
    setShowLegend(newShowLegend);
    const legend_x = strand === '+' ? (viewCoords[1] + plotRefViewSeqHalfLen - boxStart.current) / boxSeqLen : (boxEnd.current - viewCoords[1] + plotRefViewSeqHalfLen) / boxSeqLen;
    relayout({ legend: plotLegendLayout(legend_x), showlegend: newShowLegend });
  };

  // reruns everytime initSeq changes, which happens when genome form is updated
  // and fullSeq and everything gets reset
  useEffect(() => {
    const initPlot = async () => {
      setIsPlotInited(false);
      // absolute coordinates, here view is the viewing chunk (vs buffer chunks), not just the viewport (viewLen)
      // const [viewStart, viewEnd] = [boxStart.current, boxEnd.current];
      // const [startBufferStart, startBufferEnd] = [viewStart - boxSeqHalfLen, viewEnd - boxSeqHalfLen];
      // const [endBufferStart, endBufferEnd] = [viewStart + boxSeqHalfLen, viewEnd + boxSeqHalfLen];
      // slicing coords
      // testing 2k plot
      // const boxMid = viewStart + boxSeqHalfLen;
      // pad to keep same length after convolution
      const convOffset = puffinConfig.current.puffinOffset;
      const [plotViewStart, plotViewEnd] = [boxStart.current, boxEnd.current];
      const [viewSliceStart, viewSliceEnd] = getSliceIndicesFromCoords(fullStart.current, fullEnd.current, plotViewStart - convOffset, plotViewEnd + convOffset, strand);
      // const [startSliceStart, startSliceEnd] = getSliceIndicesFromCoords(fullStart.current, fullEnd.current, startBufferStart - puffinConfig.current.puffinOffset, startBufferEnd + puffinConfig.current.puffinOffset, strand);
      // const [endSliceStart, endSliceEnd] = getSliceIndicesFromCoords(fullStart.current, fullEnd.current, endBufferStart - puffinConfig.current.puffinOffset, endBufferEnd + puffinConfig.current.puffinOffset, strand);

      // seqs for inferences
      const viewSeq = fullSeq.current.slice(viewSliceStart, viewSliceEnd);
      // const startBufferSeq = fullSeq.current.slice(startSliceStart, startSliceEnd);
      // const endBufferSeq = fullSeq.current.slice(endSliceStart, endSliceEnd);

      // separate motif names and colors from the dictionary
      const motifNameColorDict = puffinConfig.current.motifNameColorDict;
      const motifNames = [];
      const motifColors = [];

      for (const entry of motifNameColorDict) {
        const [name] = Object.keys(entry); const [color] = Object.values(entry);
        motifNames.push(name); motifColors.push(color);
      }

      const scaledThreshold = puffinConfig.current.scaledThreshold;
      const colorHslArr = motifColors.map(hex => hexToHsl(hex));

      const outputs = await runInference(viewSeq);
      const [tooltips, annoColors] = await runAnnoProcessing(outputs, plotViewStart, plotViewEnd, strand, colorHslArr, scaledThreshold, motifNames);

      setTooltips(tooltips);
      setAnnoColors(annoColors);

      console.log('init plot, run infernce for view sequence and left righ buffer');
      if (outputs) {
        const plotData = getPlotData(outputs, plotViewStart, plotViewEnd);
        setPlotData(plotData);
        plotDataView.current = plotData;
        const xaxisLayout = { tickformat: 'd', autorange: strand === '-' ? 'reversed' : true, };
        const totalPlots = puffinConfig.current.grid.rows * puffinConfig.current.grid.columns;
        const axisLayout = {};
        for (let i = 0; i < totalPlots; i++) {
          axisLayout[`xaxis${i + 1}`] = xaxisLayout;
        }
        // last coord on the ticks
        const legend_x = strand === '+' ? (viewCoords[1] + plotRefViewSeqHalfLen - boxStart.current) / boxSeqLen : (boxEnd.current - viewCoords[1] + plotRefViewSeqHalfLen) / boxSeqLen;
        setPlotLayout({
          ...axisLayout,
          height: plotDivHeight,
          grid: puffinConfig.current.grid,
          // for now manually set plot width to be twice the box view width
          // to test scrolling
          width: is1kMode ? boxWidth.current * 2 : boxSeqFullWidth.current,
          template: 'plotly_white',
          margin: { l: plotLeftMargin, r: plotLeftMargin, t: plotTopMargin, b: plotBottomMargin },
          legend: plotLegendLayout(legend_x),
          showlegend: showLegend,
        });
      }

      // const startBufferOutputs = await runInference(startBufferSeq);
      // const endBufferOutputs = await runInference(endBufferSeq);
      // // set plot data for start and end buffers
      // plotDataStartBuffer.current = getPlotData(startBufferOutputs, startBufferStart, startBufferEnd);
      // plotDataEndBuffer.current = getPlotData(endBufferOutputs, endBufferStart, endBufferEnd);

      // get tooltips for buffers too
      // const [starBufferTooltips, startBufferAnnoColors] = await runAnnoProcessing(startBufferOutputs, startBufferStart, startBufferEnd, strand, colorHslArr, scaledThreshold, motifNames);
      // const [endBufferTooltips, endBufferAnnoColors] = await runAnnoProcessing(endBufferOutputs, endBufferStart, endBufferEnd, strand, colorHslArr, scaledThreshold, motifNames);

      // update reference
      colorArrInHsl.current = colorHslArr;
      motifNameArr.current = motifNames;
      scaledAnnoScoresThreshold.current = scaledThreshold;
      // // anno and plot share the same coords
      // tooltipsStartBuffer.current = starBufferTooltips;
      // annoColorsStartBuffer.current = startBufferAnnoColors;
      // tooltipsView.current = tooltips;
      // annoColorsView.current = annoColors;
      // tooltipsEndBuffer.current = endBufferTooltips;
      // annoColorsEndBuffer.current = endBufferAnnoColors;

      // if (!is1kMode && plotRef.current && scrollLeftMax.current) {
      if (plotRef.current) {
        // manually scroll to halfway
        // const scrollMiddlePoint = 0.500 + 1 / boxSeqLen / 2;
        setTimeout(() => {
          const plotScrollLeftMax = plotRef.current.scrollWidth - plotRef.current.clientWidth;
          plotRef.current.scrollLeft = 0.5 * (plotScrollLeftMax);
          plotRefScrollLeftMax.current = plotScrollLeftMax;
          setIsPlotInited(true);
        }, 10);
      }
    };
    // this updates plot whenever sequence gets reinit via form
    if (seqInited && isPuffinSessionReady && puffinConfig.current) {
      initPlot();
    }
  }, [seqInited, isPuffinSessionReady]);

  useEffect(() => {
    const initPlotBuffers = async () => {
      // update left and rgith full seq, in that order
      await updateFullSeq('left');
      await updateFullSeq('right');
      await setPlotBuffersNew(boxStart.current + boxSeqHalfLen/2, boxEnd.current - boxSeqHalfLen/2);
    };
    if (isPlotInited && seqInited) {
      console.log('start init buffer');
      initPlotBuffers();
      // after the plot is inited, expand the sequence, set plot buffers
    }
  }, [isPlotInited]);

  // // pad sequences after plot was inited
  // useEffect(() => {
  //   const padSequences = async () => {
  //     if (isPlotInited.current) {
  //       try {
  //         // Pad left first
  //         await updateFullSeq('left');
  //         // Then pad right
  //         await updateFullSeq('right');
  //       } catch (error) {
  //         console.error('Error padding sequences:', error);
  //       }
  //     }
  //   };

  //   padSequences();
  // }, [isPlotInited.current]); // Depend on the reference's value indirectly

  const getPlotLinePercentage = (commonScrollPercent) => {
    const percent = (commonScrollPercent * (boxSeqLen - viewSeqLen.current) + viewSeqLen.current / 2) / boxSeqLen;
    // adjust for left margin
    const fullLen = boxWidth.current - 2 * plotLeftMargin;
    const adjustedPercent = (plotLeftMargin + percent * fullLen) / boxWidth.current;
    return adjustedPercent * 100;
  };

  const getBoxLinePercentage = (commonScrollPercent) => {
    const midPercent = (commonScrollPercent * (boxSeqLen - viewSeqLen.current) + viewSeqLen.current / 2) / boxSeqLen;
    const width = viewSeqLen.current / 2 / boxSeqLen;
    return [(midPercent - width) * 100, midPercent * 100, width * 2 * 100];
  }

  // tracking these values
  const debugVars = { boxSeqFullWidth, boxWidth, viewSeqLen, commonScrollPercent, fullStart, fullEnd, boxStart, boxEnd, fullSeq, boxSeq, genome, chromosome, strand, tooltips, is1kMode, scrollingBox, scrollLeft, scrollLeftMax, viewCoords, plotDivHeight, plotLayout, showCentralLine, };

  // fold genome form
  const [isGenomeFormFolded, setIsGenomeFormFolded] = useState(false);

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
      <NavBar isGenomeFormFolded={isGenomeFormFolded} setIsGenomeFormFolded={setIsGenomeFormFolded} />
      <div className="flex h-screen">
        {/* Left side of screen 1/4 or max-80 */}
        {!isGenomeFormFolded && (
          <div className="w-1/4 max-w-[15rem] border-r border-gray-300 p-4">
            <GenomeForm {...genomeFormVars} />
          </div>
        )}
        {/* <div className="w-1/4 max-w-[15rem] border-r border-gray-300 p-4">
          <GenomeForm {...genomeFormVars} />
        </div> */}

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
                className="sequence-box bg-white border border-blue-500 overflow-x-auto font-mono"
                ref={seqBoxRef}
                onScroll={handleSeqBoxScroll}
                style={{ whiteSpace: "nowrap" }}
                onMouseEnter={handleMouseEnterSeqBox}
              >
                {/* Vertical center line in sequence box */}
                <div
                  className="absolute top-0 bottom-0 w-[2px] bg-gray-500"
                  style={{ left: "50%" }}
                ></div>
                {boxSeq
                  ? boxSeq.split("").map((char, index) => (
                    <Tippy content={tooltips[index]} key={index}>
                      <span
                        style={{ backgroundColor: annoColors[index] }}
                      >
                        {char}
                      </span>
                    </Tippy>
                    // vanilla tooltips
                    // <span
                    //   key={index}
                    //   className="inline-block"
                    //   title={tooltips[index]} // Native tooltip with coordinate
                    //   style={{ backgroundColor: annoColors[index] }}
                    // >
                    //   {char}
                    // </span>
                  ))
                  : "Loading...."}
              </div>

            </div>
            {/* squeeze all 1k sequences */}
            <div
              className="bg-white border border-gray-300 overflow-x-auto font-mono relative"
              style={{
                whiteSpace: "nowrap",
                // overflow: "hidden", // Disable user scrolling
              }}
              onClick={(e) => {
                // Get the click position relative to the div
                const rect = e.currentTarget.getBoundingClientRect();
                const clickX = e.clientX - rect.left; // Click X position within the div
                const divWidth = rect.width; // Width of the div
                // console.log('div',divWidth);

                // Calculate new commonScrollPercent
                const newScrollPercent = clickX / divWidth;
                const newLeftPercent = newScrollPercent - viewSeqLen.current / boxSeqLen / 2;
                // Update the state
                seqBoxRef.current.scrollLeft = newLeftPercent * boxSeqFullWidth.current;
              }}
            >
              {/* Full Box */}
              <div
                className="absolute top-1 bottom-1 border-[1px] border-blue-500"
                style={{
                  left: `${getBoxLinePercentage(commonScrollPercent)[0]}%`, // Left edge
                  width: `${getBoxLinePercentage(commonScrollPercent)[2]}%`, // Width of the box
                }}
              ></div>
              {/* Middle Vertical Line */}
              <div
                className="absolute w-[1px] bg-gray-500 top-0 bottom-0"
                style={{ left: `${getBoxLinePercentage(commonScrollPercent)[1]}%`, }}
              ></div>
              {boxSeq && oneKCharWidth
                ? boxSeq.split("").map((char, index) => (
                  // <Tippy content={`${tooltips[index]}`} key={index}>
                  //   <span style={{
                  //     backgroundColor: annoColors[index],
                  //     display: "inline-block",
                  //     width: `${oneKCharWidth}px`,
                  //     height: "10px",
                  //   }} >
                  //     {" "}
                  //   </span>
                  // </Tippy>
                  // vanilla tooltips
                  <span
                    key={index}
                    className="inline-block"
                    title={char + ' ' + tooltips[index]} // Native tooltip with coordinate
                    style={{
                      backgroundColor: annoColors[index],
                      width: `${oneKCharWidth}px`,
                      height: "10px",
                    }}
                  >
                    {" "}
                  </span>
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
              <span className="text-gray-700 font-medium">Helper Line</span>
              <label className="relative inline-flex cursor-pointer items-center">
                <input
                  type="checkbox"
                  checked={showCentralLine}
                  onChange={() => { setShowCentralLine(!showCentralLine); }}
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

          <div className="relative">
            {/* title area */}
            {plotData && <div className="w-full h-4 mb-4 text-xl flex items-center justify-center">{puffinConfig.current.title}</div>}

            {/* Plot area */}
            <div className='relative'>
              <div
                className="plot-box overflow-x-auto"
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
                      {showCentralLine && <div
                        className="absolute h-full w-[2px] bg-gray-500 opacity-60"
                        style={{
                          left: is1kMode ? `${getPlotLinePercentage(commonScrollPercent)}%` : '50%',
                          zIndex: 1, // Place below subtitles
                        }}
                      ></div>}
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

            {/* Resize line */}
            <div
              className="w-full h-1 bg-gray-500 cursor-row-resize"
              onMouseDown={handleMouseDownResize}
            ></div>
          </div>

          <div
            className="absolute top-0 bottom-0 w-[2px] bg-gray-500"
            style={{ left: "50%" }}
          ></div>

          <DebugPanel {...debugVars} />
        </div>

      </div>
    </>
  );
}

export default App;