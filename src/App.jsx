import { useEffect, useState, useRef, useCallback } from 'react';
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
import { useSearchParams } from 'react-router-dom';
import throttle from 'lodash/throttle'

function App() {

  // NavBar hamburger button folds genome form
  const [isGenomeFormFolded, setIsGenomeFormFolded] = useState(false)

  // Genome form variables
  // State initialization from URL parameters
  const [searchParams, setSearchParams] = useSearchParams();
  const [genome, setGenome] = useState(() => searchParams.get('g') || "hg38");
  const [chromosome, setChromosome] = useState(() => searchParams.get('c') || "chr7");
  const [centerCoordinate, setCenterCoordinate] = useState(() => {
    const pos = searchParams.get('pos');
    return pos ? Math.max(1, parseInt(pos)) : 5530600;
  });
  const [strand, setStrand] = useState(() => {
    const s = searchParams.get('s');
    return ['+', '-'].includes(s) ? s : '-';
  });
  const [gene, setGene] = useState(searchParams.get('gene') || 'ACTB');

  const genomeFormVars = { genome, setGenome, chromosome, setChromosome, centerCoordinate, setCenterCoordinate, strand, setStrand, gene, setGene }

  // sequence coords system
  const boxSeqHalfLen = 2000
  const boxSeqLen = 2 * boxSeqHalfLen
  const boxStartCoord = useRef(null)
  const boxEndCoord = useRef(null)

  // box and plot share the same coordinate system.
  // start - mid - end : 4k : 4k : 4k
  // always showing the mid part, update start and end
  // 1k overlapping, 0-4k : 3-7k : 6-10k
  // shift 3k at a time, pad 3k sequence at a time

  // full sequence (pad according to the model offset)
  // const fullSequence = useRef(null)
  const overlappingLen = 1500
  // const fullSeqStart = useRef(null)
  // const fullSeqEnd = useRef(null)

  // three chunks: s (start), m (middle) and e (end)
  // based on coordinate value from small to large, instead of left and right, to avoid minus strand confusion
  // mid chunck inited with sequence and plots
  // start and end chuncks inited in buffers

  // coordinates
  const sStart = useRef(null)
  const sEnd = useRef(null)
  const mStart = useRef(null)
  const mEnd = useRef(null)
  const eStart = useRef(null)
  const eEnd = useRef(null)
  // sequence
  const sSeq = useRef(null)
  const mSeq = useRef(null)
  const eSeq = useRef(null)
  // plots
  const sPlotData = useRef(null)
  const mPlotData = useRef(null)
  const ePlotData = useRef(null)
  const sTooltips = useRef(null)
  const mTooltips = useRef(null)
  const eTooltips = useRef(null)
  const sAnno = useRef(null)
  const mAnno = useRef(null)
  const eEnno = useRef(null)

  // debug UI
  const [debug1, setDebug1] = useState(null)
  const [debug2, setDebug2] = useState(null)

  // Sequence box UI
  const seqbox1 = useRef(null)
  const [box1Seq, setBox1Seq] = useState(null)
  // default tooltips: coords
  const [tooltips, setTooltips] = useState(range(centerCoordinate - boxSeqHalfLen, centerCoordinate + boxSeqHalfLen))
  // default color: white
  const [annoColors, setAnnoColors] = useState(['white'] * boxSeqLen)

  // track loading and intitiation processes
  const [isSeqInited, setIsSeqInited] = useState(false)
  const [isOnnxSessionLoaded, setIsOnnxSessionLoaded] = useState(false)
  const [isPlotInited, setIsPlotInited] = useState(false)
  const [isBufferInited, setIsBufferInited] = useState(false)

  // onnx sessions for inference and annotation calculation
  const configs = useRef(null)
  const inferenceSession = useRef(null)
  const annoSession = useRef(null)

  // settings to get plot data, tooltips and anno colors
  const inferenceOffset = useRef(null)
  const yDataKeys = useRef(null)
  const motifNames = useRef(null)
  const motifHslColors = useRef(null)
  const colorThreshold = useRef(null)

  // plot box
  const plotbox1 = useRef(null)
  const plotbox2 = useRef(null)
  const plotbox3 = useRef(null)

  const [plotData, setPlotData] = useState(null)
  const [plotLayout, setPlotLayout] = useState(null)

  const [plotData2, setPlotData2] = useState(null)
  const [plotData3, setPlotData3] = useState(null)

  const [plot1Z, setPlot1Z] = useState(3)
  const [plot2Z, setPlot2Z] = useState(2)
  const [plot3Z, setPlot3Z] = useState(1)

  // at init, mid plot in plotbox1, start buffer in plotbox2, end buffer in plotbox3
  const bufferPlotBoxMap = useRef({ 'mid': 1, 'start': 2, 'end': 3 })

  // tracking sizes, width for both sequence and plot box
  const boxWindowWidth = useRef(null)
  const seqBoxScrollWidth = useRef(null)
  const plotBoxScrollWidth = useRef(null)
  // scrollWidth - clientWidth
  const seqBoxAvailableScroll = useRef(null)
  const plotBoxAvailableScroll = useRef(null)

  // characters
  const plotWindowSeqLen = useRef(null)

  const swapLThreshold = 0.05
  const swapRThreshold = 0.95
  // for plot only, cause 
  const plotScrollLEdge = useRef(null)
  const plotScrollREdge = useRef(null)

  // scroll buffers to this position to be ready for swapping, need to change with windowsize
  const leftBufferStartPos = useRef(null)
  const rightBufferStartPos = useRef(null)

  // wether changing visibility
  const isTransitioning = useRef(false)
  const isUpdatingBuffers = useRef(false)

  // URL update effect
  useEffect(() => {
    const params = new URLSearchParams({
      g: genome,
      c: chromosome,
      pos: centerCoordinate.toString(),
      s: strand
    });

    // Only update if different from current URL
    if (params.toString() !== searchParams.toString()) {
      setSearchParams(params, { replace: true });
    }
  }, [genome, chromosome, centerCoordinate, strand, searchParams, setSearchParams]);

  useEffect(() => {
    loadModelAndConfig('/puffin.config.json', configs, inferenceSession, annoSession, setIsOnnxSessionLoaded)
  }, []);

  useEffect(() => {
    initSequence(genome, chromosome, centerCoordinate, strand, boxSeqHalfLen, boxSeqLen, boxStartCoord, boxEndCoord, setBox1Seq, setIsSeqInited, seqbox1, mStart, mEnd, mSeq, boxWindowWidth, plotBoxScrollWidth)
  }, [genome, chromosome, centerCoordinate, strand])

  // load plot once sequence and inference sessions are ready
  useEffect(() => {
    if (isSeqInited && isOnnxSessionLoaded) {
      initPlot(setIsPlotInited, configs, inferenceSession, annoSession, boxStartCoord, boxEndCoord, genome, chromosome, strand, setTooltips, setAnnoColors, setPlotData, setPlotLayout, boxSeqLen, plotbox1, yDataKeys, inferenceOffset, motifNames, motifHslColors, colorThreshold, plotBoxScrollWidth, plotBoxAvailableScroll, plotScrollLEdge, plotScrollREdge, swapLThreshold, swapRThreshold, plotWindowSeqLen, mPlotData)
    }
  }, [isSeqInited, isOnnxSessionLoaded])

  // once plot inited, set buffers
  useEffect(() => {
    const initBuffers = async () => {
      // 3 sections, 2 overlapping, so actually should be overlapping half len * 2 = over lapping len
      // const fullSeqUnpaddedHalfLen = boxSeqHalfLen * 3 - overlappingLen
      // const fullSeqHalfLen = fullSeqUnpaddedHalfLen + inferenceOffset.current
      // const [fullStart, fullEnd] = [centerCoordinate - fullSeqHalfLen, centerCoordinate + fullSeqHalfLen]
      // const seq = await fetchSequence(fullStart, fullEnd, genome, chromosome, strand)

      const offset = inferenceOffset.current
      // start buffer
      const s_start = mStart.current - boxSeqLen + overlappingLen
      const s_end = s_start + boxSeqLen
      const sSeqPadded = await fetchSequence(s_start - offset, s_end + offset, genome, chromosome, strand)
      const s_seq = sSeqPadded.slice(offset, -offset)

      const s_inference = await runInference(sSeqPadded, inferenceSession)
      const sPlotMat = yDataKeys.current.map(key => Array.from(s_inference[key].data))
      const s_plot_data = getPlotData(sPlotMat, s_start, s_end, strand, configs)

      // end buffer
      const e_start = mEnd.current - overlappingLen
      const e_end = e_start + boxSeqLen
      const eSeqPadded = await fetchSequence(e_start - offset, e_end + offset, genome, chromosome, strand)
      const e_seq = eSeqPadded.slice(offset, -offset)

      const e_inference = await runInference(eSeqPadded, inferenceSession)
      const ePlotMat = yDataKeys.current.map(key => Array.from(e_inference[key].data))
      const e_plot_data = getPlotData(ePlotMat, e_start, e_end, strand, configs)

      setPlotData2(s_plot_data)
      setPlotData3(e_plot_data)

      setTimeout(() => {
        const availLen = boxSeqLen - plotWindowSeqLen.current
        const rightBufferPercent = (swapRThreshold * availLen - boxSeqLen + overlappingLen) / availLen
        if (rightBufferPercent < 0.1) {
          console.warn('right buffer scroll position to close to edge at', rightBufferPercent)
        }
        const rStartPos = plotBoxAvailableScroll.current * rightBufferPercent

        const leftBufferPercent = (swapLThreshold * availLen + boxSeqLen - overlappingLen) / availLen
        const lStartPos = plotBoxAvailableScroll.current * leftBufferPercent
        if (leftBufferPercent > 0.9) {
          console.warn('left buffer scroll position to close to edge at', rightBufferPercent)
        }

        if (strand === '+') {
          // end box on the right
          plotbox3.current.scrollLeft = rStartPos
          plotbox2.current.scrollLeft = lStartPos

        } else {
          // start box on the right
          plotbox2.current.scrollLeft = rStartPos
          plotbox3.current.scrollLeft = lStartPos
        }

        setIsBufferInited(true)

        // update refs
        sSeq.current = s_seq
        sStart.current = s_start
        sEnd.current = s_end
        sPlotData.current = s_plot_data

        eSeq.current = e_seq
        eStart.current = e_start
        eEnd.current = e_end
        ePlotData.current = e_plot_data

        rightBufferStartPos.current = rStartPos
        leftBufferStartPos.current = lStartPos
      }, 10);

    }
    if (isPlotInited) {
      initBuffers()
    }
  }, [isPlotInited])

  // returns z values for plotbox 1, 2, 3 in that order
  const getPlotBoxZValues = (direction, strand, bufferPlotBoxMap) => {
    let topbox
    if ((direction === 'left' && strand === '+') || (direction === 'right' && strand === '-')) {
      // display start buffer on top
      topbox = 'start'
    } else {
      topbox = 'end'
    }
    const topBoxNumber = bufferPlotBoxMap.current[topbox]

    switch (topBoxNumber) {
      case 1:
        bufferPlotBoxMap.current = { 'mid': 1, 'start': 2, 'end': 3 }
        return [3, 2, 1, 2, 3] // plotbox1 on top
      case 2:
        bufferPlotBoxMap.current = { 'mid': 2, 'start': 1, 'end': 3 }
        return [2, 3, 1, 1, 3] // plotbox2 on top
      case 3:
        bufferPlotBoxMap.current = { 'mid': 3, 'start': 1, 'end': 2 }
        return [1, 2, 3, 1, 2] // plotbox3 on top
    }
  }

  const setStartEndPlotData = (startboxnum, endboxnum, sPlotData, ePlotData) => {
    const setPlotFunctions = [setPlotData, setPlotData2, setPlotData3]

    if (setPlotFunctions[startboxnum - 1]) {
      setPlotFunctions[startboxnum - 1](sPlotData)
    } else {
      console.error(`Invalid startboxnum: ${startboxnum}`)
    }

    if (setPlotFunctions[endboxnum - 1]) {
      setPlotFunctions[endboxnum - 1](ePlotData)
    } else {
      console.error(`Invalid endboxnum: ${endboxnum}`)
    }

  }

  const scrollBuffers = (startboxnum, endboxnum, plotbox1, plotbox2, plotbox3, strand, leftBufferStartPos, rightBufferStartPos) => {
    let startPos, endPos
    if (strand === '+') {
      // end buffer on the right
      endPos = rightBufferStartPos.current
      startPos = leftBufferStartPos.current
    } else {
      // start buffer on the right
      startPos = rightBufferStartPos.current
      endPos = leftBufferStartPos.current
    }
    // Create an array of refs and use the correct index safely
    const plotBoxes = [plotbox1, plotbox2, plotbox3];

    if (plotBoxes[startboxnum - 1]?.current) {
      plotBoxes[startboxnum - 1].current.scrollLeft = startPos;
    } else {
      console.error(`Invalid startboxnum: ${startboxnum}`);
    }

    if (plotBoxes[endboxnum - 1]?.current) {
      plotBoxes[endboxnum - 1].current.scrollLeft = endPos;
    } else {
      console.error(`Invalid endboxnum: ${endboxnum}`);
    }


  }

  // update buffers afer swapping
  // const updateBuffers = async (direction, strand, sSeq, mSeq, eSeq, sStart, sEnd, mStart, mEnd, eStart, eEnd, sPlotData, mPlotData, ePlotData, setPlotData, setPlotData2, setPlotdata3, startboxnum, endboxnum, boxSeqLen, overlappingLen, configs, inferenceSession, yDataKeys, startboxnum, endboxnum, plotbox1, plotbox2, plotbox3, leftBufferStartPos, rightBufferStartPos) => {
  const updateBuffers = async (direction, strand, startboxnum, endboxnum) => {
    isUpdatingBuffers.current = true
    const offset = configs.current.convOffset
    if ((direction === 'left' && strand === '+') || (direction === 'right' && strand === '-')) {

      // shift toward start: retrieve new start buffer, new mid takes on old start buffer, new end buffer takes on old mid 
      const [newMSeq, newMStart, newMEnd, newMPlotData] = [sSeq.current, sStart.current, sEnd.current, sPlotData.current]
      const [newESeq, newEStart, newEEnd, newEPlotData] = [mSeq.current, mStart.current, mEnd.current, mPlotData.current]

      const newSStart = sStart.current - boxSeqLen + overlappingLen
      const newSEnd = newSStart + boxSeqLen
      const newSPaddedSeq = await fetchSequence(newSStart - offset, newSEnd + offset, genome, chromosome, strand) // pad for running inference
      const newSSeq = newSPaddedSeq.slice(offset, -offset)
      const newSInference = await runInference(newSPaddedSeq, inferenceSession)
      const newSPlotMat = yDataKeys.current.map(key => Array.from(newSInference[key].data))
      const newSPlotData = getPlotData(newSPlotMat, newSStart, newSEnd, strand, configs)

      // Ensure all new data is ready before updating references
      await Promise.resolve();

      // update refs
      sSeq.current = newSSeq;
      sStart.current = newSStart;
      sEnd.current = newSEnd;
      sPlotData.current = newSPlotData;

      mSeq.current = newMSeq;
      mStart.current = newMStart;
      mEnd.current = newMEnd;
      mPlotData.current = newMPlotData;

      eSeq.current = newESeq;
      eStart.current = newEStart;
      eEnd.current = newEEnd;
      ePlotData.current = newEPlotData;

      // set plot data
      setStartEndPlotData(startboxnum, endboxnum, newSPlotData, newEPlotData)

      requestAnimationFrame(() => {
        scrollBuffers(startboxnum, endboxnum, plotbox1, plotbox2, plotbox3, strand, leftBufferStartPos, rightBufferStartPos)
        isUpdatingBuffers.current = false
      })


    } else {
      // shift toward end: new start takes on old mid, new mid takes on old end, retrieve new end
      const [newSSeq, newSStart, newSEnd, newSPlotData] = [mSeq.current, mStart.current, mEnd.current, mPlotData.current]
      const [newMSeq, newMStart, newMEnd, newMPlotData] = [eSeq.current, eStart.current, eEnd.current, ePlotData.current]

      // Calculate new end buffer coordinates
      const newEStart = eEnd.current - overlappingLen
      const newEEnd = newEStart + boxSeqLen

      // Fetch and process new end sequence
      const newEPaddedSeq = await fetchSequence(newEStart - offset, newEEnd + offset, genome, chromosome, strand)
      const newESeq = newEPaddedSeq.slice(offset, -offset)
      const newEInference = await runInference(newEPaddedSeq, inferenceSession)
      const newEPlotMat = yDataKeys.current.map(key => Array.from(newEInference[key].data))
      const newEPlotData = getPlotData(newEPlotMat, newEStart, newEEnd, strand, configs)

      // Ensure all new data is ready before updating references
      await Promise.resolve();

      sSeq.current = newSSeq;
      sStart.current = newSStart;
      sEnd.current = newSEnd;
      sPlotData.current = newSPlotData;
      
      mSeq.current = newMSeq;
      mStart.current = newMStart;
      mEnd.current = newMEnd;
      mPlotData.current = newMPlotData;
      
      eSeq.current = newESeq;
      eStart.current = newEStart;
      eEnd.current = newEEnd;
      ePlotData.current = newEPlotData;

      // set plot data
      setStartEndPlotData(startboxnum, endboxnum, newSPlotData, newEPlotData)

      requestAnimationFrame(() => {
        scrollBuffers(startboxnum, endboxnum, plotbox1, plotbox2, plotbox3, strand, leftBufferStartPos, rightBufferStartPos)
        isUpdatingBuffers.current = false
      })

    }

  }

  const handlePlotBoxScroll = useCallback(throttle(async (e) => {
    if (isTransitioning.current) return;

    const scrollLeft = e.target.scrollLeft;

    if (scrollLeft >= plotScrollREdge.current && !isUpdatingBuffers.current) {
      isTransitioning.current = true

      const [z1, z2, z3, startboxnum, endboxnum] = getPlotBoxZValues('right', strand, bufferPlotBoxMap)
      // Switch visibility
      setPlot1Z(z1)
      setPlot2Z(z2)
      setPlot3Z(z3)

      requestAnimationFrame(() => {
        isTransitioning.current = false
      })

      await updateBuffers('right', strand, startboxnum, endboxnum)
    }
  }, 100), []);

  // slow down scrolling speed to 0.2 of default
  const slowPlotScroll1 = useCallback(
    slowerScrollHandler(plotbox1, 0.2),
    [plotbox1]
  );

  const slowPlotScroll2 = useCallback(
    slowerScrollHandler(plotbox2, 0.2),
    [plotbox2]
  );
  // Attach listeners to both containers
  useEffect(() => {

    const plot1 = plotbox1.current;
    const plot2 = plotbox2.current;

    if (isPlotInited) {
      plot1.addEventListener('wheel', slowPlotScroll1, { passive: false });
    }

    if (isBufferInited) {
      plot2.addEventListener('wheel', slowPlotScroll2, { passive: false });
    }

    return () => {
      plot1?.removeEventListener('wheel', slowPlotScroll1);
      plot2?.removeEventListener('wheel', slowPlotScroll2);
    };
  }, [isPlotInited, isBufferInited, slowPlotScroll1, slowPlotScroll2]);


  return (
    <>
      < NavBar isGenomeFormFolded={isGenomeFormFolded} setIsGenomeFormFolded={setIsGenomeFormFolded} />
      <div className='flex h-screen'>
        {/* Left side: genome form, spans 1/4 or max-15rem */}
        {!isGenomeFormFolded && (
          <div className='w-1/4 max-w-[15rem] border-r border-gray-300 p-4'>
            <GenomeForm {...genomeFormVars} />
          </div>
        )}

        {/* Right side: sequence box and plot box */}
        <div className='w-3/4 flex-grow p-2 overflow-x-hidden'>
          {/* Sequence box */}
          <div className='relative'>
            <div
              className="sequence-box bg-white border-[2px] border-dashed border-green-500 overflow-x-auto font-mono whitespace-nowrap"
              ref={seqbox1}
            >
              {/* Vertical center line in sequence box */}
              <div className="absolute top-0 bottom-0 w-[2px] bg-gray-500 left-[50%]" />
              {/* {box1Seq} */}
              {box1Seq ?
                box1Seq.split("").map((char, index) => (
                  <Tippy content={tooltips[index]} key={index}>
                    <span style={{ backgroundColor: annoColors[index] }}>
                      {char}
                    </span>
                  </Tippy>
                ))
                : "Loading...."}
            </div>
          </div>

          <button className='bg-blue-500 hover:bg-blue-700 text-white font-bold py-1 px-2 rounded m-1'
            onClick={() => {
              setPlot1Z(3)
              setPlot2Z(2)
              setPlot3Z(1)
            }}
          > Show box1</button>

          <button className='bg-blue-500 hover:bg-blue-700 text-white font-bold py-1 px-2 rounded m-1'
            onClick={() => {
              setPlot1Z(1)
              setPlot2Z(3)
              setPlot3Z(2)
            }}
          > Show box2</button>

          <button className='bg-blue-500 hover:bg-blue-700 text-white font-bold py-1 px-2 rounded m-1'
            onClick={() => {
              setPlot1Z(1)
              setPlot2Z(2)
              setPlot3Z(3)
            }}
          > Show box3</button>

          <div>z indices: box1 {plot1Z}; box2 {plot2Z}; box3 {plot3Z}. Contents: start {bufferPlotBoxMap.current.start}; mid/view {bufferPlotBoxMap.current.mid}, end: {bufferPlotBoxMap.current.end} <br />Coords (start-end): start {sStart.current}-{sEnd.current}; mid/view {mStart.current}-{mEnd.current}; end {eStart.current}-{eEnd.current}  </div>

          {/* Plot box */}
          {plotData ?
            <div className='mt-2'>
              {/* Plot title */}
              {<div className="w-full h-4 mb-4 text-xl flex items-center justify-center">{configs.current.title}</div>}

              <div className='relative h-[515px]'>

                {configs.current.subtitles.map((title, index) => (
                  <div
                    key={index}
                    className="absolute w-full text-center text-sm font-semibold text-gray-700 z-20"
                    style={{
                      top: `${Math.floor(index / configs.current.subtitles.length * 100)}%`, // Position each title vertically
                      transform: 'translateY(-50%)', // Center vertically relative to the calculated position
                    }}
                  >
                    {title}
                  </div>
                ))}
                {/* Vertical center line in plot box */}
                <div className="absolute top-0 bottom-0 w-[2px] bg-gray-500 left-[50%] z-10" />

                <div
                  className="plot-box-1 absolute top-0 left-0 w-full overflow-x-auto border"
                  style={{ zIndex: plot1Z }}
                  ref={plotbox1}
                  onScroll={handlePlotBoxScroll}
                >

                  <Plot
                    data={plotData}
                    layout={plotLayout}
                    config={{ responsive: false }}
                  />
                </div>

                {plotData2 &&
                  <div
                    className="plot-box-2 absolute top-0 left-0  w-full  overflow-x-auto border"
                    style={{ zIndex: plot2Z }}
                    ref={plotbox2}
                  onScroll={handlePlotBoxScroll}
                  >
                    <Plot
                      data={plotData2}
                      layout={plotLayout}
                      config={{ responsive: false }}
                    />
                  </div>}


                {plotData3 &&
                  <div
                    className="plot-box-3 absolute top-0 left-0  w-full  overflow-x-auto border"
                    style={{ zIndex: plot3Z }}
                    ref={plotbox3}
                  onScroll={handlePlotBoxScroll}
                  >
                    <Plot
                      data={plotData3}
                      layout={plotLayout}
                      config={{ responsive: false }}
                    />
                  </div>}

              </div>
            </div>
            : 'Loading...'
          }

        </div>
      </div>
    </>
  )
}

// init function: load config file
const loadModelAndConfig = async (configFile, configs, inferenceSession, annoSession, setIsOnnxSessionLoaded) => {
  setIsOnnxSessionLoaded(false)
  try {
    const response = await fetch(configFile)
    const data = await response.json()
    configs.current = data;
    // init onnx sessions
    inferenceSession.current = await window.ort.InferenceSession.create(data.modelPath)
    annoSession.current = await window.ort.InferenceSession.create(data.annoModelPath)
    setIsOnnxSessionLoaded(true)
  } catch (error) {
    setIsOnnxSessionLoaded(false)
    console.error('Error loading configuration and initing model', error)
  }
};

// init function: sequence
// TODO: merge init sequence and plots together
const initSequence = async (genome, chromosome, centerCoordinate, strand, boxSeqHalfLen, boxSeqLen, boxStartCoord, boxEndCoord, setBox1Seq, setIsSeqInited, seqbox1, mStart, mEnd, mSeq, boxWindowWidth, plotBoxScrollWidth) => {
  setIsSeqInited(false)
  const [start, end] = [centerCoordinate - boxSeqHalfLen, centerCoordinate + boxSeqHalfLen]
  const sequence = await fetchSequence(start, end, genome, chromosome, strand)
  setBox1Seq(sequence)
  boxStartCoord.current = start
  boxEndCoord.current = end

  setIsSeqInited(true)
  // scroll seqbox to 50% after sequence inited
  requestAnimationFrame(() => {
    const availableScroll = seqbox1.current.scrollWidth - seqbox1.current.clientWidth
    const targetScroll = (0.5 + 0.5 / boxSeqLen) * availableScroll
    seqbox1.current.scrollLeft = targetScroll

    // init width trackers
    boxWindowWidth.current = seqbox1.current.clientWidth
    const plotPxPerBP = Math.max(Math.ceil(seqbox1.current.clientWidth / 500), 3) * 0.5
    plotBoxScrollWidth.current = plotPxPerBP * boxSeqLen

    // init middle seq
    mStart.current = start
    mEnd.current = end
    mSeq.current = sequence
  })
}

const runInference = async (inputSequence, inferenceSession) => {
  try {
    if (!inferenceSession.current) {
      throw new Error('Model session is not initialized.');
    }

    // Encode the sequence
    const seqEncoded = encodeSequence(inputSequence);
    const seqEncodedTensor = new ort.Tensor('float32', seqEncoded.flat(), [1, 4, inputSequence.length]);

    // Run inference
    const feeds = { [inferenceSession.current.inputNames[0]]: seqEncodedTensor };
    const results = await inferenceSession.current.run(feeds);

    return results;
  } catch (error) {
    console.error("Error running inference:", error);
    return null;
  }
};

// Updated getTooltips function
const annoSetup = (start, end, strand, maxIndices, maxValues, maxAll, colorHslArr, colorThreshold, motifNames) => {
  // Reverse range if strand is '-'
  const coordinates = strand === '-' ? range(end, start, -1) : range(start, end)

  // Initialize arrays
  const tooltips = []
  const annoColors = []
  const scaledAnnoScores = []

  // Loop through each base pair to calculate values
  coordinates.forEach((coordinate, index) => {
    const motifIndex = maxIndices[index]
    const motifScore = maxValues[index]
    const scaledScore = motifScore / maxAll; // Scale the score by maxAll

    // Add scaled score to the array
    scaledAnnoScores.push(scaledScore)

    // Generate tooltip
    if (scaledScore < colorThreshold) {
      tooltips.push(`${coordinate}`) // Only coordinate if below threshold
    } else {
      const motifName = motifNames[Number(motifIndex)]; // Get motif name
      tooltips.push(`${coordinate} ${motifName}: ${motifScore.toFixed(3)} (${scaledScore.toFixed(3)})`)
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

const runAnnoProcessing = async (configs, results, annoSession, startCoord, endCoord, strand, colorHslArr, colorThreshold, motifNames) => {
  try {
    const [start, end] = [startCoord.current, endCoord.current]
    // Collect motif scores
    const motifScores = []

    for (const key of configs.current.annoInputs) {
      const tensor = results[key]; // Access the tensor using the key
      if (!tensor || tensor.data.length !== end - start) { // inference output has same length as seq box
        throw new Error(`Invalid tensor data for ${key}`)
      }
      motifScores.push(Array.from(tensor.data)) // Convert tensor data to an array
    }

    // Flatten and create input tensor
    const flatMotifScores = motifScores.flat()
    const stackedTensor = new ort.Tensor('float32', flatMotifScores, [configs.current.annoInputs.length, end - start]);

    // Run the post-processing model
    const feeds = { motif_scores: stackedTensor }
    const outputs = await annoSession.current.run(feeds)
    const maxValues = outputs.max_values.data;
    const maxIndices = outputs.max_indices.data
    const maxAll = outputs.max_all.data[0]

    const { tooltips, annoColors } = annoSetup(start, end, strand, maxIndices, maxValues, maxAll, colorHslArr, colorThreshold, motifNames)
    return [tooltips, annoColors]

  } catch (error) {
    console.error("Error during post-processing:", error)
    return null;
  }
};

const getPlotData = (plotDataMatrix, start, end, strand, plotConfig) => {
  // Generate x values based on strand direction
  const xs = strand === '+' ? range(start, end) : range(end, start, -1) // Reverse coordinates for '-' strand

  // Loop through the trace configuration list with indexes
  const plotTraces = plotConfig.current.traces.map((traceConfig, index) => {
    // Extract y values from the corresponding row in the matrix
    const yData = plotDataMatrix[index]
    if (!yData) return null // Skip if yData is unavailable

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

const initPlot = async (setIsPlotInited, configs, inferenceSession, annoSession, boxStartCoord, boxEndCoord, genome, chromosome, strand, setTooltips, setAnnoColors, setPlotData, setPlotLayout, boxSeqLen, plotbox1, yDataKeys, inferenceOffset, motifNames, motifHslColors, colorThreshold, plotBoxScrollWidth, plotBoxAvailableScroll, plotScrollLEdge, plotScrollREdge, swapLThreshold, swapRThreshold, plotWindowSeqLen, mPlotData) => {
  setIsPlotInited(false)

  const convOffset = configs.current.convOffset
  const seq = await fetchSequence(boxStartCoord.current - convOffset, boxEndCoord.current + convOffset, genome, chromosome, strand) // fetch sequence because need longer than seqbox
  const outputs = await runInference(seq, inferenceSession)

  // inference parameters
  const scaledThreshold = configs.current.scaledThreshold
  const motifs = []
  const motifColors = []
  for (const entry of configs.current.motifNameColorDict) {
    const [name] = Object.keys(entry)
    const [color] = Object.values(entry)
    motifs.push(name); motifColors.push(color)
  }
  const colorHslArr = motifColors.map(hex => hexToHsl(hex))

  const [tooltips, annoColors] = await runAnnoProcessing(configs, outputs, annoSession, boxStartCoord, boxEndCoord, strand, colorHslArr, scaledThreshold, motifs)
  setTooltips(tooltips)
  setAnnoColors(annoColors)

  // get plot data
  const plotYKeys = configs.current.traces.map(item => item.result_key)
  if (outputs) {
    // plot matrix
    const plotMat = plotYKeys.map(key => Array.from(outputs[key].data))
    const plotData = getPlotData(plotMat, boxStartCoord.current, boxEndCoord.current, strand, configs)
    setPlotData(plotData)

    const xaxisLayout = { tickformat: 'd', autorange: strand === '-' ? 'reversed' : true, }
    const totalPlots = configs.current.grid.rows * configs.current.grid.columns;
    const axisLayout = {};
    for (let i = 0; i < totalPlots; i++) {
      axisLayout[`xaxis${i + 1}`] = xaxisLayout;
    }

    setPlotLayout({
      ...axisLayout,
      height: 515,
      grid: configs.current.grid,
      width: plotBoxScrollWidth.current,
      template: 'plotly_white',
      margin: { l: 0, r: 0, t: 0, b: 15 },
      showlegend: false,
    });
    // update ref
    mPlotData.current = plotData
  }

  // scroll plot to half way point, double RAF was not stable, so use timeout instead
  setTimeout(() => {
    const availableScroll = plotbox1.current.scrollWidth - plotbox1.current.clientWidth
    plotbox1.current.scrollLeft = 0.5 * availableScroll
    // plotbox1.current.scrollLeft = swapRThreshold * availableScroll // 0.95
    // plotbox1.current.scrollLeft = swapLThreshold * availableScroll // 0.05
    setIsPlotInited(true)

    // init reference
    yDataKeys.current = plotYKeys
    inferenceOffset.current = convOffset
    motifNames.current = motifs
    motifHslColors.current = colorHslArr
    colorThreshold.current = scaledThreshold

    plotBoxAvailableScroll.current = plotBoxScrollWidth.current - plotbox1.current.clientWidth
    plotScrollLEdge.current = availableScroll * swapLThreshold
    plotScrollREdge.current = availableScroll * swapRThreshold

    const windowSeqLen = plotbox1.current.clientWidth / plotBoxScrollWidth.current * boxSeqLen
    // const leftMostTest = (boxSeqLen - windowSeqLen) * swapRThreshold
    plotWindowSeqLen.current = windowSeqLen

  }, 10);
}


const slowerScrollHandler = (elementRef, slowdownFactor) => (e) => {
  if (!elementRef.current) return;

  e.preventDefault();
  const container = elementRef.current;
  const delta = e.deltaX || e.deltaY; // Prioritize horizontal scroll
  container.scrollLeft += delta * slowdownFactor;
};

export default App;