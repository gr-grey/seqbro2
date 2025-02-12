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
import { useSearchParams } from 'react-router-dom';

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

  // onnx sessions for inference and annotation calculation
  const configs = useRef(null)
  const inferenceSession = useRef(null)
  const annoSession = useRef(null)

  // generating plots
  const yDataKeys = useRef(null)

  // plot box
  const plotbox1 = useRef(null)
  const [plotData, setPlotData] = useState(null)
  const [plotLayout, setPlotLayout] = useState(null)

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
    initSequence(genome, chromosome, centerCoordinate, strand, boxSeqHalfLen, boxSeqLen, boxStartCoord, boxEndCoord, setBox1Seq, setIsSeqInited, seqbox1)
  }, [genome, chromosome, centerCoordinate, strand])

  // load plot once sequence and inference sessions are ready
  useEffect(() => {
    if (isSeqInited && isOnnxSessionLoaded) {
      initPlot(setIsPlotInited, configs, inferenceSession, annoSession, boxStartCoord, boxEndCoord, genome, chromosome, strand, setTooltips, setAnnoColors, setPlotData, setPlotLayout, boxSeqLen, plotbox1, yDataKeys)
    }
  }, [isSeqInited, isOnnxSessionLoaded])

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

          {/* Plot box */}
          {plotData ?
            <div className='mt-2'>
              {/* Plot title */}
              {<div className="w-full h-4 mb-4 text-xl flex items-center justify-center">{configs.current.title}</div>}

              <div className='relative' style={{ height: `${515}px` }}>

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

                <div
                  className="plot-box overflow-x-auto"
                  ref={plotbox1}

                >
                  {/* Vertical center line in plot box */}
                  <div className="absolute top-0 bottom-0 w-[2px] bg-gray-500 left-[50%] z-10" />

                  <Plot
                    data={plotData}
                    layout={plotLayout}
                    config={{ responsive: false }}
                  />
                </div>
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
const initSequence = async (genome, chromosome, centerCoordinate, strand, boxSeqHalfLen, boxSeqLen, boxStartCoord, boxEndCoord, setBox1Seq, setIsSeqInited, seqbox1) => {
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

const getPlotData = (plotDataMatrix, startCoord, endCoord, strand, plotConfig) => {
  const [start, end] = [startCoord.current, endCoord.current]
  // Generate x values based on strand direction
  const xs = strand === '+' ? range(start, end) : range(end, start, -1) // Reverse coordinates for '-' strand

  // Loop through the trace configuration list with indexes
  const plotTraces = plotConfig.traces.map((traceConfig, index) => {
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

const initPlot = async (setIsPlotInited, configs, inferenceSession, annoSession, boxStartCoord, boxEndCoord, genome, chromosome, strand, setTooltips, setAnnoColors, setPlotData, setPlotLayout, boxSeqLen, plotbox1, yDataKeys) => {
  setIsPlotInited(false)

  const convOffset = configs.current.convOffset
  const seq = await fetchSequence(boxStartCoord.current - convOffset, boxEndCoord.current + convOffset, genome, chromosome, strand) // fetch sequence because need longer than seqbox
  const outputs = await runInference(seq, inferenceSession)

  // inference parameters
  const scaledThreshold = configs.current.scaledThreshold
  const motifNames = []
  const motifColors = []
  for (const entry of configs.current.motifNameColorDict) {
    const [name] = Object.keys(entry)
    const [color] = Object.values(entry)
    motifNames.push(name); motifColors.push(color)
  }
  const colorHslArr = motifColors.map(hex => hexToHsl(hex))

  const [tooltips, annoColors] = await runAnnoProcessing(configs, outputs, annoSession, boxStartCoord, boxEndCoord, strand, colorHslArr, scaledThreshold, motifNames)
  setTooltips(tooltips)
  setAnnoColors(annoColors)

  // get plot data
  const plotYKeys = configs.current.traces.map(item => item.result_key)
  if (outputs) {
    // plot matrix
    const plotMat = plotYKeys.map(key => Array.from(outputs[key].data))
    const plotData = getPlotData(plotMat, boxStartCoord, boxEndCoord, strand, configs.current)
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
      width: boxSeqLen * 1.5,
      template: 'plotly_white',
      margin: { l: 0, r: 0, t: 0, b: 15 },
      showlegend: false,
    });
  }

  // scroll plot to half way point, double RAF was not stable, so use timeout instead
  setTimeout(() => {
    const availableScroll = plotbox1.current.scrollWidth - plotbox1.current.clientWidth
    plotbox1.current.scrollLeft = 0.5 * availableScroll
    yDataKeys.current = plotYKeys
  }, 10);
}

export default App;