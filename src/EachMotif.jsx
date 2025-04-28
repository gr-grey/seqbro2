// src/EachMotif.jsx
import React, { useEffect, useState, useRef } from 'react'
import { useSearchParams } from 'react-router-dom'
import GenomeForm from './GenomeForm'
import inferenceWorker from "./inferenceWorker?worker"

import Tippy from '@tippyjs/react';

export default function EachMotif() {

    // State initialization from URL parameters
    const [searchParams, setSearchParams] = useSearchParams()
    const [genome, setGenome] = useState(() => searchParams.get('g') || "hg38")
    const [chromosome, setChromosome] = useState(() => searchParams.get('c') || "chr7")
    const [model, setModel] = useState(() => searchParams.get('m') || "motif_line")

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

    const [data, setData] = useState(null)
    const [isOpenedByURL, setIsOpenedByURL] = useState(true)

    const [needData, setNeedData] = useState(false)

    const configs = useRef(null)
    const [isConfigsLoad, setIsConfigsLoaded] = useState(false)
    const [isWorkerInited, setIsWorkerInited] = useState(false)
    const [isContentReady, setIsContentReady] = useState(false)

    const infWorker = useRef(null)
    const pendingInference = useRef(new Map())

    const colorMatrix = useRef(null)
    const tooltipsMatrix = useRef(null)
    const seqOneRow = useRef(null)
    const colorOneRow = useRef(null)
    const tooltipsOneRow = useRef(null)

    // fetching sequence and processing
    const seqLen = 1000
    const seqHalfLen = seqLen / 2

    const seqRows = useRef(null)
    const nameRows = useRef(null)

    const logoRows = useRef(null)

    // to sync scroll horizontally
    const oneRowRef = useRef(null)
    const motifsRef = useRef(null)
    const scrollingBox = useRef('motifs')

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

    // get data if opened from App page
    useEffect(() => {
        let timerId

        // 1) tell the opener we’re ready for INIT_DATA
        if (window.opener) { window.opener.postMessage('READY_FOR_DATA', window.location.origin) }

        // 2) install listener
        const onMessage = (evt) => {
            if (
                evt.origin === window.location.origin &&
                evt.data?.type === 'INIT_DATA'
            ) {
                clearTimeout(timerId)
                setData(evt.data.payload)
                setIsOpenedByURL(false)
            }
        }
        window.addEventListener('message', onMessage)

        // 3) start 100 ms timer to fallback
        timerId = window.setTimeout(() => {
            window.removeEventListener('message', onMessage)
            setNeedData(true)
            // console.log('need data from itself')
        }, 100)

        // cleanup
        return () => {
            clearTimeout(timerId)
            window.removeEventListener('message', onMessage)
        }
    }, [])

    useEffect(() => {
        if (needData) {
            // init config
            loadConfigFile(`/${model}.config.json`, configs, setIsConfigsLoaded)
        }
    }, [needData])

    // init worker
    useEffect(() => {
        if (isConfigsLoad) {
            initWorker(infWorker, pendingInference, setIsWorkerInited, configs)
        }
    }, [isConfigsLoad])

    // run inference and display results
    useEffect(() => {
        const setContent = async () => {
            setIsContentReady(false)
            // infWorker fetch sequence and run inference, note that inf result is shorter than sequence input
            const start = centerCoordinate - seqHalfLen
            const end = centerCoordinate + seqHalfLen
            const { sequence, results, tooltips, annocolors } = await workerInference(start, end, genome, chromosome, strand, isWorkerInited, infWorker, pendingInference, configs)

            seqOneRow.current = sequence
            colorOneRow.current = annocolors
            tooltipsOneRow.current = tooltips

            const { cpuData, dims } = results.scaled_matrix;      // Float32Array and [243, 3000]
            const threshold = 0.05;                               // or pull from configs
            const { keptIndices, maskedSeqs, hslMatrix, tooltipsMat } = filterAndMaskMotifs(start, end, sequence, cpuData, dims, threshold, configs)

            colorMatrix.current = hslMatrix
            tooltipsMatrix.current = tooltipsMat
            seqRows.current = maskedSeqs

            nameRows.current = keptIndices.map(idx => configs.current.motifNames[idx])
            logoRows.current = keptIndices.map(idx => `motif${idx + 1}`)


            setIsContentReady(true)

        }
        if (isWorkerInited) {
            setContent()
        }
    }, [isWorkerInited, genome, chromosome, centerCoordinate, strand])

    const handleMotifScroll = () => {
        if (scrollingBox.current === 'motifs') {
            const scrollLeft = motifsRef.current.scrollLeft
            oneRowRef.current.scrollLeft = scrollLeft
        }
    }

    const handleOneRowScroll = () => {
        if (scrollingBox.current === 'onerow') {
            const scrollLeft = oneRowRef.current.scrollLeft
            motifsRef.current.scrollLeft = scrollLeft
        }
    }

    const handleMouseEnterOneRow = () => {
        scrollingBox.current = 'onerow'
    }

    const handleMouseEnterMotifs = () => {
        scrollingBox.current = 'motifs'
    }

    const [selectedLogo, setSelectedLogo] = useState(null)
    const logoRef = useRef(null)

    const handleNameClick = name => {
        const src = `/motif_logos/${name}.png`
        if (selectedLogo === src) {
            setSelectedLogo(null)
        } else {
            setSelectedLogo(src)
        }
    }

    // const onMouseDown = e => {
    //     const img = logoRef.current
    //     if (!img) return

    //     // prevent browser’s own drag preview
    //     img.draggable = false

    //     // figure out where inside the image you clicked
    //     const rect = img.getBoundingClientRect()
    //     const shiftX = e.clientX - rect.left
    //     const shiftY = e.clientY - rect.top

    //     // move function
    //     const moveAt = e => {
    //         img.style.left = e.clientX - shiftX + 'px'
    //         img.style.top = e.clientY - shiftY + 'px'
    //     }

    //     // start listening
    //     document.addEventListener('mousemove', moveAt)
    //     document.addEventListener(
    //         'mouseup',
    //         () => { document.removeEventListener('mousemove', moveAt) },
    //         { once: true }
    //     )

    //     e.preventDefault()
    // }

    const onMouseDown = e => {
        const el = logoRef.current;
        if (!el) return;

        // get bounding box + click offset
        const rect = el.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;

        // define how big the resize-zone should be (px)
        const RESIZE_ZONE = 16;

        // if we clicked inside the bottom-right corner…
        if (
            x > rect.width - RESIZE_ZONE &&
            y > rect.height - RESIZE_ZONE
        ) {
            // let the browser handle the resize
            return;
        }

        // otherwise: do your drag logic
        el.draggable = false;
        const shiftX = e.clientX - rect.left;
        const shiftY = e.clientY - rect.top;

        const moveAt = e => {
            el.style.left = e.clientX - shiftX + 'px';
            el.style.top = e.clientY - shiftY + 'px';
        };

        document.addEventListener('mousemove', moveAt);
        document.addEventListener('mouseup', () => {
            document.removeEventListener('mousemove', moveAt);
        }, { once: true });

        // only preventDefault when dragging
        e.preventDefault();
    };

    return (
        <div style={{ padding: 20 }}>

            {/* effect of all motifs in one row */}
            <div className='mt-2 sticky top-2 z-10 bg-white'>
                <GenomeForm {...genomeFormVars} />
                <div
                    ref={oneRowRef}
                    onScroll={handleOneRowScroll}
                    onMouseEnter={handleMouseEnterOneRow}
                    className='oneRowMotifs mt-5 overflow-x-auto font-mono whitespace-nowrap'
                >
                    {isContentReady && seqOneRow.current.split("").map((char, index) => (
                        <Tippy content={tooltipsOneRow.current[index]} key={index}>
                            <span style={{ backgroundColor: colorOneRow.current[index], display: 'inline-block', width: 10 }}>{char}</span>
                        </Tippy>
                    ))}
                </div>
            </div>
            {isOpenedByURL ? (
                isContentReady ?



                    <div className='relative'>

                        {/* Each motif sequence individually */}
                        <div
                            ref={motifsRef}
                            onScroll={handleMotifScroll}
                            onMouseEnter={handleMouseEnterMotifs}
                            className='overflow-x-auto'
                        >
                            {seqRows.current.map((eachRow, i) => (
                                //  eachRow is a string of 3000 len 
                                <div key={i}>
                                    {/* sequence name, alway in the middle of screen */}
                                    <div
                                        className='absolute left-[50%] translate-x-[-50%] cursor-pointer hover:text-blue-700'
                                        onClick={() => handleNameClick(logoRows.current[i])}
                                    >
                                        {nameRows.current[i]}
                                    </div>

                                    {/* empty row, place holder so that sequence name has an row to place in*/}
                                    <div className='inline-block h-10'> {""}</div>
                                    {/* color each character with calculated color and label values in tooltip */}
                                    <div className="font-mono whitespace-nowrap">
                                        {eachRow.split("").map((char, index) => (
                                            <span key={index}
                                                style={{
                                                    backgroundColor: colorMatrix.current[i][index],
                                                    display: 'inline-block',
                                                    width: 10,
                                                }}
                                                title={tooltipsMatrix.current[i][index]}
                                            >
                                                {char}
                                            </span>
                                        ))}

                                    </div>
                                </div>
                            ))}
                        </div>

                        {/* Sequence logo */}
                        {selectedLogo && (
                            <div
                                ref={logoRef}                          // now on the wrapper
                                onMouseDown={onMouseDown}              // drag logic still works
                                className="fixed top-4 right-4 w-150 h-auto resize overflow-auto bg-white p-2 rounded shadow-md z-50 cursor-grab min-w-[12rem] min-h-[8rem]"

                            >
                                {/* Close button */}
                                <button
                                    onClick={() => setSelectedLogo(null)}
                                    className="absolute top-2 right-2 w-6 h-6 flex items-center justify-center rounded-full bg-gray-200 hover:bg-gray-300 text-gray-800"
                                >
                                    ×
                                </button>

                                {/* The logo image */}
                                <img
                                    src={selectedLogo}
                                    alt="Sequence logo"
                                    className="w-full h-auto select-none pointer-events-none"
                                    draggable={false}    // extra guard against native drag
                                />
                            </div>
                        )}
                    </div>

                    : <p>Loading content...</p>

            ) : (
                <>
                    <h2>Seq:</h2>
                    <pre>{data.seq}</pre>
                    <h2>Tooltip:</h2>
                    <pre>{data.tooltip}</pre>
                    <h2>Annotation:</h2>
                    <pre>{data.annotation}</pre>
                </>
            )}
        </div>
    )
}



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

// Helper: Convert HSL to CSS String
const hslToCss = (h, s, l) => `hsl(${h}, ${s}%, ${l}%)`;

function filterAndMaskMotifs(start, end, sequence, flatData, dims, threshold, configs) {
    const [numMotifs, seqLen] = dims;
    const bases = sequence.split('');        // 1×3000 array of “A”/“G”/“C”/“T”
    const keptIndices = [];
    const maskedSeqs = [];
    const hslColors = configs.current.motifColorsHSL
    const hslMatrix = []
    const tooltipsMat = []

    for (let i = 0; i < numMotifs; i++) {
        const offset = i * seqLen;
        let anyAbove = false;
        const motifChars = new Array(seqLen);
        const [h, s, l] = hslColors[i]
        const thisMotifColor = []
        const thisTooltips = []

        // scan the row once: both check & build
        for (let j = 0; j < seqLen; j++) {
            const val = flatData[offset + j];
            if (val >= threshold) {
                anyAbove = true;
                motifChars[j] = bases[j];
                const blendedLightness = Math.round(100 - (100 - l) * val) // Adjust lightness for intensity
                thisMotifColor.push(hslToCss(h, s, blendedLightness))
            } else {
                motifChars[j] = '-';
                thisMotifColor.push('white') // white in hsl
            }
            thisTooltips.push(`${start + j} (${bases[j]}): ${val.toFixed(2)}`)

        }

        if (anyAbove) {
            keptIndices.push(i);
            maskedSeqs.push(motifChars.join(''));
            hslMatrix.push(thisMotifColor)
            tooltipsMat.push(thisTooltips)
        }
    }

    // return hsl matrix
    return { keptIndices, maskedSeqs, hslMatrix, tooltipsMat };
}