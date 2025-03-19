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
  const boxStartCoord = useRef(null)
  const boxEndCoord = useRef(null)

  // sequence box
  const seqbox = useRef(null)
  const [seq, setSeq] = useState(null)
  // default tooltips: coords
  const [tooltips, setTooltips] = useState(strand === '+' ? range(centerCoordinate - boxSeqHalfLen, centerCoordinate + boxSeqHalfLen) : range(centerCoordinate + boxSeqHalfLen, centerCoordinate - boxSeqHalfLen, -1))
  // default color: white
  const [annoColors, setAnnoColors] = useState(['white'] * boxSeqLen)

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
  const seqboxCharWidth = 10
  const seqBoxScrollWidth = useRef(seqboxCharWidth * boxSeqLen)
  const plotBoxScrollWidth = useRef(null)

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
      const boxWidth = seqbox.current.clientWidth
      boxWindowWidth.current = boxWidth
      const plotPxPerBP = Math.max(Math.ceil(boxWidth / 500), 3) * 0.5
      const plotScrollWidth = plotPxPerBP * boxSeqLen
      plotBoxScrollWidth.current = plotScrollWidth
      plotBoxAvailableScroll.current = plotScrollWidth - boxWidth
      seqBoxAvailableScroll.current = seqBoxScrollWidth.current - boxWidth

      // right trigger point
      rightUpdateTriggerPoint.current = (initPlotNum - 2) * plotScrollWidth + plotBoxAvailableScroll.current // when reach the last part of the second but last plot
    }
  }, [isConfigsLoad])

  // init sequence, inference, and set plot
  const initPlot = async () => {
    setIsFirstChunkInited(false)
    plotDataList.current = new Array(initPlotNum).fill(null)
    plotLayoutList.current = new Array(initPlotNum).fill(null)
    isInitedScrolled.current = false

    const start = centerCoordinate - boxSeqHalfLen
    const end = centerCoordinate + boxSeqHalfLen
    boxStartCoord.current = start
    boxEndCoord.current = end
    const { sequence, tooltips, annocolors, plotData, plotLayout } = await getSeqPlotAnno(start, end, genome, chromosome, strand, isWorkerInited, infWorker, pendingInference, configs, plotHeight, plotBoxScrollWidth, plotBottomMargin)

    setSeq(sequence)
    setTooltips(tooltips)
    setAnnoColors(annocolors)
    plotDataList.current[initMiddleIdx] = plotData
    plotLayoutList.current[initMiddleIdx] = plotLayout
    setItems(range(0, initPlotNum))
    setIsFirstChunkInited(true)
    
    // scroll things to middle
    setTimeout(() => {
      seqbox.current.scrollLeft = seqBoxAvailableScroll.current * 0.5
      plotbox.current.scrollToItem(initMiddleIdx, 'center')
      isInitedScrolled.current = true
    }, 10)
  }
  // get sequence
  useEffect(() => {
    if (isWorkerInited) {
      initPlot()

    }

  }, [isWorkerInited, genome, chromosome, centerCoordinate, strand])


  const initSideChunks = async () => {
    await extendFixedLists('left', strand)
    await extendFixedLists('right', strand)
  }
  // load the other two chunks once the middle chunk is loaded
  useEffect(() => {
    if (isFirstChunkInited) { initSideChunks() }
  }, [isFirstChunkInited])

  const handlePlotBoxScroll = throttle(({ scrollOffset }) => {
    if (isTransitioning.current || !isInitedScrolled.current) return;

    if (scrollOffset < plotBoxScrollWidth.current && !isUpdatingLists.current) {
      // left edge, avoid upating lists at the sametime
      isTransitioning.current = true
      // add a null chunk and update items
      plotDataList.current = [null, ...plotDataList.current]
      plotLayoutList.current = [null, ...plotLayoutList.current]
      setItems((prev) => [prev[0] - 1, ...prev])
      plotbox.current.scrollTo(scrollOffset + plotBoxScrollWidth.current)
      extendFixedLists('left', strand)

      requestAnimationFrame(() => {
        isTransitioning.current = false
      })
    } else if (scrollOffset > rightUpdateTriggerPoint.current) {
      //  right edge
      isTransitioning.current = true
      // add a null chunk at the end and update items
      plotDataList.current = [...plotDataList.current, null]
      plotLayoutList.current = [...plotLayoutList.current, null]
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
      newEnd = boxStartCoord.current
      newStart = newEnd - boxSeqLen
      boxStartCoord.current = newStart // update start
    } else {
      newStart = boxEndCoord.current
      newEnd = newStart + boxSeqLen
      boxEndCoord.current = newEnd // update end
    }

    const { sequence, tooltips, annocolors, plotData, plotLayout } = await getSeqPlotAnno(newStart, newEnd, genome, chromosome, strand, isWorkerInited, infWorker, pendingInference, configs, plotHeight, plotBoxScrollWidth, plotBottomMargin)

    // prepend or append according to directions
    if (direction === 'left') {
      plotDataList.current[0] = plotData
      plotLayoutList.current[0] = plotLayout
    } else {
      const lastIdx = plotDataList.current.length - 1
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
      <div className='flex-grow py-2 overflow-x-hidden'>
        {/* Sequence box */}
        <div className='relative'>
          <div
            className="sequence-box bg-white border-[2px] border-dashed border-green-500 overflow-x-auto font-mono whitespace-nowrap"
            ref={seqbox}
          >
            {/* Vertical center line in sequence box */}
            <div className={`absolute top-0 bottom-0 w-[2px] bg-gray-500 left-[50%]`} />
            {seq ?
              seq.split("").map((char, index) => (
                <Tippy content={tooltips[index]} key={index}>
                  <span style={{
                    backgroundColor: annoColors[index],
                    display: 'inline-block',
                    width: seqboxCharWidth,
                  }}>
                    {char}
                  </span>
                </Tippy>
              ))
              : "Loading...."}
          </div>
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
              <div className={`absolute top-0 bottom-0 w-[2px] bg-gray-500 left-[49.95%] z-10`} />

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