import { useEffect, useState, useRef, useCallback, useMemo } from 'react'
import './App.css'
import { useSearchParams } from 'react-router-dom'
import inferenceWorker from "./inferenceWorker?worker"
import { FixedSizeList as List } from 'react-window'
import GenomeForm from './GenomeForm'
import Tippy from '@tippyjs/react';
import 'tippy.js/dist/tippy.css';
import Plot from 'react-plotly.js';
import throttle from 'lodash/throttle'

function App() {

  // State initialization from URL parameters
  const [searchParams, setSearchParams] = useSearchParams()
  const [genome, setGenome] = useState(() => searchParams.get('g') || "hg38")
  const [chromosome, setChromosome] = useState(() => searchParams.get('c') || "chr7")
  const [centerCoordinate, setCenterCoordinate] = useState(() => {
    const pos = searchParams.get('pos')
    return pos ? Math.max(1, parseInt(pos)) : 5530600
  })
  const [strand, setStrand] = useState(() => {
    const s = searchParams.get('s')
    return ['+', '-'].includes(s) ? s : '-'
  })
  const [gene, setGene] = useState(searchParams.get('gene') || 'ACTB')

  const genomeFormVars = { genome, setGenome, chromosome, setChromosome, centerCoordinate, setCenterCoordinate, strand, setStrand, gene, setGene }

  const boxSeqHalfLen = 1500
  const boxSeqLen = boxSeqHalfLen * 2
  const plotStartCoord = useRef(null)
  const plotEndCoord = useRef(null)

  const seqStartCoord = useRef(null)
  const seqEndCoord = useRef(null)

  const container = useRef(null) // common container for both seq and plot
  // sequence box
  const seqbox = useRef(null)
  const [seq, setSeq] = useState(null)

  const seqList = useRef(null)
  const tooltipsList = useRef(null)
  const annoList = useRef(null)

  // default tooltips: coords
  // const [tooltips, setTooltips] = useState(strand === '+' ? range(centerCoordinate - boxSeqHalfLen, centerCoordinate + boxSeqHalfLen) : range(centerCoordinate + boxSeqHalfLen, centerCoordinate - boxSeqHalfLen, -1))
  const [tooltips, setTooltips] = useState(null)
  // default color: white
  const [annoColors, setAnnoColors] = useState(null)

  const infWorker = useRef(null)
  const pendingInference = useRef(new Map())

  const configs = useRef(null)
  const [isConfigsLoad, setIsConfigsLoaded] = useState(false)
  const [isWorkerInited, setIsWorkerInited] = useState(false)
  const [isFirstChunkInited, setIsFirstChunkInited] = useState(false)

  // plot box
  const plotbox = useRef(null)
  const plotHeight = 515
  const plotBottomMargin = 15

  // fixed sized list init
  const initPlotNum = 3
  const [items, setItems] = useState([0]) // one item only
  const initMiddleIdx = Math.floor(initPlotNum / 2)

  const plotDataList = useRef(null)
  const plotLayoutList = useRef(null)

  // tracking sizes
  const boxWindowWidth = useRef(null) // width for both sequence and plot box
  const seqBoxPxPerBase = 10
  const plotBoxPxPerBase = useRef(null) // pixel per character/ base, 1.5, 2, and so on
  const seqBoxScrollWidth = useRef(seqBoxPxPerBase * boxSeqLen * 3) // left, mid, right, 3 chunks only
  const plotBoxScrollWidth = useRef(null)
  const seqBoxBaseLen = useRef(null)
  const plotBoxBaseLen = useRef(null)

  const syncScrollOffset = useRef(null) // plot area has more bases, so seq box need to scroll extra lengths to match the middle coordinate
  const matchingStartScrollPos = useRef(null) // starting position that matches the seq box

  // scrollWidth - clientWidth
  const seqBoxAvailableScroll = useRef(null)
  const plotBoxAvailableScroll = useRef(null)

  // scroll buffers to this position to be ready for swapping, need to change with windowsize
  const leftUpdateTriggerPoint = useRef(null)
  const rightUpdateTriggerPoint = useRef(initPlotNum)

  // track scrolling
  const isInitedScrolled = useRef(false)
  const isTransitioning = useRef(false)
  const isUpdatingLists = useRef(false)

  // coodinate ruler
  const [coords, setCoords] = useState([0, 0, 0])

  // URL update effect
  useEffect(() => {
    const params = new URLSearchParams({
      g: genome,
      c: chromosome,
      pos: centerCoordinate.toString(),
      s: strand
    })

    // Only update if different from current URL
    if (params.toString() !== searchParams.toString()) {
      setSearchParams(params, { replace: true })
    }
  }, [genome, chromosome, centerCoordinate, strand, searchParams, setSearchParams])

  // load configs
  useEffect(() => {
    loadConfigFile('/puffin.config.json', configs, setIsConfigsLoaded)

  }, [])

  // init infWorker
  useEffect(() => {
    if (isConfigsLoad) {
      initWorker(infWorker, pendingInference, setIsWorkerInited, configs)

      // set widths
      const boxWidth = container.current.clientWidth
      boxWindowWidth.current = boxWidth
      const plotPxPerBP = Math.max(Math.ceil(boxWidth / 500), 3) * 0.5
      const plotScrollWidth = plotPxPerBP * boxSeqLen
      plotBoxScrollWidth.current = plotScrollWidth
      plotBoxAvailableScroll.current = plotScrollWidth - boxWidth
      seqBoxAvailableScroll.current = seqBoxScrollWidth.current - boxWidth
      plotBoxPxPerBase.current = plotPxPerBP

      seqBoxBaseLen.current = boxWidth / seqBoxPxPerBase
      plotBoxBaseLen.current = boxWidth / plotPxPerBP

      syncScrollOffset.current = (boxWidth / plotPxPerBP - boxWidth / seqBoxPxPerBase) / 2 * seqBoxPxPerBase  + seqBoxPxPerBase * boxSeqLen // plus the left buffer

      matchingStartScrollPos.current = initMiddleIdx * plotScrollWidth // 1 * 4500 at beginning

      // right trigger point
      rightUpdateTriggerPoint.current = (initPlotNum - 2) * plotScrollWidth + plotBoxAvailableScroll.current // when reach the last part of the second but last plot
    }
  }, [isConfigsLoad])

  // init sequence, inference, and set plot
  const initPlot = async () => {
    setIsFirstChunkInited(false)
    seqList.current = new Array(initPlotNum).fill('X'.repeat(boxSeqLen))
    tooltipsList.current = new Array(initPlotNum).fill(new Array(boxSeqLen).fill('0'))
    annoList.current = new Array(initPlotNum).fill(new Array(boxSeqLen).fill('0'))

    plotDataList.current = new Array(initPlotNum).fill(null)
    plotLayoutList.current = new Array(initPlotNum).fill(null)
    isInitedScrolled.current = false

    const start = centerCoordinate - boxSeqHalfLen
    const end = centerCoordinate + boxSeqHalfLen
    plotStartCoord.current = start
    plotEndCoord.current = end

    // seqbox start and end coords with full coord
    seqStartCoord.current = centerCoordinate - initPlotNum * boxSeqHalfLen
    seqEndCoord.current = centerCoordinate + initPlotNum * boxSeqHalfLen


    const { sequence, tooltips, annocolors, plotData, plotLayout } = await getSeqPlotAnno(start, end, genome, chromosome, strand, isWorkerInited, infWorker, pendingInference, configs, plotHeight, plotBoxScrollWidth, plotBottomMargin)

    seqList.current[initMiddleIdx] = sequence
    tooltipsList.current[initMiddleIdx] = tooltips
    annoList.current[initMiddleIdx] = annocolors

    plotDataList.current[initMiddleIdx] = plotData
    plotLayoutList.current[initMiddleIdx] = plotLayout
    setItems(range(0, initPlotNum))

    requestAnimationFrame(() => {
      setIsFirstChunkInited(true)
      setSeq(seqList.current.join(""))
      setTooltips(tooltipsList.current.flat())
      setAnnoColors(annoList.current.flat())
    })

    // scroll things to middle
    setTimeout(() => {
      seqbox.current.scrollLeft = seqBoxAvailableScroll.current * 0.5
      plotbox.current.scrollToItem(initMiddleIdx, 'center')
      isInitedScrolled.current = true
    }, 10)
  }
  // get sequence
  useEffect(() => {
    if (isWorkerInited) { initPlot() }
  }, [isWorkerInited, genome, chromosome, centerCoordinate, strand])

  const initSideChunks = async () => {
    await extendFixedLists('left', strand)
    await extendFixedLists('right', strand)
    setSeq(seqList.current.join(""))
    setTooltips(tooltipsList.current.flat())
    setAnnoColors(annoList.current.flat())
  }
  // load the other two chunks once the middle chunk is loaded
  useEffect(() => {
    if (isFirstChunkInited) { initSideChunks() }
  }, [isFirstChunkInited])

  const scrollTimeout = useRef(null); // To track when scrolling stops

  const getCoords = (strand, startCoord, endCoord, scrollLeft, pxPerBase, baseLen, marks) => {

    if (strand === '+') {
      const leftCoord = startCoord + scrollLeft / pxPerBase
      const coords = marks.map((x) => Math.floor(leftCoord + x * baseLen))
      return coords
    } else {
      const leftCoord = endCoord - scrollLeft / pxPerBase
      const coords = marks.map((x) => Math.floor(leftCoord - x * baseLen))
      return coords
    }
  }

  const handlePlotBoxScroll = throttle(({ scrollOffset }) => {
    if (isTransitioning.current || !isInitedScrolled.current) return;

    // Detect when scrolling stops
    clearTimeout(scrollTimeout.current);
    scrollTimeout.current = setTimeout(() => {
      const coords = getCoords(strand, plotStartCoord.current, plotEndCoord.current, scrollOffset, plotBoxPxPerBase.current, plotBoxBaseLen.current, [0, 0.5, 1])
      setCoords(coords)

    }, 400); // Slightly longer delay to catch the stop

    // sync up the seqbox

    const seqBoxPos = syncScrollOffset.current + (scrollOffset - matchingStartScrollPos.current) / plotBoxPxPerBase.current * seqBoxPxPerBase
    seqbox.current.scrollLeft = Math.round(seqBoxPos)

    if (scrollOffset < plotBoxScrollWidth.current && !isUpdatingLists.current) {
      // left edge, avoid upating lists at the sametime
      isTransitioning.current = true

      // add a null chunk and update items
      plotDataList.current = [null, ...plotDataList.current]
      plotLayoutList.current = [null, ...plotLayoutList.current]

      seqList.current = [null, ...seqList.current]
      tooltipsList.current = [null, ...tooltipsList.current]
      annoList.current = [null, ...annoList.current]
      setItems((prev) => [prev[0] - 1, ...prev])
      plotbox.current.scrollTo(scrollOffset + plotBoxScrollWidth.current)
      extendFixedLists('left', strand)
      rightUpdateTriggerPoint.current += plotBoxScrollWidth.current // move the trigger point further down
      requestAnimationFrame(() => {
        // seqbox.current.scrollLeft = seqBoxAvailableScroll.current
        isTransitioning.current = false
      })
    } else if (scrollOffset > rightUpdateTriggerPoint.current) {
      //  right edge
      isTransitioning.current = true
      // add a null chunk at the end and update items
      plotDataList.current = [...plotDataList.current, null]
      plotLayoutList.current = [...plotLayoutList.current, null]

      seqList.current = [...seqList.current, null]
      tooltipsList.current = [...tooltipsList.current, null]
      annoList.current = [...annoList.current, null]
      setItems((prev) => [...prev, prev[items.length - 1] + 1])
      extendFixedLists('right', strand)
      rightUpdateTriggerPoint.current += plotBoxScrollWidth.current // move the trigger point further down

      requestAnimationFrame(() => {
        isTransitioning.current = false
      })
    }
  }, 100)

  const PlotRow = ({ index, style }) => {
    const num = items[index];
    if (plotDataList.current[index]) {
      // Memoize the plot so it doesn't rerender unnecessarily
      return useMemo(() =>
        <div style={{ ...style }} >
          <Plot
            data={plotDataList.current[index]}
            layout={plotLayoutList.current[index]}
            config={{
              scrollZoom: false, // Prevent pinch-to-zoom
              displayModeBar: false, // Hide extra toolbar
              responsive: true, // Ensure responsiveness
            }}
          />
        </div>
        , [num]);
    } else {
      return (<div style={{ ...style, width: plotBoxScrollWidth.current }} >Loading....{num}</div>)
    }
  }

  // expand towards the start coords by a chunk
  const extendFixedLists = async (direction, strand) => {
    isUpdatingLists.current = true
    let newStart, newEnd
    if ((direction === 'left' && strand === '+') || (direction === 'right' && strand === '-')) {
      // need data for smaller coords
      newEnd = plotStartCoord.current
      newStart = newEnd - boxSeqLen
      plotStartCoord.current = newStart // update start
    } else {
      newStart = plotEndCoord.current
      newEnd = newStart + boxSeqLen
      plotEndCoord.current = newEnd // update end
    }

    const { sequence, tooltips, annocolors, plotData, plotLayout } = await getSeqPlotAnno(newStart, newEnd, genome, chromosome, strand, isWorkerInited, infWorker, pendingInference, configs, plotHeight, plotBoxScrollWidth, plotBottomMargin)

    // prepend or append according to directions
    if (direction === 'left') {
      seqList.current[0] = sequence
      tooltipsList.current[0] = tooltips
      annoList.current[0] = annocolors
      plotDataList.current[0] = plotData
      plotLayoutList.current[0] = plotLayout
    } else {
      const lastIdx = plotDataList.current.length - 1
      seqList.current[lastIdx] = sequence
      tooltipsList.current[lastIdx] = tooltips
      annoList.current[lastIdx] = annocolors
      plotDataList.current[lastIdx] = plotData
      plotLayoutList.current[lastIdx] = plotLayout
    }

    requestAnimationFrame(() => {
      isUpdatingLists.current = false
    })

  }


  return (
    <div className='mx-2'>
      <h1 className="my-4 text-3xl font-extrabold text-gray-900 dark:text-white md:text-5xl lg:text-6xl"><span className="text-transparent bg-clip-text bg-gradient-to-r to-emerald-600 from-sky-400">Sequence browser</span> demo</h1>

      <GenomeForm {...genomeFormVars} />
      <div className='flex-grow py-2 overflow-x-hidden' ref={container}>
        {/* Sequence box */}
        <div className='relative'>
          <div
            className="sequence-box bg-white border-[2px] border-dashed border-green-500 overflow-x-auto font-mono whitespace-nowrap"
            ref={seqbox}
          >
            {/* Vertical center line in sequence box */}
            <div className={`absolute top-0 bottom-0 w-[2px] bg-gray-500 left-[50%]`} style={{ transform: "translateX(-50%)" }} />
            {isFirstChunkInited ?
              seq.split("").map((char, index) => (
                <Tippy content={tooltips[index]} key={index}>
                  <span style={{
                    backgroundColor: annoColors[index],
                    display: 'inline-block',
                    width: seqBoxPxPerBase,
                  }}>
                    {char}
                  </span>
                </Tippy>
              ))
              : "Loading...."}
          </div>
        </div>

        {/* ruler */}
        <div className='relative h-10 border-b-1'>
          {/* coordinates */}
          <div className="absolute pt-1 top-2 left-1/2 text-xs text-sky-700"
            style={{ left: "0%", transform: "translateX(0%)" }}
          > {Math.floor(coords[0])} </div>

          <div className="absolute pt-1 top-2 left-1/2 text-xs text-sky-700"
            style={{ left: "50%", transform: "translateX(-50%)" }}
          > {Math.floor(coords[1])} </div>
          <div className="absolute pt-1 top-2 left-1/2 text-xs text-sky-700"
            style={{ left: "100%", transform: "translateX(-100%)" }}
          > {Math.floor(coords[2])} </div>

          {/* ticks */}
          <div className="absolute top-7 bottom-0 w-[3px] bg-gray-500"
            style={{ left: "0%", transform: "translateX(0%)" }}
          ></div>
          {[25, 50, 75].map((pos, index) => (
            <div key={index} className="absolute top-7 bottom-0 w-[3px] bg-gray-500"
              style={{ left: `${pos}%`, transform: "translateX(-50%)" }}
            ></div>
          ))}
          <div className="absolute top-7 bottom-0 w-[3px] bg-gray-500"
            style={{ left: "100%", transform: "translateX(-100%)" }}
          ></div>
        </div>

        {/* Plot box */}

        {isFirstChunkInited ?
          <div className='mt-2'>
            {/* Plot title */}
            {<div className="w-full h-4 mb-4 text-xl flex items-center justify-center">{configs.current.title}</div>}

            <div className={`relative`} style={{ height: plotHeight + plotBottomMargin }}>

              {/* title for each subplot */}
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
              <div className={`absolute top-0 bottom-0 w-[2px] bg-gray-500 left-[50%] z-10`} style={{ transform: "translateX(-50%)" }} />

              {isFirstChunkInited &&
                <div className="plot-box top-0 left-0 w-full overflow-x-auto border-x">
                  <List
                    layout="horizontal"
                    ref={plotbox}
                    height={plotHeight + plotBottomMargin}
                    itemCount={items.length}
                    itemSize={plotBoxScrollWidth.current}
                    width={boxWindowWidth.current}
                    onScroll={handlePlotBoxScroll}
                  >
                    {PlotRow}
                  </List>
                </div>
              }

            </div>
          </div>
          : 'Loading...'
        }

      </div>
    </div>
  )
}

// init function: load config file
const loadConfigFile = async (configFile, configs, setIsConfigsLoaded) => {
  setIsConfigsLoaded(false)
  try {
    const response = await fetch(configFile)
    const data = await response.json()
    configs.current = data

    // set up anno parameters
    const motifs = []
    const motifColors = []
    for (const entry of data.motifNameColorDict) {
      const [name] = Object.keys(entry)
      const [color] = Object.values(entry)
      motifs.push(name)
      motifColors.push(color)
    }
    const hslColors = motifColors.map(hex => hexToHsl(hex))

    configs.current.yDataKeys = data.traces.map(item => item.result_key)
    configs.current.motifNames = motifs
    configs.current.motifColorsHSL = hslColors
    setIsConfigsLoaded(true)
  } catch (error) {
    setIsConfigsLoaded(false)
    console.error('Error loading configuration and initing model', error)
  }
}

// Helper function: Convert Hex to RGB
const hexToRgb = hex => {
  const bigint = parseInt(hex.slice(1), 16);
  const r = (bigint >> 16) & 255;
  const g = (bigint >> 8) & 255;
  const b = bigint & 255;
  return [r, g, b];
};

// Helper: Convert Hex to HSL
const hexToHsl = (hex) => {
  const rgb = hexToRgb(hex); // Convert hex to RGB
  const [r, g, b] = rgb.map(v => v / 255); // Normalize to [0, 1]

  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const delta = max - min;

  // Calculate Hue
  let h = 0;
  if (delta !== 0) {
    if (max === r) {
      h = ((g - b) / delta) % 6;
    } else if (max === g) {
      h = (b - r) / delta + 2;
    } else {
      h = (r - g) / delta + 4;
    }
    h = Math.round(h * 60);
    if (h < 0) h += 360;
  }

  // Calculate Lightness
  const l = (max + min) / 2;

  // Calculate Saturation
  const s = delta === 0 ? 0 : delta / (1 - Math.abs(2 * l - 1));

  return [h, s * 100, l * 100]; // HSL in [0-360, 0-100, 0-100] range
};

// Helper: Convert HSL to CSS String
const hslToCss = (h, s, l) => `hsl(${h}, ${s}%, ${l}%)`;

const workerInference = (start, end, genome, chromosome, strand, isWorkerInited, infWorker, pendingInference, configs) => {

  if (!isWorkerInited) {
    return Promise.reject("Inference infWorker not ready");
  }

  return new Promise((resolve, reject) => {
    const requestId = crypto.randomUUID(); // Unique ID for this request
    // Store resolve function so it can be called when inference is done
    pendingInference.current.set(requestId, resolve);

    // Send message to infWorker with requestId
    infWorker.current.postMessage({
      type: "runInference",
      data: { start, end, genome, chromosome, strand, configs },
      requestId
    });

  });
};

const initWorker = (infWorker, pendingInference, setIsWorkerInited, configs) => {
  infWorker.current = new inferenceWorker()

  infWorker.current.onmessage = (e) => {
    const { type, sequence, results, tooltips, annocolors, error, requestId } = e.data

    if (type === "init_done") {
      setIsWorkerInited(true)
      console.log('inference infWorker initiated.')
    } else if (type === "inference_done") {
      if (pendingInference.current.has(requestId)) {
        pendingInference.current.get(requestId)({ sequence, results, tooltips, annocolors })
        pendingInference.current.delete(requestId)
      } else {
        console.warn("Received unknown requestId:", requestId)
      }
    } else if (type === "error") {
      console.log('infWorker error:', error)
    }
  }

  // load model in infWorker
  infWorker.current.postMessage({ type: "init", data: { modelPath: configs.current.modelPath, annoModelPath: configs.current.annoModelPath } })

  return () => { infWorker.current.terminate() }
}

const range = (start, stop, step = 1) =>
  Array.from(
    { length: Math.ceil((stop - start) / step) },
    (_, i) => start + i * step,
  );

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

// get all data corresponding to a chunk of sequence
const getSeqPlotAnno = async (start, end, genome, chromosome, strand, isWorkerInited, infWorker, pendingInference, configs, plotHeight, plotBoxScrollWidth, plotBottomMargin) => {

  // infWorker fetch sequence and run inference, note that inf result is shorter than sequence input
  const { sequence, results, tooltips, annocolors } = await workerInference(start, end, genome, chromosome, strand, isWorkerInited, infWorker, pendingInference, configs)

  // set plotly traces from inference results
  const plotMat = configs.current.yDataKeys.map(key => Array.from(results[key].cpuData)) // plotMatrix
  const plotData = getPlotData(plotMat, start, end, strand, configs)

  const xaxisLayout = { tickformat: 'd', autorange: strand === '-' ? 'reversed' : true, }
  const totalPlots = configs.current.grid.rows * configs.current.grid.columns;
  const axisLayout = {};
  for (let i = 0; i < totalPlots; i++) {
    axisLayout[`xaxis${i + 1}`] = xaxisLayout;
  }

  const plotLayout = {
    ...axisLayout,
    height: plotHeight,
    grid: configs.current.grid,
    width: plotBoxScrollWidth.current,
    template: 'plotly_white',
    margin: { l: 0, r: 0, t: 0, b: plotBottomMargin },
    showlegend: false,
    dragmode: false, // Disable zoom
  }

  return { sequence, tooltips, annocolors, plotData, plotLayout }

}

export default App