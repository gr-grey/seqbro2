import { useEffect, useState, useRef, useCallback } from 'react';
import './App.css';
import Tippy from '@tippyjs/react';
import 'tippy.js/dist/tippy.css';
import DebugPanel from './DebugPanel';
import NavBar from './NavBar';
import GenomeForm from './GenomeForm';
import DallianceViewer from './DallianceViewer';
import Plot from 'react-plotly.js';
// import useDebounce from './useDebounce';
import { range, hexToHsl, hslToCss, } from './utils';
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
  const boxSeqHalfLen = 1000
  const boxSeqLen = 2 * boxSeqHalfLen
  const boxStartCoord = useRef(null)
  const boxEndCoord = useRef(null)

  // box and plot share the same coordinate system.
  // Sequence box UI
  const seqbox = useRef(null)
  const [boxSeq, setBoxSeq] = useState(null)
  // default tooltips: coords
  const [tooltips, setTooltips] = useState(strand === '+' ? range(centerCoordinate - boxSeqHalfLen, centerCoordinate + boxSeqHalfLen) : range(centerCoordinate + boxSeqHalfLen, centerCoordinate - boxSeqHalfLen, -1))
  // default color: white
  const [annoColors, setAnnoColors] = useState(['white'] * boxSeqLen)

  // track loading and intitiation processes
  const [isConfigsLoad, setIsConfigsLoaded] = useState(false)
  const [isOnnxSessionLoaded, setIsOnnxSessionLoaded] = useState(false)
  const [isFirstChunkInited, setIsFirstChunkInited] = useState(false)

  // onnx sessions for inference and annotation calculation
  const configs = useRef(null) // yDataKeys, motifNames, motifHslColors are added to configs

  // plot box
  const plotbox = useRef(null)
  const [plotData, setPlotData] = useState(null)
  const [plotLayout, setPlotLayout] = useState(null)
  const plotHeight = 515

  // tracking sizes
  const boxWindowWidth = useRef(null) // width for both sequence and plot box
  const seqboxCharWidth = 10
  const seqBoxScrollWidth = useRef(seqboxCharWidth * boxSeqLen)
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
  const leftSwappingTriggerPoint = useRef(null)
  const rightSwappingTriggerPoint = useRef(null)

  // wether changing visibility
  const isTransitioning = useRef(false)
  const isUpdatingBuffers = useRef(false)

  ////////////////////// inference with worker
  const infWorker = useRef(null)
  const pendingInference = useRef(new Map())

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
    loadConfigFile('/puffin.config.json', configs, setIsConfigsLoaded, setIsOnnxSessionLoaded)
  }, []);

  useEffect(() => {
    if (isConfigsLoad) {
      initWorker(infWorker, '/inferenceWorker.js', setIsOnnxSessionLoaded, configs, pendingInference)
    }
    // when configs are loaded, the boxes should be loaded too, update widths
    const boxWidth = seqbox.current.clientWidth
    boxWindowWidth.current = boxWidth
    const plotPxPerBP = Math.max(Math.ceil(boxWidth / 500), 3) * 0.5
    plotBoxScrollWidth.current = plotPxPerBP * boxSeqLen
    plotBoxAvailableScroll.current = plotPxPerBP * boxSeqLen - boxWidth
    seqBoxAvailableScroll.current = seqBoxScrollWidth.current - boxWidth
  }, [isConfigsLoad])


  // init sequence, inference, and set plot
  const initSeqPlot = async () => {
    setPlotData(null)
    const { sequence, tooltips, annocolors, plotData, plotLayout } = await getSeqPlotAnno(centerCoordinate, boxSeqHalfLen, genome, chromosome, strand, isOnnxSessionLoaded, infWorker, pendingInference, configs, plotHeight, plotBoxScrollWidth)

    setBoxSeq(sequence)
    setTooltips(tooltips)
    setAnnoColors(annocolors)
    setPlotData(plotData)
    setPlotLayout(plotLayout)
    
    // scroll things to middle
    setTimeout(() => {
      seqbox.current.scrollLeft = seqBoxAvailableScroll.current / 2
      plotbox.current.scrollLeft = plotBoxAvailableScroll.current / 2
    }, 10)
  }

  useEffect(() => {
    if (isOnnxSessionLoaded) { initSeqPlot() }
  }, [genome, chromosome, centerCoordinate, strand, isOnnxSessionLoaded])

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
              ref={seqbox}
            >
              {/* Vertical center line in sequence box */}
              <div className="absolute top-0 bottom-0 w-[2px] bg-gray-500 left-[50%]" />
              {/* {boxSeq} */}
              {boxSeq ?
                boxSeq.split("").map((char, index) => (
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

          {plotData ?
            <div className='mt-2'>
              {/* Plot title */}
              {<div className="w-full h-4 mb-4 text-xl flex items-center justify-center">{configs.current.title}</div>}

              <div className={`relative`} style={{ height: plotHeight }}>

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
                <div className="absolute top-0 bottom-0 w-[2px] bg-gray-500 left-[50%] z-10" />

                {plotData &&
                  <div
                    className="plot-box-1 absolute top-0 left-0 w-full overflow-x-auto border"
                    // style={{ zIndex: plot1Z }}
                    ref={plotbox}
                  // onScroll={handlePlotBoxScroll}
                  >

                    <Plot
                      data={plotData}
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
const loadConfigFile = async (configFile, configs, setIsConfigsLoaded, setIsOnnxSessionLoaded) => {
  setIsConfigsLoaded(false)
  setIsOnnxSessionLoaded(false)
  try {
    const response = await fetch(configFile)
    const data = await response.json()
    configs.current = data;

    // set up anno parameters
    const motifs = []
    const motifColors = []
    for (const entry of data.motifNameColorDict) {
      const [name] = Object.keys(entry)
      const [color] = Object.values(entry)
      motifs.push(name)
      motifColors.push(color)
    }
    const colorHslArr = motifColors.map(hex => hexToHsl(hex))

    configs.current.yDataKeys = data.traces.map(item => item.result_key)
    configs.current.motifNames = motifs
    configs.current.motifHslColors = colorHslArr
    setIsConfigsLoaded(true)
  } catch (error) {
    setIsConfigsLoaded(false)
    console.error('Error loading configuration and initing model', error)
  }
};

const initWorker = (infWorker, workerPath, setIsOnnxSessionLoaded, configs, pendingInference) => {
  infWorker.current = new Worker(workerPath);

  infWorker.current.onmessage = (e) => {
    const { type, sequence, results, tooltips, annocolors, error, requestId } = e.data

    if (type === "init_done") {
      setIsOnnxSessionLoaded(true)
      console.log('inference worker initiated.')
    } else if (type === "inference_done") {
      if (pendingInference.current.has(requestId)) {
        pendingInference.current.get(requestId)({ sequence, results, tooltips, annocolors });
        pendingInference.current.delete(requestId);
      } else {
        console.warn("Received unknown requestId:", requestId);
      }
    } else if (type === "error") {
      console.log('worker error:', error)
    }
  }

  // load model in worker
  infWorker.current.postMessage({ type: "init", data: { modelPath: configs.current.modelPath, annoModelPath: configs.current.annoModelPath } })

  return () => { infWorker.current.terminate() }
}

const workerInference = (start, end, genome, chromosome, strand, isOnnxSessionLoaded, infWorker, pendingInference, configs) => {

  if (!isOnnxSessionLoaded) {
    return Promise.reject("Inference worker not ready");
  }

  return new Promise((resolve, reject) => {
    const requestId = crypto.randomUUID(); // Unique ID for this request
    // Store resolve function so it can be called when inference is done
    pendingInference.current.set(requestId, resolve);

    // Send message to worker with requestId
    infWorker.current.postMessage({
      type: "runInference",
      data: { start, end, genome, chromosome, strand, configs },
      requestId
    });

  });
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

// get all data corresponding to a chunk of sequence
const getSeqPlotAnno = async (centerCoordinate, boxSeqHalfLen, genome, chromosome, strand, isOnnxSessionLoaded, infWorker, pendingInference, configs, plotHeight, plotBoxScrollWidth) => {
  const start = centerCoordinate - boxSeqHalfLen
  const end = centerCoordinate + boxSeqHalfLen

  // worker fetch sequence and run inference, note that inf result is shorter than sequence input
  const { sequence, results, tooltips, annocolors } = await workerInference(start, end, genome, chromosome, strand, isOnnxSessionLoaded, infWorker, pendingInference, configs)

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
    margin: { l: 0, r: 0, t: 0, b: 15 },
    showlegend: false,
  }

  return { sequence, tooltips, annocolors, plotData, plotLayout }

}

export default App;