import * as ort from 'onnxruntime-web'
ort.env.wasm.wasmPaths = "/" // look for wasm files in public folder
ort.env.wasm.numThreads = 1

let inferenceSession = null
let annoSession = null

self.onmessage = async (event) => {
    const { type, data, requestId } = event.data

    try {
        if (type === "init") {
            // init onnx session
            inferenceSession = await ort.InferenceSession.create(data.modelPath)
            annoSession = await ort.InferenceSession.create(data.annoModelPath)
            console.log('inf onnx session from ', data.modelPath)
            console.log('anno session from ', data.annoModelPath)
            self.postMessage({ type: "init_done" })
        } else if (type === 'runInference') {
            if (!inferenceSession) {
                throw new Error("Onnx session not initialized")
            }

            const conf = data.configs.current
            const start = data.start
            const end = data.end
            const offset = conf.convOffset

            const infThreshold = conf.threshold ? conf.threshold : null

            // fetch sequence
            const infSeq = await fetchSequence(start - offset, end + offset, data.genome, data.chromosome, data.strand)
            const sequence = infSeq.slice(offset, -offset)
            const seqEncoded = encodeSequence(infSeq)
            const seqTensor = new ort.Tensor('float32', seqEncoded.flat(), [1, 4, infSeq.length])
            const thresholdTensor = new ort.Tensor('float32', [infThreshold], [1])

            // run inference
            const feeds = infThreshold ? { "encoded_seq": seqTensor, "threshold": thresholdTensor } : { [inferenceSession.inputNames[0]]: seqTensor }

            const results = await inferenceSession.run(feeds)

            if (conf.inf_annos) {

                const max_idx = results['max_idx'].cpuData
                const scaled_all_motifs = results['scaled_one_row'].cpuData
                const { tooltips, annocolors } = annoColorTooltips(start, end, data.strand, max_idx, scaled_all_motifs, conf.motifColorsHSL, conf.scaledThreshold, conf.motifNames)

                self.postMessage({ type: "inference_done", sequence, results, tooltips, annocolors, requestId })

            } else {

                // post inference anno processing
                // yDataKeys, motifNames, motifColorsHSL
                const annoScores = []

                for (const key of conf.annoInputs) {
                    const tensor = results[key].cpuData// Access the tensor using the key
                    annoScores.push(Array.from(tensor)) // Convert tensor data to an array
                }

                // Flatten and create input tensor
                const flatAnnoScores = annoScores.flat()
                const stackedTensor = new ort.Tensor('float32', flatAnnoScores, [conf.annoInputs.length, end - start])
                const annoFeeds = { motif_scores: stackedTensor } // motif_scores is input label for max_index.onnx
                const { max_values, max_indices, max_all } = await annoSession.run(annoFeeds)
                const maxValues = max_values.cpuData
                const maxIndices = max_indices.cpuData
                const maxAll = max_all.cpuData[0]

                const { tooltips, annocolors } = annoSetup(start, end, data.strand, maxIndices, maxValues, maxAll, conf.motifColorsHSL, conf.scaledThreshold, conf.motifNames)


                self.postMessage({ type: "inference_done", sequence, results, tooltips, annocolors, requestId })
            }


        } else if (type === 'seqInference') { // run inference with just sequence
            if (!inferenceSession) {
                throw new Error("Onnx session not initialized")
            }

            const conf = data.configs.current
            const infSeq = data.sequence
            const offset = conf.convOffset
            const sequence = infSeq.slice(offset, -offset)


            const infThreshold = conf.threshold ? conf.threshold : null

            const seqEncoded = encodeSequence(infSeq)
            const seqTensor = new ort.Tensor('float32', seqEncoded.flat(), [1, 4, infSeq.length])
            const thresholdTensor = new ort.Tensor('float32', [infThreshold], [1])

            // run inference
            const feeds = infThreshold ? { "encoded_seq": seqTensor, "threshold": thresholdTensor } : { [inferenceSession.inputNames[0]]: seqTensor }

            const results = await inferenceSession.run(feeds)

            const start = data.start
            const end = data.end

            if (conf.inf_annos) {

                const max_idx = results['max_idx'].cpuData
                const scaled_all_motifs = results['scaled_one_row'].cpuData
                const { tooltips, annocolors } = annoColorTooltips(start, end, data.strand, max_idx, scaled_all_motifs, conf.motifColorsHSL, conf.scaledThreshold, conf.motifNames)

                self.postMessage({ type: "inference_done", sequence, results, tooltips, annocolors, requestId })

            } else {

                // post inference anno processing
                // yDataKeys, motifNames, motifColorsHSL
                const annoScores = []

                for (const key of conf.annoInputs) {
                    const tensor = results[key].cpuData// Access the tensor using the key
                    annoScores.push(Array.from(tensor)) // Convert tensor data to an array
                }

                // Flatten and create input tensor
                const flatAnnoScores = annoScores.flat()
                const stackedTensor = new ort.Tensor('float32', flatAnnoScores, [conf.annoInputs.length, end - start])
                const annoFeeds = { motif_scores: stackedTensor } // motif_scores is input label for max_index.onnx
                const { max_values, max_indices, max_all } = await annoSession.run(annoFeeds)
                const maxValues = max_values.cpuData
                const maxIndices = max_indices.cpuData
                const maxAll = max_all.cpuData[0]

                const { tooltips, annocolors } = annoSetup(start, end, data.strand, maxIndices, maxValues, maxAll, conf.motifColorsHSL, conf.scaledThreshold, conf.motifNames)


                self.postMessage({ type: "inference_done", sequence, results, tooltips, annocolors, requestId })
            }

        }
    } catch (error) {
        self.postMessage({ type: "error", error: error.message })
    }
}

// seqstr exclude last char
const fetchSequence = async (start, end, genome, chromosome, strand) => {
    const url = `https://tss.zhoulab.io/apiseq?seqstr=\[${genome}\]${chromosome}:${start}-${end}\ ${strand}`
    try {
        const response = await fetch(url)
        const data = await response.json()
        const sequence = data[0]?.data || ""
        return sequence
    } catch (error) {
        console.error("Failed to fetch sequence: ", error)
        return ""
    }
}

// helper function to encode sequence
const encodeSequence = (inputSequence) => {
    const seqEncoded = Array.from(inputSequence).map((char) => {
        switch (char) {
            case 'A': return [1, 0, 0, 0]
            case 'a': return [1, 0, 0, 0]
            case 'C': return [0, 1, 0, 0]
            case 'c': return [0, 1, 0, 0]
            case 'G': return [0, 0, 1, 0]
            case 'g': return [0, 0, 1, 0]
            case 'T': return [0, 0, 0, 1]
            case 't': return [0, 0, 0, 1]
            default: return [0, 0, 0, 0]
        }
    })
    // transpose seqlen by 4 to 4 by seq_len
    return seqEncoded[0].map((_, colIndex) => seqEncoded.map(row => row[colIndex]))
}

// Sequence generator function (commonly referred to as "range", cf. Python, Clojure, etc.)
const range = (start, stop, step = 1) =>
    Array.from(
        { length: Math.ceil((stop - start) / step) },
        (_, i) => start + i * step,
    );

// Helper: Convert HSL to CSS String
const hslToCss = (h, s, l) => `hsl(${h}, ${s}%, ${l}%)`;

// Updated getTooltips function
const annoColorTooltips = (start, end, strand, max_idx, scaled_all_motifs, motifColorsHSL, scaledThreshold, motifNames) => {


    // Reverse range if strand is '-'
    const coordinates = strand === '-' ? range(end, start, -1) : range(start, end)

    // Initialize arrays
    const tooltips = []
    const annocolors = []
    // const scaledAnnoScores = []

    // Loop through each base pair to calculate values
    coordinates.forEach((coordinate, index) => {
        const motifIndex = max_idx[index]
        const scaledScore = scaled_all_motifs[index]

        // Generate tooltip
        if (scaledScore < scaledThreshold) {
            tooltips.push(`${coordinate}`) // Only coordinate if below threshold
        } else {
            const motifName = motifNames[Number(motifIndex)] // Get motif name
            tooltips.push(`${coordinate} ${motifName}: (${scaledScore.toFixed(3)})`)
        }

        // Generate annotation color
        if (scaledScore < scaledThreshold) {
            annocolors.push("#FFFFFF") // White if below threshold
        } else {
            const [h, s, l] = motifColorsHSL[motifIndex]// Get HSL values for the motif
            const blendedLightness = Math.round(100 - (100 - l) * scaledScore) // Adjust lightness for intensity
            annocolors.push(hslToCss(h, s, blendedLightness))
        }
    })

    // Return tooltips and annotation colors
    return { tooltips, annocolors }
}
// Updated getTooltips function
const annoSetup = (start, end, strand, maxIndices, maxValues, maxAll, motifColorsHSL, scaledThreshold, motifNames) => {

    // Reverse range if strand is '-'
    const coordinates = strand === '-' ? range(end, start, -1) : range(start, end)

    // Initialize arrays
    const tooltips = []
    const annocolors = []
    const scaledAnnoScores = []

    // Loop through each base pair to calculate values
    coordinates.forEach((coordinate, index) => {
        const motifIndex = maxIndices[index]
        const motifScore = maxValues[index]
        const scaledScore = motifScore / maxAll // Scale the score by maxAll

        // Add scaled score to the array
        scaledAnnoScores.push(scaledScore)

        // Generate tooltip
        if (scaledScore < scaledThreshold) {
            tooltips.push(`${coordinate}`) // Only coordinate if below threshold
        } else {
            const motifName = motifNames[Number(motifIndex)] // Get motif name
            tooltips.push(`${coordinate} ${motifName}: ${motifScore.toFixed(3)} (${scaledScore.toFixed(3)})`)
        }

        // Generate annotation color
        if (scaledScore < scaledThreshold) {
            annocolors.push("#FFFFFF") // White if below threshold
        } else {
            const [h, s, l] = motifColorsHSL[motifIndex]// Get HSL values for the motif
            const blendedLightness = 100 - (100 - l) * scaledScore // Adjust lightness for intensity
            annocolors.push(hslToCss(h, s, blendedLightness))
        }
    })

    // Return tooltips and annotation colors
    return { tooltips, annocolors }
}