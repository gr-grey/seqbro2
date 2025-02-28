self.importScripts('https://cdn.jsdelivr.net/npm/onnxruntime-web/dist/ort.min.js');

let inferenceSession = null

ort.env.wasm.wasmPaths = 'https://cdn.jsdelivr.net/npm/onnxruntime-web@dev/dist/'
self.onmessage = async (event) => {
  const {type, data, requestId} = event.data

  try {
    if (type === "init") {
      // init onnx session
      inferenceSession = await ort.InferenceSession.create(data.modelPath)
      console.log('onnx session from ', data.modelPath)
      self.postMessage({type: "init_done"})
    } else if (type === 'runInference'){
      if (!inferenceSession) {
        throw new Error("Onnx session not initialized")
      }

      // fetch sequence
      const seq = await fetchSequence(data.start, data.end, data.genome, data.chromosome, data.strand)
      const seqEncoded = encodeSequence(seq)
      const seqTensor = new ort.Tensor('float32', seqEncoded.flat(), [1, 4, seq.length])

      // run inference
      const feeds = {[inferenceSession.inputNames[0]]: seqTensor}
      const results = await inferenceSession.run(feeds)

      self.postMessage({type: "inference_done", sequence: seq, results, requestId})

    }
  } catch (error) {
    self.postMessage({type: "error", error: error.message})
  }
}

// seqstr exclude last char
const fetchSequence = async (start, end, genome, chromosome, strand) => {
  const url = `https://tss.zhoulab.io/apiseq?seqstr=\[${genome}\]${chromosome}:${start}-${end}\ ${strand}`;
  try {
      const response = await fetch(url);
      const data = await response.json();
      const sequence = data[0]?.data || "";
      return sequence;
  } catch (error) {
      console.error("Failed to fetch sequence: ", error);
      return "";
  }
};

// helper function to encode sequence
const encodeSequence = (inputSequence) => {
  const seqEncoded = Array.from(inputSequence).map((char) => {
      switch (char) {
          case 'A': return [1, 0, 0, 0];
          case 'C': return [0, 1, 0, 0];
          case 'G': return [0, 0, 1, 0];
          case 'T': return [0, 0, 0, 1];
          default: return [0, 0, 0, 0];
      }
  });
  // transpose seqlen by 4 to 4 by seq_len
  return seqEncoded[0].map((_, colIndex) => seqEncoded.map(row => row[colIndex]));
};

// const runInference = async (inputSequence, inferenceSession) => {
//   try {
//     if (!inferenceSession.current) {
//       throw new Error('Model session is not initialized.');
//     }

//     // Encode the sequence
//     const seqEncoded = encodeSequence(inputSequence);
//     const seqEncodedTensor = new ort.Tensor('float32', seqEncoded.flat(), [1, 4, inputSequence.length]);

//     // Run inference
//     const feeds = { [inferenceSession.current.inputNames[0]]: seqEncodedTensor };
//     const results = await inferenceSession.current.run(feeds);

//     return results;
//   } catch (error) {
//     console.error("Error running inference:", error);
//     return null;
//   }
// };