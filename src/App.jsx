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
  // const [model, setModel] = useState(() => searchParams.get('m') || "puffin")
  const [model, setModel] = useState(() => searchParams.get('m') || "motif")

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
  const seqBoxScrollWidth = useRef(seqBoxPxPerBase * boxSeqLen) // left, mid, right, 3 chunks only
  const plotBoxScrollWidth = useRef(null)
  const seqBoxViewHalfLen = useRef(null)
  const plotBoxViewHalfLen = useRef(null)

  const plotScrollToSeqScrollOffset = useRef(null) // plot area has more bases, so seq box need to scroll extra lengths to match the middle coordinate
  const seqScrollToPlotScrollOffset = useRef(null)

  // static marks for seqbox, since there's always only 3 chunks
  const seqBoxUpdateLeft = useRef(seqBoxPxPerBase * boxSeqLen) // seq box scroll width, end of first chunk
  const seqBoxUpdateRight = useRef(seqBoxPxPerBase * boxSeqLen * 2) // seq box scroll width x2, end of second chunk, a bit more

  // moving marks, these are inside plot box
  const seqBoxLeftTriggerPoint = useRef(null) // starting position that matches the seq box
  const seqBoxRightTriggerPoint = useRef(null)

  const plotClosetestLeftScrollPoint = useRef(null)
  const boxCenterChunkId = useRef(initMiddleIdx)

  // place holder for retrieving new sequences
  const seqChunkFiller = 'X'.repeat(boxSeqLen)
  const tooltipsChunkFiller = new Array(boxSeqLen).fill('0')
  const annoChunkFiller = new Array(boxSeqLen).fill('white')

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

  const scrollBox = useRef('plotBox')

  const seqBoxBorderHalf = useRef(0)

  // set scrollingBox based on where the mouse is
  const handleMouseEnterSeqBox = () => { scrollBox.current = 'seqBox' }
  const handleMouseLeaveSeqBox = () => { scrollBox.current = 'plotBox' }
  // const handleMouseEnterPlotBox = () => { scrollBox.current = 'plotBox' }

  // coodinate ruler
  const [plotCoords, setPlotCoords] = useState([0, 0, 0])
  const [seqCoords, setSeqCoords] = useState([0, 0, 0])

  const [showEachMotif, setShowEachMotif] = useState(false)

  // URL update effect
  useEffect(() => {
    const params = new URLSearchParams({
      g: genome,
      c: chromosome,
      pos: centerCoordinate.toString(),
      s: strand,
      m: model
    })

    // Only update if different from current URL
    if (params.toString() !== searchParams.toString()) {
      setSearchParams(params, { replace: true })
    }
  }, [genome, chromosome, centerCoordinate, strand, model, searchParams, setSearchParams])

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
      plotBoxAvailableScroll.current = plotScrollWidth - boxWidth
      seqBoxAvailableScroll.current = seqBoxScrollWidth.current * 3 - boxWidth
      plotBoxPxPerBase.current = plotPxPerBP

      seqBoxViewHalfLen.current = boxWidth / seqBoxPxPerBase / 2
      plotBoxViewHalfLen.current = boxWidth / plotPxPerBP / 2

      seqBoxBorderHalf.current = plotPxPerBP / seqBoxPxPerBase * 50 // in percentage 100% / 2

      plotScrollToSeqScrollOffset.current = (boxWidth / plotPxPerBP - boxWidth / seqBoxPxPerBase) / 2 * seqBoxPxPerBase + seqBoxPxPerBase * boxSeqLen // plus the left buffer

      seqScrollToPlotScrollOffset.current = (boxWidth / seqBoxPxPerBase - boxWidth / plotPxPerBP) / 2 * plotPxPerBP

      seqBoxLeftTriggerPoint.current = initMiddleIdx * plotScrollWidth // 1 * 4500 at beginning
      seqBoxRightTriggerPoint.current = (initPlotNum - 1) * plotScrollWidth
      // seqBoxRightTriggerPoint.current = (initPlotNum - 2) * plotScrollWidth + plotBoxAvailableScroll.current
      plotClosetestLeftScrollPoint.current = initMiddleIdx * plotScrollWidth

      // right trigger point
      rightUpdateTriggerPoint.current = (initPlotNum - 1) * plotScrollWidth// when reach the last part of the second but last plot
    }
  }, [isConfigsLoad])

  // init sequence, inference, and set plot
  const initPlot = async () => {
    setIsFirstChunkInited(false)
    seqList.current = new Array(initPlotNum).fill(seqChunkFiller)
    tooltipsList.current = new Array(initPlotNum).fill(tooltipsChunkFiller)
    annoList.current = new Array(initPlotNum).fill(annoChunkFiller)

    plotDataList.current = new Array(initPlotNum).fill(null)
    plotLayoutList.current = new Array(initPlotNum).fill(null)
    isInitedScrolled.current = false

    const start = centerCoordinate - boxSeqHalfLen
    const end = centerCoordinate + boxSeqHalfLen
    plotStartCoord.current = start
    plotEndCoord.current = end

    // seqbox start and end coords with full coord
    seqStartCoord.current = centerCoordinate - 3 * boxSeqHalfLen // seq box only spans 3 chunks
    seqEndCoord.current = centerCoordinate + 3 * boxSeqHalfLen


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
    await extendFixedLists('left', strand, false)
    await extendFixedLists('right', strand, false)
    setSeq(seqList.current.join(""))
    setTooltips(tooltipsList.current.flat())
    setAnnoColors(annoList.current.flat())
  }
  // load the other two chunks once the middle chunk is loaded
  useEffect(() => {
    if (isFirstChunkInited) { initSideChunks() }
  }, [isFirstChunkInited])

  const scrollTimeout = useRef(null); // To track when scrolling stops

  const getCoords = (strand, startCoord, endCoord, scrollLeft, pxPerBase, baseHalfLen) => {

    if (strand === '+') {
      const leftCoord = startCoord + scrollLeft / pxPerBase
      const coords = [Math.floor(leftCoord), Math.floor(leftCoord + baseHalfLen), Math.floor(leftCoord + 2 * baseHalfLen)]
      return coords
    } else {
      const leftCoord = endCoord - scrollLeft / pxPerBase
      const coords = [Math.floor(leftCoord), Math.floor(leftCoord - baseHalfLen), Math.floor(leftCoord - 2 * baseHalfLen)]
      return coords
    }
  }

  const handleSeqBoxScroll = () => {
    if (isTransitioning.current || !isInitedScrolled.current || scrollBox.current === 'plotBox') return;

    const scrollLeft = seqbox.current.scrollLeft

    if (scrollLeft < seqBoxUpdateLeft.current) {
      isTransitioning.current = true

      if (boxCenterChunkId.current === 1) {
        // need to fetch new chunks

        // pad Xs for sequence
        setSeq([seqChunkFiller, seqList.current[0], seqList.current[1]].join(""))
        setAnnoColors([annoChunkFiller, annoList.current[0], annoList.current[1]].flat())
        setTooltips([tooltipsChunkFiller, tooltipsList.current[0], tooltipsList.current[1]].flat())

        // update scrolling
        seqbox.current.scrollLeft += seqBoxScrollWidth.current

        // left edge, avoid upating lists at the sametime
        // add a null chunk and update items
        plotDataList.current = [null, ...plotDataList.current]
        plotLayoutList.current = [null, ...plotLayoutList.current]
        setItems((prev) => [prev[0] - 1, ...prev])

        seqList.current = [null, ...seqList.current]
        tooltipsList.current = [null, ...tooltipsList.current]
        annoList.current = [null, ...annoList.current]

        extendFixedLists('left', strand, true)
        rightUpdateTriggerPoint.current += plotBoxScrollWidth.current // move the trigger point further down

      } else {
        // only shift to left
        console.log('only shift to left')

        const cen = boxCenterChunkId.current // shift to the left
        setSeq([seqList.current[cen - 2], seqList.current[cen - 1], seqList.current[cen]].join(""))
        setAnnoColors([annoList.current[cen - 2], annoList.current[cen - 1], annoList.current[cen]].flat())
        setTooltips([tooltipsList.current[cen - 2], tooltipsList.current[cen - 1], tooltipsList.current[cen]].flat())

        seqbox.current.scrollLeft += seqBoxScrollWidth.current

        boxCenterChunkId.current -= 1
        seqBoxLeftTriggerPoint.current -= plotBoxScrollWidth.current
        seqBoxRightTriggerPoint.current -= plotBoxScrollWidth.current
      }

      // update seq coords no matter fetch or not
      updateSeqCoords(strand, 'left', seqStartCoord, seqEndCoord, boxSeqLen)
      requestAnimationFrame(() => {
        isTransitioning.current = false
      })

    } else if (scrollLeft > seqBoxUpdateRight.current) {

      isTransitioning.current = true

      if (boxCenterChunkId.current === items.length - 2) {
        console.log('update and fetch on right')

        const lastIdx = seqList.current.length - 1
        setSeq([seqList.current[lastIdx - 1], seqList.current[lastIdx], seqChunkFiller].join(""))
        setAnnoColors([annoList.current[lastIdx - 1], annoList.current[lastIdx], annoChunkFiller].flat())
        setTooltips([tooltipsList.current[lastIdx - 1], tooltipsList.current[lastIdx], tooltipsChunkFiller].flat())

        // update scrolling
        seqbox.current.scrollLeft -= seqBoxScrollWidth.current

        // add a null chunk at the end and update items
        plotDataList.current = [...plotDataList.current, null]
        plotLayoutList.current = [...plotLayoutList.current, null]

        seqList.current = [...seqList.current, null]
        tooltipsList.current = [...tooltipsList.current, null]
        annoList.current = [...annoList.current, null]
        setItems((prev) => [...prev, prev[items.length - 1] + 1])
        extendFixedLists('right', strand, true)

        rightUpdateTriggerPoint.current += plotBoxScrollWidth.current // move the trigger point further down
        // seqBox shift left
        seqBoxRightTriggerPoint.current += plotBoxScrollWidth.current
        seqBoxLeftTriggerPoint.current += plotBoxScrollWidth.current

        boxCenterChunkId.current += 1
      } else {
        // only swap seq, no update 
        // console.log('only swap seq on the right')

        const cen = boxCenterChunkId.current // shift to the left
        setSeq([seqList.current[cen], seqList.current[cen + 1], seqList.current[cen + 2]].join(""))
        setAnnoColors([annoList.current[cen], annoList.current[cen + 1], annoList.current[cen + 2]].flat())
        setTooltips([tooltipsList.current[cen], tooltipsList.current[cen + 1], tooltipsList.current[cen + 2]].flat())

        boxCenterChunkId.current += 1
        seqBoxLeftTriggerPoint.current += plotBoxScrollWidth.current
        seqBoxRightTriggerPoint.current += plotBoxScrollWidth.current

        // update scrolling
        seqbox.current.scrollLeft -= seqBoxScrollWidth.current
      }

      // update seq coords no matter fetch or not
      updateSeqCoords(strand, 'right', seqStartCoord, seqEndCoord, boxSeqLen)
      requestAnimationFrame(() => {
        isTransitioning.current = false
      })

    }

    else {

      const plotPos = seqScrollToPlotScrollOffset.current + (scrollLeft - seqBoxScrollWidth.current) / seqBoxPxPerBase * plotBoxPxPerBase.current + boxCenterChunkId.current * plotBoxScrollWidth.current

      plotbox.current.scrollTo(Math.round(plotPos))

      // Detect when scrolling stops
      clearTimeout(scrollTimeout.current);
      scrollTimeout.current = setTimeout(() => {
        const seqCoords = getCoords(strand, seqStartCoord.current, seqEndCoord.current, scrollLeft, 10, seqBoxViewHalfLen.current)
        setSeqCoords(seqCoords)
        const plotCoords = strand === '+' ? [seqCoords[1] - plotBoxViewHalfLen.current, seqCoords[1], seqCoords[1] + plotBoxViewHalfLen.current] : [seqCoords[1] + plotBoxViewHalfLen.current, seqCoords[1], seqCoords[1] - plotBoxViewHalfLen.current]
        setPlotCoords(plotCoords)
      }, 150)
    }


  }

  // throttle(, 5)

  const updateSeqCoords = (strand, direction, seqStartCoord, seqEndCoord, boxSeqLen) => {
    if ((strand === '+' && direction === 'left') || (strand === '-' && direction === 'right')) {
      // moving toward a smaller start
      seqStartCoord.current -= boxSeqLen
      seqEndCoord.current -= boxSeqLen
    } else {
      seqStartCoord.current += boxSeqLen
      seqEndCoord.current += boxSeqLen
    }
  }
  const handlePlotBoxScroll = ({ scrollOffset }) => {
    if (isTransitioning.current || !isInitedScrolled.current || scrollBox.current === 'seqBox') return;

    if (scrollOffset < seqBoxLeftTriggerPoint.current) {
      isTransitioning.current = true

      if (scrollOffset < plotBoxScrollWidth.current && !isUpdatingLists.current) {
        // left edge, avoid upating lists at the sametime
        // add a null chunk and update items
        plotDataList.current = [null, ...plotDataList.current]
        plotLayoutList.current = [null, ...plotLayoutList.current]
        setItems((prev) => [prev[0] - 1, ...prev])
        plotbox.current.scrollTo(scrollOffset + plotBoxScrollWidth.current)

        // pad Xs for sequence
        setSeq([seqChunkFiller, seqList.current[0], seqList.current[1]].join(""))
        setAnnoColors([annoChunkFiller, annoList.current[0], annoList.current[1]].flat())
        setTooltips([tooltipsChunkFiller, tooltipsList.current[0], tooltipsList.current[1]].flat())

        seqList.current = [null, ...seqList.current]
        tooltipsList.current = [null, ...tooltipsList.current]
        annoList.current = [null, ...annoList.current]

        extendFixedLists('left', strand, true)
        rightUpdateTriggerPoint.current += plotBoxScrollWidth.current // move the trigger point further down

        requestAnimationFrame(() => {
          // shift box trackers to the left
          isTransitioning.current = false
        })
      } else {
        // only swap seq

        const cen = boxCenterChunkId.current // shift to the left
        setSeq([seqList.current[cen - 2], seqList.current[cen - 1], seqList.current[cen]].join(""))
        setAnnoColors([annoList.current[cen - 2], annoList.current[cen - 1], annoList.current[cen]].flat())
        setTooltips([tooltipsList.current[cen - 2], tooltipsList.current[cen - 1], tooltipsList.current[cen]].flat())

        boxCenterChunkId.current -= 1
        seqBoxLeftTriggerPoint.current -= plotBoxScrollWidth.current
        seqBoxRightTriggerPoint.current -= plotBoxScrollWidth.current
        requestAnimationFrame(() => {
          isTransitioning.current = false
        })
      }
      // update seq coords no matter fetch or not
      updateSeqCoords(strand, 'left', seqStartCoord, seqEndCoord, boxSeqLen)
    } else if (scrollOffset > seqBoxRightTriggerPoint.current) {

      if (scrollOffset > rightUpdateTriggerPoint.current && !isUpdatingLists.current) {

        //  right edge
        isTransitioning.current = true
        // add a null chunk at the end and update items
        plotDataList.current = [...plotDataList.current, null]
        plotLayoutList.current = [...plotLayoutList.current, null]

        const lastIdx = seqList.current.length - 1
        setSeq([seqList.current[lastIdx - 1], seqList.current[lastIdx], seqChunkFiller].join(""))
        setAnnoColors([annoList.current[lastIdx - 1], annoList.current[lastIdx], annoChunkFiller].flat())
        setTooltips([tooltipsList.current[lastIdx - 1], tooltipsList.current[lastIdx], tooltipsChunkFiller].flat())

        seqList.current = [...seqList.current, null]
        tooltipsList.current = [...tooltipsList.current, null]
        annoList.current = [...annoList.current, null]
        setItems((prev) => [...prev, prev[items.length - 1] + 1])
        extendFixedLists('right', strand, true)
        rightUpdateTriggerPoint.current += plotBoxScrollWidth.current // move the trigger point further down
        // seqBox shift left
        seqBoxRightTriggerPoint.current += plotBoxScrollWidth.current
        seqBoxLeftTriggerPoint.current += plotBoxScrollWidth.current

        boxCenterChunkId.current += 1

        requestAnimationFrame(() => {
          isTransitioning.current = false
        })
      } else {

        // only swap seq, no update 
        // console.log('only swap seq on the right')

        const cen = boxCenterChunkId.current // shift to the left
        setSeq([seqList.current[cen], seqList.current[cen + 1], seqList.current[cen + 2]].join(""))
        setAnnoColors([annoList.current[cen], annoList.current[cen + 1], annoList.current[cen + 2]].flat())
        setTooltips([tooltipsList.current[cen], tooltipsList.current[cen + 1], tooltipsList.current[cen + 2]].flat())

        boxCenterChunkId.current += 1
        seqBoxLeftTriggerPoint.current += plotBoxScrollWidth.current
        seqBoxRightTriggerPoint.current += plotBoxScrollWidth.current
        requestAnimationFrame(() => {
          isTransitioning.current = false
        })
      }
      // update seq coords no matter fetch or not
      updateSeqCoords(strand, 'right', seqStartCoord, seqEndCoord, boxSeqLen)
    }


    const seqBoxPos = plotScrollToSeqScrollOffset.current + (scrollOffset - seqBoxLeftTriggerPoint.current) / plotBoxPxPerBase.current * seqBoxPxPerBase
    seqbox.current.scrollLeft = Math.round(seqBoxPos)

    // Detect when scrolling stops
    clearTimeout(scrollTimeout.current);
    scrollTimeout.current = setTimeout(() => {

      const plotCoords = getCoords(strand, plotStartCoord.current, plotEndCoord.current, scrollOffset, plotBoxPxPerBase.current, plotBoxViewHalfLen.current)
      setPlotCoords(plotCoords)
      const seqCoords = strand === '+' ?
        [plotCoords[1] - seqBoxViewHalfLen.current, plotCoords[1], plotCoords[1] + seqBoxViewHalfLen.current]
        : [plotCoords[1] + seqBoxViewHalfLen.current, plotCoords[1], plotCoords[1] - seqBoxViewHalfLen.current]
      setSeqCoords(seqCoords)
    }, 200); // Slightly longer delay to catch the stop
  }
  // throttle(, 10)

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
  const extendFixedLists = async (direction, strand, updateSeq) => {
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

      if (updateSeq) {
        setSeq([sequence, seqList.current[1], seqList.current[2]].join(""))
        setTooltips([tooltips, tooltipsList.current[1], tooltipsList.current[2]].flat())
        setAnnoColors([annocolors, annoList.current[1], annoList.current[2]].flat())
      }
    } else {
      const lastIdx = plotDataList.current.length - 1
      seqList.current[lastIdx] = sequence
      tooltipsList.current[lastIdx] = tooltips
      annoList.current[lastIdx] = annocolors
      plotDataList.current[lastIdx] = plotData
      plotLayoutList.current[lastIdx] = plotLayout

      if (updateSeq) {
        setSeq([seqList.current[lastIdx - 2], seqList.current[lastIdx - 1], sequence].join(""))
        setTooltips([tooltipsList.current[lastIdx - 2], tooltipsList.current[lastIdx - 1], tooltips].flat())
        setAnnoColors([annoList.current[lastIdx - 2], annoList.current[lastIdx - 1], annocolors].flat())
      }
    }

    requestAnimationFrame(() => {
      isUpdatingLists.current = false
    })

  }

  const rows = Array.from({ length: 10 });

  return (
    <div className='mx-2'>
      <h1 className="my-4 text-3xl font-extrabold text-gray-900 dark:text-white md:text-5xl lg:text-6xl"><span className="text-transparent bg-clip-text bg-gradient-to-r to-emerald-600 from-sky-400">Sequence browser</span> demo</h1>

      <GenomeForm {...genomeFormVars} />
      <div className='flex-grow py-2 overflow-x-hidden' ref={container}>

        {/* seqBox ruler */}
        <div className='relative h-10 border-b-1'>
          {/* coordinates */}
          <div className="absolute pt-1 top-2 left-1/2 text-xs text-sky-700"
            style={{ left: "0%", transform: "translateX(0%)" }}
          > {Math.floor(seqCoords[0])} </div>

          <div className="absolute pt-1 top-2 left-1/2 text-xs text-sky-700"
            style={{ left: "50%", transform: "translateX(-50%)" }}
          > {Math.floor(seqCoords[1])} </div>
          <div className="absolute pt-1 top-2 left-1/2 text-xs text-sky-700"
            style={{ left: "100%", transform: "translateX(-100%)" }}
          > {Math.floor(seqCoords[2])} </div>

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

        {/* Sequence box */}
        <div className='relative'>
          <div
            className="sequence-box bg-white border-[2px] border-dashed border-slate-500 overflow-x-auto font-mono whitespace-nowrap"
            ref={seqbox}
            onScroll={handleSeqBoxScroll}
            onMouseEnter={handleMouseEnterSeqBox}
            onMouseLeave={handleMouseLeaveSeqBox}
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

        {/* each motif row */}

        {showEachMotif && isFirstChunkInited &&
          <div className='relative h-[10rem] mt-2 overflow-y-auto border border-gray-500'>
            <div className="overflow-x-auto">
              {/* A simple vertical stack of rows */}
              {rows.map((_, index) => (
                <div key={index}>

                  <div className='absolute left-[50%] translate-x-[-50%]'> {`motif${index + 1}`} </div>

                  <div className='inline-block'> {""}</div>
                  <div className="font-mono whitespace-nowrap">
                    {
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
                    }
                  </div>

                </div>
              ))}

            </div>
          </div>
        }

        {/* Plot box */}
        {/* plotBox ruler */}
        <div className='relative h-10 border-b-1'>
          {/* coordinates */}
          <div className="absolute pt-1 top-2 left-1/2 text-xs text-sky-700"
            style={{ left: "0%", transform: "translateX(0%)" }}
          > {Math.floor(plotCoords[0])} </div>

          <div className="absolute pt-1 top-2 left-1/2 text-xs text-sky-700"
            style={{ left: "50%", transform: "translateX(-50%)" }}
          > {Math.floor(plotCoords[1])} </div>
          <div className="absolute pt-1 top-2 left-1/2 text-xs text-sky-700"
            style={{ left: "100%", transform: "translateX(-100%)" }}
          > {Math.floor(plotCoords[2])} </div>

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

        { isFirstChunkInited ?
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
                  {PlotRow}
                </List>
              </div>
              {/* {isFirstChunkInited &&

              } */}

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
const getSeqPlotAnno = async (start, end, genome, chromosome, strand, isWorkerInited, infWorker, pendingInference, configs, plotHeight, plotBoxScrollWidth, plotBottomMargin) => {

  // infWorker fetch sequence and run inference, note that inf result is shorter than sequence input
  const { sequence, results, tooltips, annocolors } = await workerInference(start, end, genome, chromosome, strand, isWorkerInited, infWorker, pendingInference, configs)

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

export default App