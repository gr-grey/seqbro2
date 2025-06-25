import { useEffect, useState, useRef, useCallback, useMemo } from 'react'
import './App.css'
import { useSearchParams, Outlet, Link } from 'react-router-dom'
import inferenceWorker from "./inferenceWorker?worker"
import { FixedSizeList as List } from 'react-window'
import GenomeForm from './GenomeForm'
import Tippy from '@tippyjs/react';
import 'tippy.js/dist/tippy.css';
import Plot from 'react-plotly.js';
// import GeneSearch from './GeneSearch'

function App() {

  // State initialization from URL parameters
  const [searchParams, setSearchParams] = useSearchParams()

  // default genome location
  const defaultGenome = "hg38";
  const defaultChromosome = "chr7";
  const defaultModel = "puffin";
  const defaultCenterCoordinate = 5530600;
  const defaultStrand = "-";

  const [genome, setGenome] = useState(() => searchParams.get('g') || defaultGenome);
  const [chromosome, setChromosome] = useState(() => searchParams.get('c') || defaultChromosome);
  const [model, setModel] = useState(() => searchParams.get('m') || defaultModel);
  const [centerCoordinate, setCenterCoordinate] = useState(() => {
    const pos = searchParams.get('pos');
    return pos ? Math.max(1, parseInt(pos)) : defaultCenterCoordinate;
  });
  const [strand, setStrand] = useState(() => {
    const s = searchParams.get('s');
    return ['+', '-'].includes(s) ? s : defaultStrand;
  });

  const [gene, setGene] = useState(searchParams.get('gene') || 'ACTB')

  const genomeFormVars = { genome, setGenome, chromosome, setChromosome, centerCoordinate, setCenterCoordinate, strand, setStrand, gene, setGene }

  const boxSeqHalfLen = 1500
  const boxSeqLen = boxSeqHalfLen * 2
  const allStartCoord = useRef(null)
  const allEndCoord = useRef(null)

  // coords within the 3 chunk sequence window
  // const seqStartCoord = useRef(null)
  // const seqEndCoord = useRef(null)

  const container = useRef(null) // common container for both seq and plot
  // sequence box
  const seqbox = useRef(null)
  const [seq, setSeq] = useState(null)

  const seqList = useRef(null)
  const tooltipsList = useRef(null)
  const annoList = useRef(null)

  // default tooltips: coords
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
  const [items, setItems] = useState([0]) // one item at init
  const initMiddleIdx = Math.floor(initPlotNum / 2)

  const plotDataList = useRef(null)
  const plotLayoutList = useRef(null)

  // tracking sizes
  const boxWindowWidth = useRef(null) // width for both sequence and plot box
  const seqBoxPxPerBase = useRef(null)
  const plotBoxPxPerBase = useRef(null) // pixel per character/ base, 1.5, 2, and so on
  const seqBoxScrollWidth = useRef(null) // left, mid, right, 3 chunks only
  const plotBoxScrollWidth = useRef(null)
  const seqBoxViewHalfLen = useRef(null)
  const plotBoxViewHalfLen = useRef(null)

  const boxCenterChunkId = useRef(initMiddleIdx)

  // scrollWidth - clientWidth
  const seqBoxAvailableScroll = useRef(null)
  const plotBoxAvailableScroll = useRef(null)

  // track scrolling
  const isInitedScrolled = useRef(false)
  const isTransitioning = useRef(false)
  const isUpdatingLists = useRef(false)

  const scrollBox = useRef('plotBox')

  const seqBoxBorderHalf = useRef(0)

  // set scrollingBox based on where the mouse is
  const handleMouseEnterSeqBox = () => { scrollBox.current = 'seqBox' }
  const handleMouseLeaveSeqBox = () => { scrollBox.current = 'plotBox' }

  // coordinates
  const seqCoordsList = useRef([])
  const [seqCoords, setSeqCoords] = useState([])
  const coordResolution = 50

  // both seq and plot fixed at 3 chunks
  const leftTriggerPoint = useRef(null) // at the end of first chunk
  const rightTriggerPoint = useRef(null) // at the end of second chunk

  const plotBoxScrollLeft = useRef(null)
  const seqBoxScrollLeft = useRef(null) // track to use in edit box

  // const [showEachMotif, setShowEachMotif] = useState(false)
  const [isEditMode, setIsEditMode] = useState(false)
  // const paddingSeqs = useRef(null)

  // URL update effect
  useEffect(() => {
    // It's crucial to compare with the *current* searchParams from the hook,
    // which React Router updates after navigation.
    // However, if the page is loaded with no params, this might not trigger the initial set.
    // Let's refine this to only update if the current state *does not match* the URL.

    const currentUrlParams = new URLSearchParams(window.location.search);
    const paramsFromState = new URLSearchParams({
      g: genome,
      c: chromosome,
      pos: centerCoordinate.toString(),
      s: strand,
      m: model
    });

    // Check if the URL params derived from state are different from the actual URL params
    if (paramsFromState.toString() !== currentUrlParams.toString()) {
      setSearchParams(paramsFromState, { replace: true });
    }

  }, [genome, chromosome, centerCoordinate, strand, model, setSearchParams]); // searchParams is no longer a direct dependency here

  // Function to reset all state to default values
  const resetToDefault = useCallback(() => {
    setGenome(defaultGenome);
    setChromosome(defaultChromosome);
    setModel(defaultModel);
    setCenterCoordinate(defaultCenterCoordinate);
    setStrand(defaultStrand);

    // Explicitly set the URL params to the default as well
    const defaultParams = new URLSearchParams({
      g: defaultGenome,
      c: defaultChromosome,
      pos: defaultCenterCoordinate.toString(),
      s: defaultStrand,
      m: defaultModel
    });
    setSearchParams(defaultParams, { replace: true });

  }, [setSearchParams]); // setSearchParams is stable, so useCallback is fine
  // load configs
  useEffect(() => {
    loadConfigFile(`/${model}.config.json`, configs, setIsConfigsLoaded)
  }, [model])

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
      plotBoxAvailableScroll.current = plotScrollWidth * initPlotNum - boxWidth
      // seqBoxAvailableScroll.current = seqBoxScrollWidth.current * initPlotNum - boxWidth
      plotBoxPxPerBase.current = plotPxPerBP

      plotBoxViewHalfLen.current = boxWidth / plotPxPerBP / 2

      // trigger points are based on plot scroll position, as seq box is way wider than plot
      leftTriggerPoint.current = plotScrollWidth - boxWidth
      rightTriggerPoint.current = plotScrollWidth * 2

    }
  }, [isConfigsLoad])

  // init sequence, inference, and set plot
  const initPlot = async (updateWidths = false) => {
    setIsFirstChunkInited(false)
    isInitedScrolled.current = false

    const start = centerCoordinate - boxSeqHalfLen
    const end = centerCoordinate + boxSeqHalfLen
    allStartCoord.current = start
    allEndCoord.current = end

    // clear state variables
    submitSeq.current = null
    setSeq(null)
    setTooltips(null)
    setAnnoColors(null)
    setSeqCoords(null)
    setItems([0])

    const { sequence, tooltips, annocolors, plotData, plotLayout } = await getSeqPlotAnno(start, end, genome, chromosome, strand, isWorkerInited, infWorker, pendingInference, configs, plotHeight, plotBoxScrollWidth, plotBottomMargin, false, '')

    seqList.current = [sequence]
    tooltipsList.current = [tooltips]
    annoList.current = [annocolors]

    plotDataList.current = [plotData]
    plotLayoutList.current = [plotLayout]

    const coordinates = strand === '+' ?
      range(start, end, coordResolution) : range(start + coordResolution, end + coordResolution, coordResolution).reverse()

    seqCoordsList.current = [coordinates]

    requestAnimationFrame(() => {
      setIsFirstChunkInited(true)
      setSeq(sequence)
      setTooltips(tooltips)
      setAnnoColors(annocolors)
      setSeqCoords(coordinates)
    })

    isTransitioning.current = true
    // scroll things to middle
    setTimeout(() => {
      if (updateWidths) {
        const seqboxChunkScrollWidth = seqbox.current.scrollWidth
        seqBoxAvailableScroll.current = seqboxChunkScrollWidth * initPlotNum - boxWindowWidth.current
        seqbox.current.scrollLeft = Math.round((seqboxChunkScrollWidth - boxWindowWidth.current) * 0.5)
        plotbox.current.scrollTo(Math.round((plotBoxScrollWidth.current - boxWindowWidth.current) * 0.5))

        // update other params
        const seqboxPxPerBase = seqboxChunkScrollWidth / boxSeqLen
        seqBoxViewHalfLen.current = boxWindowWidth.current / seqboxPxPerBase / 2
        seqBoxBorderHalf.current = plotBoxPxPerBase.current / seqboxPxPerBase * 50 // in percentage 100% / 2

        seqBoxScrollWidth.current = seqboxChunkScrollWidth
        seqBoxPxPerBase.current = seqboxPxPerBase
      } else {
        seqbox.current.scrollLeft = Math.round((seqBoxScrollWidth.current - boxWindowWidth.current) * 0.5)
        plotbox.current.scrollTo(Math.round((plotBoxScrollWidth.current - boxWindowWidth.current) * 0.5))
      }
      isTransitioning.current = false

    }, 10)
  }

  // get sequence
  useEffect(() => {
    if (isWorkerInited && !submitSeq.current) {
      if (!seqBoxScrollWidth.current) {
        initPlot(true)
      } else {
        initPlot()
      }
    }
  }, [isWorkerInited, genome, chromosome, centerCoordinate, strand])

  const initSideChunks = async () => {
    // start shifting chunks
    isTransitioning.current = true
    isInitedScrolled.current = false
    await updateLists('left', strand)
    await updateLists('right', strand)

    const centerChunk = Math.floor(initPlotNum / 2)
    setSeq([seqList.current[centerChunk - 1], seqList.current[centerChunk], seqList.current[centerChunk + 1]].join(""))
    setAnnoColors([annoList.current[centerChunk - 1], annoList.current[centerChunk], annoList.current[centerChunk + 1]].flat())
    setTooltips([tooltipsList.current[centerChunk - 1], tooltipsList.current[centerChunk], tooltipsList.current[centerChunk + 1]].flat())
    setItems([centerChunk - 1, centerChunk, centerChunk + 1])

    setSeqCoords([seqCoordsList.current[centerChunk - 1], seqCoordsList.current[centerChunk], seqCoordsList.current[centerChunk + 1]].flat())

    plotbox.current.scrollTo(plotBoxAvailableScroll.current / 2)
    seqBoxScrollLeft.current = seqBoxAvailableScroll.current / 2

    requestAnimationFrame(() => {
      seqbox.current.scrollLeft = seqBoxAvailableScroll.current / 2
      isInitedScrolled.current = true
      isTransitioning.current = false
    })
  }
  // load the other two chunks once the middle chunk is loaded
  useEffect(() => {
    if (isFirstChunkInited && !submitSeq.current) { // if it's submitted, don't init side chunks
      initSideChunks()
    }
  }, [isFirstChunkInited])

  const convertScrollLeft = (sourceScrollLeft, halfWindowWidth, targetToSourceRatio) => {
    return targetToSourceRatio * (sourceScrollLeft + halfWindowWidth) - halfWindowWidth
  }

  // get a new chunk and add to lists
  const updateLists = async (direction, strand) => {
    isUpdatingLists.current = true
    let newStart, newEnd
    if ((direction === 'left' && strand === '+') || (direction === 'right' && strand === '-')) {
      // need data for smaller coords
      newEnd = allStartCoord.current
      newStart = newEnd - boxSeqLen
      allStartCoord.current = newStart // update start
    } else {
      newStart = allEndCoord.current
      newEnd = newStart + boxSeqLen
      allEndCoord.current = newEnd // update end
    }

    const { sequence, tooltips, annocolors, plotData, plotLayout } =
      await getSeqPlotAnno(newStart, newEnd, genome, chromosome, strand, isWorkerInited, infWorker, pendingInference, configs, plotHeight, plotBoxScrollWidth, plotBottomMargin, false, '')

    const newCoords = strand === '+' ?
      range(newStart, newEnd, coordResolution) : range(newStart + coordResolution, newEnd + coordResolution, coordResolution).reverse()

    // prepend or append according to directions
    if (direction === 'left') {
      // prepend
      seqList.current.unshift(sequence)
      tooltipsList.current.unshift(tooltips)
      annoList.current.unshift(annocolors)
      plotDataList.current.unshift(plotData)
      plotLayoutList.current.unshift(plotLayout)
      seqCoordsList.current.unshift(newCoords)
    } else {
      seqList.current.push(sequence)
      tooltipsList.current.push(tooltips)
      annoList.current.push(annocolors)
      plotDataList.current.push(plotData)
      plotLayoutList.current.push(plotLayout)
      seqCoordsList.current.push(newCoords)
    }

    requestAnimationFrame(() => {
      isUpdatingLists.current = false
    })

  }

  // shift for both plot and seq
  const shiftChunks = (centerChunk, direction) => {
    setSeq([seqList.current[centerChunk - 1], seqList.current[centerChunk], seqList.current[centerChunk + 1]].join(""))
    setAnnoColors([annoList.current[centerChunk - 1], annoList.current[centerChunk], annoList.current[centerChunk + 1]].flat())
    setTooltips([tooltipsList.current[centerChunk - 1], tooltipsList.current[centerChunk], tooltipsList.current[centerChunk + 1]].flat())
    setItems([centerChunk - 1, centerChunk, centerChunk + 1])

    setSeqCoords([seqCoordsList.current[centerChunk - 1], seqCoordsList.current[centerChunk], seqCoordsList.current[centerChunk + 1]].flat())

    if (direction === 'left') {
      seqbox.current.scrollLeft += seqBoxScrollWidth.current
      plotbox.current.scrollTo(plotBoxScrollLeft.current + plotBoxScrollWidth.current)
    } else if (direction === 'right') { // right direction
      seqbox.current.scrollLeft -= seqBoxScrollWidth.current
      plotbox.current.scrollTo(plotBoxScrollLeft.current - plotBoxScrollWidth.current)
    }
  }

  const scrollUpdate = async (direction, strand, update) => {

    let centerId
    if (update) { await updateLists(direction, strand) }

    // start shifting chunks
    isTransitioning.current = true

    if (direction === 'left' && update) {
      centerId = boxCenterChunkId.current // this value should be 1
    } else if (direction === 'left') {
      centerId = boxCenterChunkId.current - 1 // left and not updating
    }
    else {
      centerId = boxCenterChunkId.current + 1 // always add one if direction is right
    }

    shiftChunks(centerId, direction)

    requestAnimationFrame(() => {
      isTransitioning.current = false
      boxCenterChunkId.current = centerId
    })
  }

  const handlePlotBoxScroll = ({ scrollOffset }) => {

    if (scrollBox.current === 'seqBox' || isTransitioning.current || !isInitedScrolled.current) return

    if (isEditMode) {
      if (!isEditing.current) {
        const seqScrollLeft = convertScrollLeft(scrollOffset, boxWindowWidth.current / 2, seqBoxPxPerBase.current / plotBoxPxPerBase.current)
        // padding seq of len offset
        const offset = configs.current.convOffset
        const adjustedSeqScrollLeft = seqScrollLeft + offset * seqBoxPxPerBase.current
        seqbox.current.scrollLeft = Math.round(adjustedSeqScrollLeft)
        seqBoxScrollLeft.current = Math.round(adjustedSeqScrollLeft)
      }
      plotBoxScrollLeft.current = scrollOffset
      return
    }
    plotBoxScrollLeft.current = scrollOffset

    const seqScrollLeft = convertScrollLeft(scrollOffset, boxWindowWidth.current / 2, seqBoxPxPerBase.current / plotBoxPxPerBase.current)

    seqbox.current.scrollLeft = seqScrollLeft
    seqBoxScrollLeft.current = Math.round(seqScrollLeft)

    if (scrollOffset < leftTriggerPoint.current && !isUpdatingLists.current) {
      if (boxCenterChunkId.current === 1) {
        scrollUpdate('left', strand, true)
      } else {
        scrollUpdate('left', strand, false)
      }
    } else if (scrollOffset > rightTriggerPoint.current && !isUpdatingLists.current) {
      if (boxCenterChunkId.current === seqList.current.length - 2) {
        scrollUpdate('right', strand, true)
      } else {
        scrollUpdate('right', strand, false)
      }
    }
  }

  const handleSeqBoxScroll = () => {
    if (scrollBox.current === 'plotBox' || isTransitioning.current || !isInitedScrolled.current) return

    if (isEditMode) {
      if (!isEditing.current) {
        const editSeqScrollLeft = seqbox.current.scrollLeft
        // padding seq of len offset
        const offset = configs.current.convOffset
        const adjustedScrollLeft = Math.max(editSeqScrollLeft - offset * seqBoxPxPerBase.current, 0)
        const plotScrollLeft = convertScrollLeft(adjustedScrollLeft, boxWindowWidth.current / 2, plotBoxPxPerBase.current / seqBoxPxPerBase.current)
        plotbox.current.scrollTo(Math.round(plotScrollLeft))
        plotBoxScrollLeft.current = Math.round(plotScrollLeft)
      }
      seqBoxScrollLeft.current = Math.round(seqbox.current.scrollLeft)
      return
    }

    // syncing scrolls
    const seqScrollLeft = seqbox.current.scrollLeft

    const plotScrollLeft = convertScrollLeft(seqScrollLeft, boxWindowWidth.current / 2, plotBoxPxPerBase.current / seqBoxPxPerBase.current)

    plotbox.current.scrollTo(Math.round(plotScrollLeft))
    seqBoxScrollLeft.current = Math.round(seqScrollLeft)

    // handling chunks updates
    if (plotScrollLeft < leftTriggerPoint.current && !isUpdatingLists.current) {
      if (boxCenterChunkId.current === 1) {
        scrollUpdate('left', strand, true)
      } else {
        scrollUpdate('left', strand, false)
      }
    } else if (plotScrollLeft > rightTriggerPoint.current && !isUpdatingLists.current) {
      if (boxCenterChunkId.current === seqList.current.length - 2) {
        scrollUpdate('right', strand, true)
      } else {
        scrollUpdate('right', strand, false)
      }
    }
  }

  const PlotChunk = ({ index, style }) => {
    const num = items[index];
    if (plotDataList.current[num]) {

      // Memoize the plot so it doesn't rerender unnecessarily
      return useMemo(() =>
        <div style={{ ...style }} >
          <Plot
            data={plotDataList.current[num]}
            layout={plotLayoutList.current[num]}
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

  const openEachMotif = () => {
    // opens a new tab at /each_motif?g=...&c=...
    const child = window.open(`/each_motif?${searchParams.toString()}`, '_blank')

    const payload = {
      seq: seqList.current[0],
      tooltip: tooltipsList.current[0],
      annotation: annoList.current[0],
    }
    // wait for child to say read for message sending
    const handleReady = (e) => {
      if (e.source === child && e.data === 'READY_FOR_DATA') {
        child.postMessage({ type: 'INIT_DATA', payload }, window.location.origin)
        window.removeEventListener('message', handleReady)
      }
    }
    window.addEventListener('message', handleReady)
  }

  const editBox = useRef(null)
  const [editSeq, setEditSeq] = useState('')

  const editAnno = useRef(null)
  const editTooltips = useRef(null)

  const submitSeq = useRef(null)
  // const seqMinLength = useRef(null)
  const [seqError, setSeqError] = useState(false)
  const seqWarnMessage = useRef('Invalid sequence')

  const editTimeout = useRef(null); // To track when scrolling stops
  function handleEditInput(e) {
    // pull out the *plain text* (no HTML) that the user just edited

    clearTimeout(editTimeout.current);

    editTimeout.current = setTimeout(() => {
      isEditing.current = true

      const txt = editBox.current.textContent || '';
      const valid = isValidDNA(txt, configs.current.convOffset * 2) // seq min length set to 0, don't need sequence length since there's padding now

      if (valid) {
        submitSeq.current = txt
        setSeqError(false)
      } else {
        setSeqError(true)
      }

    }, 200)

  }

  const [isEditInfRunning, setIsInfRunning] = useState(false)
  const isEditing = useRef(false)
  const loadEditMode = async () => {
    if (!isEditMode) {
      // clicked on edit button

      isEditing.current = true

      const editSeqHalfLen = 1000
      const editSeqLen = 2 * editSeqHalfLen

      seqBoxScrollWidth.current = editSeqLen * seqBoxPxPerBase.current

      // coordinate of the character at the middle of the screen
      const sliceMid = Math.round((seqBoxScrollLeft.current + boxWindowWidth.current / 2) / seqBoxPxPerBase.current)
      const fullSeq = [seqList.current[boxCenterChunkId.current - 1], seqList.current[boxCenterChunkId.current], seqList.current[boxCenterChunkId.current + 1]].join("").slice(sliceMid - editSeqHalfLen, sliceMid + editSeqHalfLen)

      const coordStart = strand === '+' ? allStartCoord.current + sliceMid - editSeqHalfLen : allStartCoord.current + boxSeqLen * initPlotNum - (sliceMid + editSeqHalfLen)

      const coordinates = strand === '+' ? range(coordStart, coordStart + editSeqLen, coordResolution) : range(coordStart + coordResolution, coordStart + editSeqLen + coordResolution, coordResolution).reverse()
      setSeqCoords(coordinates)

      setEditSeq(fullSeq)
      submitSeq.current = fullSeq

      editAnno.current = annoColors.slice(sliceMid - editSeqHalfLen, sliceMid + editSeqHalfLen)
      editTooltips.current = tooltips.slice(sliceMid - editSeqHalfLen, sliceMid + editSeqHalfLen)

      setIsEditMode(true)

      requestAnimationFrame(() => {
        // the center is middle point of sequence
        seqbox.current.scrollLeft = (seqBoxScrollWidth.current - boxWindowWidth.current) / 2
      })

    } else {
      // click on submit button
      if (!seqError) {
        // setIsEditMode(false)

        const scrollPosition = seqbox.current.scrollLeft
        const start = 0
        const end = submitSeq.current.length

        const offset = configs.current.convOffset
        const fullSeqLen = submitSeq.current.length
        // const infSeq = [editSeq[0], submitSeq.current, editSeq[2]].join("") // add padding on left and right
        seqBoxScrollWidth.current = fullSeqLen * seqBoxPxPerBase.current
        plotBoxScrollWidth.current = Math.max(boxWindowWidth.current, (fullSeqLen - 2 * offset) * plotBoxPxPerBase.current)

        const { sequence, tooltips, annocolors, plotData, plotLayout } = await getSeqPlotAnno(start + offset, end - offset, genome, chromosome, '+', isWorkerInited, infWorker, pendingInference, configs, plotHeight, plotBoxScrollWidth, plotBottomMargin, true, submitSeq.current)

        setIsInfRunning(true)
        setEditSeq(submitSeq.current)
        const padAnno = Array(offset).fill('LightGray')
        editAnno.current = [padAnno, annocolors, padAnno].flat()

        const padTooltipsLeft = range(0, offset).map(x => x.toString())
        const padTooltipsRight = range(fullSeqLen - offset, fullSeqLen)
        editTooltips.current = [padTooltipsLeft, tooltips, padTooltipsRight].flat()

        plotDataList.current = [plotData]
        plotLayoutList.current = [plotLayout]
        setItems([0])

        seqbox.current.scrollLeft = scrollPosition
        const midPointPercent = (scrollPosition - configs.current.convOffset * seqBoxPxPerBase.current + boxWindowWidth.current / 2) / (submitSeq.current.length * seqBoxPxPerBase.current)
        const plotScrollLeft = submitSeq.current.length * plotBoxPxPerBase.current * midPointPercent - boxWindowWidth.current / 2
        plotbox.current.scrollTo(plotScrollLeft)

        const coordsList = range(start, end, (end - start) / 50).map(x => Math.round(x))
        setSeqCoords(coordsList)

        requestAnimationFrame(() => {
          setIsInfRunning(false)
          isEditing.current = false
          // setIsFirstChunkInited(true)
        })

      }

    }
  }

  return (
    <div className='mx-2'>
      <Link to="/" onClick={resetToDefault}> {/* Add onClick to reset state */}
        <h1 className="my-4 text-3xl font-extrabold text-gray-900 dark:text-white md:text-5xl lg:text-6xl">
          <span className="text-transparent bg-clip-text bg-gradient-to-r to-emerald-600 from-sky-400">Sequence browser</span> demo
        </h1>
      </Link>

      <GenomeForm {...genomeFormVars} />

      {/* <GeneSearch onSelectSuggestion={handleSelectSuggestion}/> */}

      <div className='flex-grow py-2' ref={container}>
        <button
          onClick={loadEditMode}
          className="py-1 px-2 text-sm font-medium text-gray-900 bg-white rounded-lg border border-gray-700 hover:bg-gray-100 hover:text-blue-700 focus:ring-4 focus:ring-gray-100">
          {isEditMode ? 'Submit' : 'Edit'}
        </button>

        {/* Sequence box */}
        <div className='relative'>
          {/* Vertical center line in sequence box */}
          <div className={`absolute top-0 bottom-0 w-[2px] bg-gray-500 left-[50%]`} style={{ transform: "translateX(-50%)" }} />

          {/* single scrollable wrapper for coordinate track and sequence track*/}
          <div
            className="mt-2 sequence-box bg-white border-[2px] border-dashed border-slate-500 overflow-x-auto"
            ref={seqbox}
            onScroll={handleSeqBoxScroll}
            onMouseEnter={handleMouseEnterSeqBox}
            onMouseLeave={handleMouseLeaveSeqBox}
          >

            {isFirstChunkInited &&
              <div
                className="flex text-xs bg-gray-100"
                style={{ width: isEditMode ? seqBoxScrollWidth.current : seqBoxScrollWidth.current * 3 }}
              >
                {seqCoords.map((pos, index) => (
                  <div
                    key={index}
                    className="flex-1 text-left select-none border-l-2 border-gray-500"
                    style={{ userSelect: "none" }}
                  >
                    {pos}
                  </div>
                ))}
              </div>
            }
            {isEditMode ?
              !isEditInfRunning && <div className='flex font-mono' style={{ width: seqBoxScrollWidth.current }}>
                {/* editable range */}
                <div
                  ref={editBox}
                  contentEditable
                  suppressContentEditableWarning
                  onInput={handleEditInput}
                  className="flex-1 text-left select-none border border-green-500"
                >
                  {editSeq.split("").map((char, index) => (
                    <Tippy content={editTooltips.current[index]} key={index}>
                      <span
                        style={{
                          backgroundColor: editAnno.current[index],
                          display: "inline",
                        }}
                      >
                        {char}
                      </span>
                    </Tippy>
                  ))}
                </div>

              </div>
              :
              <div className="font-mono whitespace-nowrap">
                {isFirstChunkInited
                  ? seq.split("").map((char, index) => (
                    <Tippy content={tooltips[index]} key={index}>
                      <span
                        style={{
                          backgroundColor: annoColors[index],
                          display: "inline",
                        }}
                      >
                        {char}
                      </span>
                    </Tippy>
                  ))
                  : "Loading...."}
              </div>


            }

          </div>
        </div>

        {seqError && < div className='text-red-500'>  {seqWarnMessage.current} </div>}

        {/* each motif button */}
        {/* <button onClick={openEachMotif} className="mt-2 py-2.5 px-5 me-2 mb-2 text-sm font-medium text-gray-900 bg-white rounded-lg border border-gray-700 hover:bg-gray-100 hover:text-blue-700 focus:ring-4 focus:ring-gray-100">Each motif</button> */}

        {/* Plot box */}

        {isFirstChunkInited ?
          <div className='mt-2'>
            {/* Plot title */}
            {<div className="w-full h-4 mb-4 text-xl flex items-center justify-center">{configs.current.title}</div>}

            <div className={`relative`} style={{ height: plotHeight + plotBottomMargin }}>

              {/* indicator of sequence box */}
              <div
                className="absolute top-1 bottom-8 border-2 border-dashed border-slate-500 z-30"
                style={{
                  left: `${50 - seqBoxBorderHalf.current}%`, // Left edge
                  width: `${seqBoxBorderHalf.current * 2}%`, // Width of the box
                  pointerEvents: "none",
                }}
              ></div>

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

              <div className="top-0 left-0 w-full overflow-x-auto border-x">
                <List
                  className='plot-box'
                  layout="horizontal"
                  ref={plotbox}
                  height={plotHeight + plotBottomMargin}
                  itemCount={items.length}
                  itemSize={plotBoxScrollWidth.current}
                  width={boxWindowWidth.current}
                  onScroll={handlePlotBoxScroll}
                >
                  {PlotChunk}
                </List>
              </div>

            </div>
          </div>
          : 'Loading...'
        }
      </div>
    </div >
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
    const hslColors = motifColors.map(hex => colorStrToHSL(hex))

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

function parseRGB(rgbString) {
  const match = rgbString.match(/^rgb\((\d+),\s*(\d+),\s*(\d+)\)$/);
  if (!match) throw new Error("Invalid RGB format");
  return match.slice(1, 4).map(Number);
}

// Helper: Convert RGB or Hex to HSL
const colorStrToHSL = (hex) => {

  const rgb = hex.startsWith('rgb') ? parseRGB(hex) : hexToRgb(hex); // rgb(r,g,b) or #hex string

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


// sequence only
const workerSeqInference = (sequence, start, end, strand, isWorkerInited, infWorker, pendingInference, configs) => {

  if (!isWorkerInited) {
    return Promise.reject("Inference infWorker not ready");
  }

  return new Promise((resolve, reject) => {
    const requestId = crypto.randomUUID(); // Unique ID for this request
    // Store resolve function so it can be called when inference is done
    pendingInference.current.set(requestId, resolve);

    // Send message to infWorker with requestId
    infWorker.current.postMessage({
      type: "seqInference",
      data: { sequence, start, end, strand, configs },
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

    const filter_min = traceConfig.filter_min
    const filter_max = traceConfig.filter_max

    // Keep all x, but filter y values below threshold by setting them to null
    const yFiltered_min = filter_min ? yData.map(y => (y > filter_min ? y : null)) : yData

    const yFiltered = filter_min ? yFiltered_min.map(y => (y < filter_max ? y : filter_max)) : yData
    // const yFiltered = yData

    const trace = { x: xs, y: yFiltered }
    // Copy all properties from traceConfig except 'result_key'
    for (const [key, value] of Object.entries(traceConfig)) {
      if (key !== "result_key" && key !== "filter_min") {
        trace[key] = value;
      }
    }

    // Create trace using the configuration and data
    return trace
  });

  // Filter out any null traces (in case of missing data)
  return plotTraces.filter(trace => trace !== null);
};


// get all data corresponding to a chunk of sequence
const getSeqPlotAnno = async (start, end, genome, chromosome, strand, isWorkerInited, infWorker, pendingInference, configs, plotHeight, plotBoxScrollWidth, plotBottomMargin, seqMode, inputSeq) => {
  const { sequence, results, tooltips, annocolors } = seqMode
    ? await workerSeqInference(
      inputSeq, start, end, strand,
      isWorkerInited, infWorker, pendingInference, configs
    )
    : await workerInference(
      start, end, genome, chromosome, strand,
      isWorkerInited, infWorker, pendingInference, configs
    );
  // infWorker fetch sequence and run inference, note that inf result is shorter than sequence input
  // const { sequence, results, tooltips, annocolors } = await workerInference(start, end, genome, chromosome, strand, isWorkerInited, infWorker, pendingInference, configs)

  // set plotly traces from inference results
  const plotMat = configs.current.yDataKeys.map(key => Array.from(results[key].cpuData)) // plotMatrix
  const plotData = getPlotData(plotMat, start, end, strand, configs)

  const xaxisLayout = {
    tickformat: 'd',
    autorange: false,
    range: strand === '-' ? [end, start] : [start, end]
  }
  const totalPlots = configs.current.grid.rows * configs.current.grid.columns;
  const axisLayout = {};
  for (let i = 0; i < totalPlots; i++) {
    axisLayout[`xaxis${i + 1}`] = xaxisLayout;
  }

  if (configs.current.yaxisLayout) {
    for (const [key, value] of Object.entries(configs.current.yaxisLayout)) {
      axisLayout[key] = value;
    }
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


const getCenterCoords = (strand, startCoord, endCoord, scrollLeft, pxPerBase, baseHalfLen) => {

  if (strand === '+') {
    const leftCoord = startCoord + scrollLeft / pxPerBase
    // const coords = [Math.round(leftCoord), Math.round(leftCoord + baseHalfLen), Math.round(leftCoord + 2 * baseHalfLen)]
    return Math.round(leftCoord + baseHalfLen)
  } else {
    const leftCoord = endCoord - scrollLeft / pxPerBase
    // const coords = [Math.round(leftCoord), Math.round(leftCoord - baseHalfLen), Math.round(leftCoord - 2 * baseHalfLen)]
    return Math.round(leftCoord - baseHalfLen)
  }
}

const isValidDNA = (str, len) => {
  if (str.length <= len) return false

  const dnaRegex = /^[ACGT]+$/i
  return dnaRegex.test(str)

}

export default App