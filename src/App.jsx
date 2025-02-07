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
  const [strand, setStrand] = useState('-');
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
  // double the box width to be plot width
  const plotSeqHalfLen = boxSeqHalfLen;
  const plotSeqLen = plotSeqHalfLen * 2;
  const plotRefScrollLeftMax = useRef(null);
  const plotRefViewSeqHalfLen = plotSeqHalfLen / 2;
  const plotToBoxScrollRatio = useRef(null);
  const plotPaddingLen = 2000;
  const plotViewSeqHalfLen = useRef(null);
  const seqBoxBorderHalf = useRef(null);

  const plotSeqFullWidth = useRef(null); // similar to boxseq full length, scroll width of plot div

  // full plot data and anno data
  const fullPlotDataMat = useRef([]);
  const fullAnnoColors = useRef([]);
  const fullTooltips = useRef([]);
  const fullPlotStart = useRef(null);
  const fullPlotEnd = useRef(null);
  const plotYKeys = useRef([]);

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
  const viewCoordsRef = useRef([]); // Store coords without causing re-renders
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
  const [showCentralLine, setShowCentralLine] = useState(true);

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
  const colorBoxRef = useRef(null);

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
        // load y data keys
        plotYKeys.current = data.traces.map(item => item.result_key);
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
      // init view coords on tick/ ruler
      setViewCoords(coordTicks.map(i => getViewCoords(boxStart.current, boxSeqLen, viewLen, middlePoint, i, strand)));

      // make sure plot total content width is at least the same as loaded sequence length
      // each base pair at least has 1 pixel, and only increments by 0.5
      const eachCharWidth = Math.max(Math.ceil(view_w * 2 / plotSeqLen * 2) / 2, 1);
      const plotScrollWidth = eachCharWidth * plotSeqLen;
      const plotLmax = plotScrollWidth - view_w; // plot client width same as box client width
      // plot to box scroll width ratio for syncing at 1k
      // const ratio = 2 * (boxSeqLen - viewLen) / boxSeqLen;
      const ratio = (lmax / full_w) / (plotLmax / plotScrollWidth);
      plotToBoxScrollRatio.current = ratio;
      const seqViewHalfLen = view_w / plotScrollWidth * plotSeqLen / 2;
      plotViewSeqHalfLen.current = seqViewHalfLen;

      seqBoxBorderHalf.current = viewLen / 2 / seqViewHalfLen / 2 * 100;

      // update global varialbes
      boxSeqFullWidth.current = full_w;
      boxWidth.current = view_w;
      scrollLeftMax.current = lmax;
      setCommonScrollPercent(middlePoint);
      // set oneK seq character width
      setOneKCharWidth(eachCharWidth);
      // set plot scroll width and client width
      plotSeqFullWidth.current = plotScrollWidth;
      plotRefScrollLeftMax.current = plotLmax;
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
      const coords = coordTicks.map(i => getViewCoords(boxStart.current, boxSeqLen, viewLen, scrollPercent, i, strand));
      const viewCoords = coords;
      setViewCoords(viewCoords);

      // update varaibles
      boxWidth.current = box_w;
      viewSeqLen.current = viewLen;
      setCommonScrollPercent(scrollPercent);
      scrollLeft.current = scroll_left;
      scrollLeftMax.current = leftEnd;

      // update plot width status
      const eachCharWidth = Math.ceil(box_w * 2 / plotSeqLen);
      const plotFullWidth = eachCharWidth * plotSeqLen;
      const plotLmax = plotFullWidth - box_w;
      // update 1k box to plot ratio
      // plot to box scroll width ratio for syncing at 1k
      const ratio = leftEnd / full_w / (plotLmax / plotFullWidth);
      plotSeqFullWidth.current = plotFullWidth;
      plotRefScrollLeftMax.current = plotLmax;
      plotToBoxScrollRatio.current = ratio;
      // plotViewSeqHalfLen.current = box_w / plotFullWidth * plotSeqLen / 2;
      const seqViewHalfLen = box_w / plotFullWidth * plotSeqLen / 2;
      plotViewSeqHalfLen.current = seqViewHalfLen;
      seqBoxBorderHalf.current = viewLen / 2 / seqViewHalfLen / 2 * 100;

      setOneKCharWidth(eachCharWidth);

      if (is1kMode) {
        relayout({ width: plotFullWidth });
        // sync scrolling point
        // Wait for the DOM to update
        requestAnimationFrame(() => {
          const scrollPosition = ((scrollPercent - 0.5) * ratio + 0.5) * plotLmax;
          plotRef.current.scrollLeft = scrollPosition;
          colorBoxRef.current.scrollLeft = scrollPosition;
        });
      }

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
      }, 20); // adjust interval for smoothness
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
      updateSeq = newBoxStart - 2500 <= fullStart.current ? true : false;
    } else {
      newBoxStart = boxStart.current + shiftVal;
      newBoxEnd = newBoxStart + boxSeqLen;
      updateSeq = newBoxEnd + 2500 >= fullEnd.current ? true : false;
    }

    [sliceStart, sliceEnd] = getSliceIndicesFromCoords(fullStart.current, fullEnd.current, newBoxStart, newBoxEnd, strand);
    return { newBoxStart, newBoxEnd, sliceStart, sliceEnd, updateSeq };
  };

  // modularize handle scroll, separate infinite scrolling and syncing
  // set scrollingBox based on where the mouse is
  const handleMouseEnterSeqBox = () => { scrollingBox.current = 'seqBox'; };
  const handleMouseEnterPlot = () => { scrollingBox.current = 'plot'; };

  const updatePlotBuffers = (direction, strand) => {
    let startBufferPlot, viewPlot, endBufferPlot, startBufferAnno, viewAnno, endBufferAnno, startBufferTooltips, viewTooltips, endBufferTooltips;
    let updateFullPlots = false;
    // shift everything toward a smaller start
    if ((direction === 'left' && strand === '+') || (direction === 'right' && strand === '-')) {
      [viewPlot, endBufferPlot, viewAnno, endBufferAnno, viewTooltips, endBufferTooltips] = [plotDataStartBuffer.current, plotDataView.current, annoColorsStartBuffer.current, annoColorsView.current, tooltipsStartBuffer.current, tooltipsView.current];
      // slice out new matrix and get plotdata
      const [newStart, newEnd] = [boxStart.current - 500, boxEnd.current - 500];
      const [sliceStart, sliceEnd] = getSliceIndicesFromCoords(fullPlotStart.current, fullPlotEnd.current, newStart, newEnd, strand);
      const newMat = getPlotMatrix(fullPlotDataMat.current, fullPlotStart.current, fullPlotEnd.current, newStart, newEnd, strand);
      startBufferPlot = getPlotData(newMat, newStart, newEnd, strand, puffinConfig.current);
      startBufferAnno = fullAnnoColors.current.slice(sliceStart, sliceEnd);
      startBufferTooltips = fullTooltips.current.slice(sliceStart, sliceEnd);
      if (newStart - 500 <= fullPlotStart.current) {
        updateFullPlots = true;
      }
    } else {
      // shift everything towards a bigger end
      [startBufferPlot, viewPlot, startBufferAnno, viewAnno, startBufferTooltips, viewTooltips] = [plotDataView.current, plotDataEndBuffer.current, annoColorsView.current, annoColorsEndBuffer.current, tooltipsView.current, tooltipsEndBuffer.current];
      // slice out new ends and get plot data
      const [newStart, newEnd] = [boxStart.current + 500, boxEnd.current + 500];
      const [sliceStart, sliceEnd] = getSliceIndicesFromCoords(fullPlotStart.current, fullPlotEnd.current, newStart, newEnd, strand);
      const newMat = getPlotMatrix(fullPlotDataMat.current, fullPlotStart.current, fullPlotEnd.current, newStart, newEnd, strand);
      endBufferPlot = getPlotData(newMat, newStart, newEnd, strand, puffinConfig.current);
      endBufferAnno = fullAnnoColors.current.slice(sliceStart, sliceEnd);
      endBufferTooltips = fullTooltips.current.slice(sliceStart, sliceEnd);
      if (newEnd + 500 >= fullPlotEnd.current) {
        updateFullPlots = true;
      }
    }

    // update things
    plotDataStartBuffer.current = startBufferPlot; annoColorsStartBuffer.current = startBufferAnno; tooltipsStartBuffer.current = startBufferTooltips;
    plotDataView.current = viewPlot; annoColorsView.current = viewAnno; tooltipsView.current = viewTooltips;
    plotDataEndBuffer.current = endBufferPlot; annoColorsEndBuffer.current = endBufferAnno; tooltipsEndBuffer.current = endBufferTooltips;

    return updateFullPlots;

  };

  const infiniteScroll1k = async (direction) => {
    if (isReplacing || isUpdatingBack) return; // Prevent multiple triggers

    const seqBoxElem = seqBoxRef.current;
    const full_w = boxSeqFullWidth.current;

    // Set flag to prevent other updates during replacement
    setIsReplacing(true);

    // Get new sequence and plot coordinates
    const { newBoxStart, newBoxEnd, sliceStart, sliceEnd, updateSeq } = getSwapSeqCoords(direction, 500);
    boxStart.current = newBoxStart; // Update references for the new sequence range
    boxEnd.current = newBoxEnd;

    // Step 1: Immediately swap sequence, plot data, anno colors and tooltips
    setBoxSeq(fullSeq.current.slice(sliceStart, sliceEnd)); // Update sequence box
    if ((direction === 'left' && strand === '+') || (direction === 'right' && strand === '-')) {
      setPlotData(plotDataStartBuffer.current); // Swap to start buffer
      setAnnoColors(annoColorsStartBuffer.current);
      setTooltips(tooltipsStartBuffer.current);
    } else {
      setPlotData(plotDataEndBuffer.current); // Swap to end buffer
      setTooltips(tooltipsEndBuffer.current);
      setAnnoColors(annoColorsEndBuffer.current);
    }

    //Step 2: Scroll the sequence box by half the total width to keep the user centered
    requestAnimationFrame(() => {

      if (scrollingBox.current === 'seqBox') {
        const scrollOffset = 0.25 * full_w;
        if (direction === 'left') {
          seqBoxElem.scrollLeft += scrollOffset;
        } else {
          seqBoxElem.scrollLeft -= scrollOffset;
        }
      } else {
        // const scrollOffset = 0.25 * plotSeqFullWidth.current;
        const scrollPosition = 0.55 * plotRefScrollLeftMax.current;
        if (direction === 'left') {
          plotRef.current.scrollLeft = scrollPosition;
        } else {
          plotRef.current.scrollLeft = scrollPosition;
        }
      }
    });

    setIsReplacing(false); // allow scroll syncs when swapping is done
    // Step 3: Update sequence and plot buffers asynchronously
    setIsUpdatingBack(true);

    const updatePlots = updatePlotBuffers(direction, strand);
    try {
      if (updateSeq && updatePlots) {
        // Update full sequence if required
        await updateFullSeq(direction);
        // Update plot buffers and annotations
        await updatePlotMatAnnoTooltips(direction, strand, plotPaddingLen, puffinConfig, fullStart, fullEnd, fullPlotStart, fullPlotEnd, fullPlotDataMat);
      } else if (updatePlots) {
        await updatePlotMatAnnoTooltips(direction, strand, plotPaddingLen, puffinConfig, fullStart, fullEnd, fullPlotStart, fullPlotEnd, fullPlotDataMat);
      }

    } catch (error) {
      console.error('Error updating buffers:', error);
    } finally {
      // Reset flags to allow further scrolling
      setIsUpdatingBack(false);
    }
  };

  const scrollTimeout = useRef(null); // To track when scrolling stops

  // Sequence box scroll handler, handles infinite scroll for both seqbox and plot
  const handleSeqBoxScroll = async () => {
    // Sync plot scrolling
    if (!isReplacing && scrollingBox.current === 'seqBox') {
      const scroll_left = seqBoxRef.current.scrollLeft;
      const scrollPercent = scroll_left / scrollLeftMax.current;

      if (is1kMode) {
        // seq box and plot align at middle point, when the scroll bar centers at 50%, the two coords align perfectly.
        // use 0.5 as anchor point to sync the two divs
        const plotScrollPercent = (scrollPercent - 0.5) * plotToBoxScrollRatio.current + 0.5;
        // trigger infinite scroll if the plot gets to the edge
        if (plotScrollPercent < 0.05) {
          await infiniteScroll1k('left');
        } else if (plotScrollPercent > 0.95) {
          await infiniteScroll1k('right');
        } else {
          // sync plot scrolling point
          const scrollPosition = plotScrollPercent * plotRefScrollLeftMax.current;
          plotRef.current.scrollLeft = scrollPosition;
          colorBoxRef.current.scrollLeft = scrollPosition;
        }
      } else {
        plotRef.current.scrollLeft = scroll_left;
      }

      // Detect when scrolling stops
      clearTimeout(scrollTimeout.current);
      scrollTimeout.current = setTimeout(() => {
        const coords = coordTicks.map(i => getViewCoords(boxStart.current, boxSeqLen, viewSeqLen.current, scrollPercent, i, strand));
        setViewCoords(coords);
      }, 50); // Slightly longer delay to catch the stop

    }
  };

  
  // Intercept scrolling and slow it down
  const slowPlotScroll = (event) => {
    // slow down scrolling in plot reference (e.g., 5x slower)
    const scrollSlowdownFactor = 0.06;
    const percent = plotPercent.current;
    event.preventDefault(); // Prevent default fast scrolling
    if (percent > 0.05 && percent < 0.95) {
      plotRef.current.scrollLeft += event.deltaY * scrollSlowdownFactor; // Adjust scroll speed
      plotRef.current.scrollLeft += event.deltaX * scrollSlowdownFactor; // Adjust scroll speed
    }
  };

  // Attach event listener for wheel-based scrolling (mouse & trackpad)
  useEffect(() => {
    if (is1kMode) {const plotElement = plotRef.current;
    if (plotElement) {
      plotElement.addEventListener("wheel", slowPlotScroll, { passive: false }); // Prevent default fast scrolling
    }
    return () => {
      if (plotElement) {
        plotElement.removeEventListener("wheel", slowPlotScroll);
      }
    };}
  }, [is1kMode]);

  const plotPercent = useRef(0);

  // Plot scroll handle
  const handlePlotScroll = async () => {
    // don't scroll if replacing
    if (!isReplacing && scrollingBox.current === 'plot') {

      const scroll_left = plotRef.current.scrollLeft;
      const plotScrollPercent = scroll_left / plotRefScrollLeftMax.current;
      const seqBoxScrollPercent = ((plotScrollPercent - 0.5) / plotToBoxScrollRatio.current + 0.5);
      plotPercent.current = plotScrollPercent;

      if (is1kMode) {

        if (plotScrollPercent < 0.05) {
          await infiniteScroll1k('left');
        } else if (plotScrollPercent > 0.95) {
          await infiniteScroll1k('right');
        } else {
          // seqBoxRef.current.scrollTo({ left: scrollPosition });
          const scrollPosition = seqBoxScrollPercent * scrollLeftMax.current;
          seqBoxRef.current.scrollLeft = scrollPosition;
          colorBoxRef.current.scrollLeft = scroll_left;
        }
      } else {
        // seqBoxRef.current.scrollTo({ left: scroll_left });
        seqBoxRef.current.scrollLeft = scroll_left;
      }

      clearTimeout(scrollTimeout.current);
      scrollTimeout.current = setTimeout(() => {
        const coords = coordTicks.map(i => getViewCoords(boxStart.current, boxSeqLen, viewSeqLen.current, seqBoxScrollPercent, i, strand));
        setViewCoords(coords);
      }, 50); // Slightly longer delay to catch the stop
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

  // update full plot data matrix, full anno, and full Tooltips
  const updatePlotMatAnnoTooltips = async (direction, strand, plotPaddingLen, puffinConfig, fullStart, fullEnd, fullPlotStart, fullPlotEnd, fullPlotDataMat) => {
    let newMat, newAnnoColors, newTooltips, capStart, capEnd;
    const convoffset = puffinConfig.current.puffinOffset;
    if ((direction === 'left' && strand === '+') || (direction === 'right' && strand === '-')) {
      // padding by extending start coord to a smaller new start, getting inference from [newStart, start]
      const start = fullPlotStart.current;
      const newStart = start - plotPaddingLen;
      const [sliceStart, sliceEnd] = getSliceIndicesFromCoords(fullStart.current, fullEnd.current, newStart - convoffset, start + convoffset, strand);
      const convSeq = fullSeq.current.slice(sliceStart, sliceEnd);
      const newOutput = await runInference(convSeq);
      // get plot matrices, anno color list, and tooltips list
      newMat = plotYKeys.current.map(key => Array.from(newOutput[key].data));
      [newTooltips, newAnnoColors] = await runAnnoProcessing(newOutput, newStart, start, strand, colorArrInHsl.current, scaledAnnoScoresThreshold.current, motifNameArr.current);
      fullPlotStart.current = newStart; // update reference
    } else {
      // padding by extending end coord to a bigger new end, getting inference from [end, newEnd]
      const end = fullPlotEnd.current;
      const newEnd = end + plotPaddingLen;
      const [sliceStart, sliceEnd] = getSliceIndicesFromCoords(fullStart.current, fullEnd.current, end - convoffset, newEnd + convoffset, strand);
      const convSeq = fullSeq.current.slice(sliceStart, sliceEnd);
      const newOutput = await runInference(convSeq);
      newMat = plotYKeys.current.map(key => Array.from(newOutput[key].data));
      [newTooltips, newAnnoColors] = await runAnnoProcessing(newOutput, end, newEnd, strand, colorArrInHsl.current, scaledAnnoScoresThreshold.current, motifNameArr.current);
      fullPlotEnd.current = newEnd; // update reference
    }

    const fullLen = newMat[0].length + fullPlotDataMat.current[0].length;
    // use the same 12k cap for seq and plot datas
    if (fullLen > fullSeqLenCap) {
      [capStart, capEnd] = direction === 'left' ? [0, fullSeqLenCap] : [fullLen - fullSeqLenCap, fullLen];
      // adjust coords after chopping
      if ((direction === 'left' && strand === '+') || (direction === 'right' && strand === '-')) {
        fullPlotEnd.current = fullPlotStart.current + fullSeqLenCap;
      } else {
        fullPlotStart.current = fullPlotEnd.current - fullSeqLenCap;
      }
    } else {
      [capStart, capEnd] = [0, fullLen]; // take entire length
    }

    if (direction === 'left') {
      // Prepend newMat to fullPlotDataMat
      fullPlotDataMat.current = newMat.map((row, idx) =>
        row.concat(fullPlotDataMat.current[idx]).slice(capStart, capEnd)
      );
      fullAnnoColors.current = newAnnoColors.concat(fullAnnoColors.current).slice(capStart, capEnd);
      fullTooltips.current = newTooltips.concat(fullTooltips.current).slice(capStart, capEnd);
    } else {
      // Append newMat to fullPlotDataMat
      fullPlotDataMat.current = newMat.map((row, idx) =>
        fullPlotDataMat.current[idx].concat(row).slice(capStart, capEnd)
      );
      fullAnnoColors.current = fullAnnoColors.current.concat(newAnnoColors).slice(capStart, capEnd);
      fullTooltips.current = fullTooltips.current.concat(newTooltips).slice(capStart, capEnd);
    }
  };

  // get matrix of y values
  const getPlotMatrix = (fullMat, fullStart, fullEnd, matStart, matEnd, strand) => {
    const [sliceStart, sliceEnd] = getSliceIndicesFromCoords(fullStart, fullEnd, matStart, matEnd, strand);
    const mat = fullMat.map(row => row.slice(sliceStart, sliceEnd));
    return mat;
  };

  const getPlotData = (plotDataMatrix, start, end, strand, plotConfig) => {
    // Generate x values based on strand direction
    const xs = strand === '+' ? range(start, end) : range(end, start, -1); // Reverse coordinates for '-' strand

    // Loop through the trace configuration list with indexes
    const plotTraces = plotConfig.traces.map((traceConfig, index) => {
      // Extract y values from the corresponding row in the matrix
      const yData = plotDataMatrix[index];
      if (!yData) return null; // Skip if yData is unavailable

      // Create trace using the configuration and data
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

    // Filter out any null traces (in case of missing data)
    return plotTraces.filter(trace => trace !== null);
  };

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
    const newPlotWidth = newIs1kMode ? plotSeqFullWidth.current : boxSeqFullWidth.current;
    if (!newIs1kMode) { // switching to not 1k mode, aka scroll mode
      // no margin to sync scroll
      relayout({ margin: { l: 0, r: 0, t: plotTopMargin, b: plotBottomMargin }, showlegend: false, width: newPlotWidth });
      requestAnimationFrame(() => { plotRef.current.scrollLeft = scrollLeft.current; });
    } else {
      relayout({
        margin: { l: plotLeftMargin, r: plotLeftMargin, t: plotTopMargin, b: plotBottomMargin }, width: newPlotWidth, showlegend: showLegend,
      });
      requestAnimationFrame(() => {
        const plotScrollPercent = (seqBoxRef.current.scrollLeft / scrollLeftMax.current - 0.5) * plotToBoxScrollRatio.current + 0.5;
        plotRef.current.scrollLeft = plotScrollPercent * plotRefScrollLeftMax.current;
      });
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
      // pad to keep same length after convolution
      const convOffset = puffinConfig.current.puffinOffset;
      const [plotViewStart, plotViewEnd] = [boxStart.current, boxEnd.current];
      const [viewSliceStart, viewSliceEnd] = getSliceIndicesFromCoords(fullStart.current, fullEnd.current, plotViewStart - convOffset, plotViewEnd + convOffset, strand);

      // seqs for inferences
      const viewSeq = fullSeq.current.slice(viewSliceStart, viewSliceEnd);

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

      console.log('init plot, run infernce for view sequence');
      if (outputs) {
        // use matrix instead of all inference results
        const plotMat = plotYKeys.current.map(key => Array.from(outputs[key].data));
        const plotData = getPlotData(plotMat, plotViewStart, plotViewEnd, strand, puffinConfig.current);
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
          width: is1kMode ? plotSeqFullWidth.current : boxSeqFullWidth.current,
          template: 'plotly_white',
          margin: { l: plotLeftMargin, r: plotLeftMargin, t: plotTopMargin, b: plotBottomMargin },
          legend: plotLegendLayout(legend_x),
          showlegend: showLegend,
        });
        // init full plot data refs
        fullPlotDataMat.current = plotMat;
        fullAnnoColors.current = annoColors;
        fullTooltips.current = tooltips;
        fullPlotStart.current = plotViewStart;
        fullPlotEnd.current = plotViewEnd;
        // init view and buffer vars
        plotDataView.current = plotData;
        annoColorsView.current = annoColors;
        tooltipsView.current = tooltips;
      }

      // update reference
      colorArrInHsl.current = colorHslArr;
      motifNameArr.current = motifNames;
      scaledAnnoScoresThreshold.current = scaledThreshold;

      if (plotRef.current) {
        // manually scroll to halfway
        setTimeout(() => {
          const scrollPosition = 0.5 * (plotRefScrollLeftMax.current);
          plotRef.current.scrollLeft = scrollPosition;
          colorBoxRef.current.scrollLeft = scrollPosition;
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
      // get left 2000 padding
      await updatePlotMatAnnoTooltips('left', strand, plotPaddingLen, puffinConfig, fullStart, fullEnd, fullPlotStart, fullPlotEnd, fullPlotDataMat);
      await updatePlotMatAnnoTooltips('right', strand, plotPaddingLen, puffinConfig, fullStart, fullEnd, fullPlotStart, fullPlotEnd, fullPlotDataMat);
      // y matrix for start buffer
      const [startBufferStart, startBufferEnd, endBufferStart, endBufferEnd] = [boxStart.current - 500, boxEnd.current - 500, boxStart.current + 500, boxEnd.current + 500];
      const startBufferMat = getPlotMatrix(fullPlotDataMat.current, fullPlotStart.current, fullPlotEnd.current, startBufferStart, startBufferEnd, strand);
      const endBufferMat = getPlotMatrix(fullPlotDataMat.current, fullPlotStart.current, fullPlotEnd.current, endBufferStart, endBufferEnd, strand);
      plotDataStartBuffer.current = getPlotData(startBufferMat, startBufferStart, startBufferEnd, strand, puffinConfig.current);
      plotDataEndBuffer.current = getPlotData(endBufferMat, endBufferStart, endBufferEnd, strand, puffinConfig.current);

      // set annos and tooltips
      const [startSliceStart, startSliceEnd] = getSliceIndicesFromCoords(fullPlotStart.current, fullPlotEnd.current, startBufferStart, startBufferEnd, strand);
      const [endSliceStart, endSliceEnd] = getSliceIndicesFromCoords(fullPlotStart.current, fullPlotEnd.current, endBufferStart, endBufferEnd, strand);
      annoColorsStartBuffer.current = fullAnnoColors.current.slice(startSliceStart, startSliceEnd);
      tooltipsStartBuffer.current = fullTooltips.current.slice(startSliceStart, startSliceEnd);
      annoColorsEndBuffer.current = fullAnnoColors.current.slice(endSliceStart, endSliceEnd);
      tooltipsEndBuffer.current = fullTooltips.current.slice(endSliceStart, endSliceEnd);
    };
    if (isPlotInited && seqInited) {
      console.log('initiating buffers');
      // after the plot is inited, expand the sequence, set plot buffers
      initPlotBuffers();
    }
  }, [isPlotInited]);

  // tracking these values
  const debugVars = { boxSeqFullWidth, boxWidth, viewSeqLen, fullStart, fullEnd, boxStart, boxEnd, fullSeq, boxSeq, genome, chromosome, strand, tooltips, is1kMode, scrollingBox, scrollLeft, scrollLeftMax, viewCoords, plotDivHeight, plotLayout, showCentralLine, fullPlotDataMat, fullAnnoColors, fullTooltips, fullPlotStart, fullPlotEnd, isPlotInited, colorBoxRef, oneKCharWidth };

  // fold genome form
  const [isGenomeFormFolded, setIsGenomeFormFolded] = useState(false);

  const genomeFormVars = { genome, setGenome, chromosome, setChromosome, coordinate, setCoordinate, strand, setStrand, gene, setGene };

  // sync dalliance genome browser as seq view box start, mid and end coord changes
  useEffect(() => {
    if (browserRef.current && viewCoords.length && viewCoords[0] && viewCoords[2]) {
      if (strand === '+') {
        browserRef.current.setLocation(chromosome, viewCoords[1] - Math.floor(plotViewSeqHalfLen.current), viewCoords[1] + Math.floor(plotViewSeqHalfLen.current));
      } else { // minus strand
        browserRef.current.setLocation(chromosome, viewCoords[1] + Math.floor(plotViewSeqHalfLen.current), viewCoords[1] - Math.floor(plotViewSeqHalfLen.current));
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
                className="sequence-box bg-white border-[2px] border-dashed border-green-500 overflow-x-auto font-mono"
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
              <span className="text-gray-700 font-medium">1k mode</span>
              <label className="relative inline-flex cursor-pointer items-center">
                <input
                  type="checkbox"
                  checked={is1kMode}
                  onChange={handle1kToggle}
                  className="peer sr-only"
                />
                <div className="peer h-6 w-11 rounded-full border bg-slate-200 after:absolute after:left-[2px] after:top-0.5 after:h-5 after:w-5 after:rounded-full after:border after:border-gray-300 after:bg-white after:transition-all after:content-[''] peer-checked:bg-sky-800 peer-checked:after:translate-x-full peer-checked:after:border-white peer-focus:ring-green-300"></div>
              </label>
              <span className="text-gray-700 font-medium">Sequence box area</span>
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
            {/* {is1kMode && (<div className="flex items-center space-x-2">
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
            </div>)} */}

          </div>

          {/* squeeze all 1k sequences */}
          {is1kMode && <div className='relative pb-1 mb-1'>
            {/* middle line */}
            <div
              className="absolute w-[2px] bg-gray-400 top-0 bottom-0"
              style={{ left: `50%`, }}
            ></div>

            {/* Ruler */}
            {viewCoords.length && <div className="relative pt-3 pb-3 bg-white border-b border-gray-800">

              <div className="absolute pt-1 top-0 left-1/2 text-xs text-blue-600"
                style={{ left: "0%", transform: "translateX(0%)" }}
              >
                {strand === '+' ? Math.floor(viewCoords[1]) - Math.floor(plotViewSeqHalfLen.current) : Math.floor(viewCoords[1]) + Math.floor(plotViewSeqHalfLen.current)}
              </div>

              <div className="absolute pt-1 top-0 transform -translate-x-1/2 text-xs text-blue-600"
                style={{ left: "50%" }}
              >
                {Math.floor(viewCoords[1])}
              </div>

              <div className="absolute pt-1 top-0 left-1/2 text-xs text-blue-600"
                style={{ left: "100%", transform: "translateX(-100%)" }}
              >
                {strand === '+' ? Math.floor(viewCoords[1]) + Math.floor(plotViewSeqHalfLen.current) : Math.floor(viewCoords[1]) - Math.floor(plotViewSeqHalfLen.current)}
              </div>

              {ticks.map((pos, index) => (
                <div key={index} className="absolute top-5 bottom-0 w-[3px] bg-blue-500"
                  style={{ left: `${pos}%` }}
                ></div>
              ))}
            </div>}
            <div
              className="anno-color-box bg-white border border-gray-300 overflow-x-auto font-mono"
              style={{ whiteSpace: "nowrap", }}
              ref={colorBoxRef}
            >
              {/* Full Box */}
              {showCentralLine && <div
                className="absolute top-6 bottom-1 border-2 border-dashed border-green-500"
                style={{
                  left: `${50 - seqBoxBorderHalf.current}%`, // Left edge
                  width: `${seqBoxBorderHalf.current * 2}%`, // Width of the box
                  pointerEvents: "none",
                }}
              ></div>}
              {/* Middle Vertical Line */}

              {boxSeq && oneKCharWidth
                ? boxSeq.split("").map((char, index) => (
                  <Tippy content={`${char + ' ' + tooltips[index]}`} key={index}>
                    <span style={{
                      backgroundColor: annoColors[index],
                      display: "inline-block",
                      width: `${oneKCharWidth}px`,
                      height: "10px",
                    }} >
                      {" "}
                    </span>
                  </Tippy>
                  // vanilla tooltips
                  // <span
                  //   key={index}
                  //   className="inline-block"
                  //   title={char + ' ' + tooltips[index]} // Native tooltip with coordinate
                  //   style={{
                  //     backgroundColor: annoColors[index],
                  //     width: `${oneKCharWidth}px`,
                  //     height: "10px",
                  //   }}
                  // >
                  //   {" "}
                  // </span>
                ))
                : "Loading...."}
            </div>
          </div>}

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
                    {/* Full Box */}
                    {showCentralLine && is1kMode && <div
                      className="absolute top-1 bottom-1 border-2 border-dashed border-green-500"
                      style={{
                        left: `${50 - seqBoxBorderHalf.current}%`, // Left edge
                        width: `${seqBoxBorderHalf.current * 2}%`, // Width of the box
                        pointerEvents: "none",
                      }}
                    ></div>}
                    <div className="absolute top-0 left-0 w-full h-full pointer-events-none">
                      {/* Central vertical line */}
                      {<div
                        className="absolute h-full w-[2px] bg-gray-500 opacity-60"
                        style={{
                          left: '50%',
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

          {/* <div
            className="absolute top-0 bottom-0 w-[2px] bg-gray-500"
            style={{ left: "50%" }}
          ></div>

          <DebugPanel {...debugVars} />
          */}
        </div>

      </div>
    </>
  );
}

export default App;