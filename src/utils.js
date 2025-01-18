// Sequence generator function (commonly referred to as "range", cf. Python, Clojure, etc.)
const range = (start, stop, step = 1) =>
    Array.from(
        { length: Math.ceil((stop - start) / step) },
        (_, i) => start + i * step,
    );

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

// coords of viewing part of seqbox, left -> right: tick percent 0 -> 1
const getViewCoords = (start, scrollChar, clientChar, scrollPercent, tickPercent, strand) => {
    if (strand === '+') {
        return Math.floor(start + (scrollChar - clientChar) * scrollPercent + tickPercent * clientChar);
    } else {
        return Math.ceil(start + scrollChar - (scrollChar - clientChar) * scrollPercent - tickPercent * clientChar);
    }
};

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

// get indices for slicing the fullseq and get substring
// with genomic coordinates, with strand consideration
const getSliceIndicesFromCoords = (fullStart, fullEnd, subStart, subEnd, strand) => {
    if (subStart < fullStart) {
        console.error('sub start smaller than full start!');
        console.log({
            fullStart: fullStart,
            fullEnd: fullEnd,
            subStart: subStart,
            subEnd: subEnd,
            strand: strand,
        })
    } else if (subEnd > fullEnd) {
        console.error('sub end bigger than full end!');
        console.log({
            fullStart: fullStart,
            fullEnd: fullEnd,
            subStart: subStart,
            subEnd: subEnd,
            strand: strand,
        })
    }
    if (strand === '+') {
        return [subStart - fullStart, subEnd - fullStart];
    } else {
        return [fullEnd - subEnd, fullEnd - subStart];
    }
};

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


export { range, encodeSequence, getViewCoords, fetchSequence, getSliceIndicesFromCoords, hexToRgb, hexToHsl, hslToCss, };
////////////////////////////////// older functions
// // Add background color for beginning, middle and end of sequence for debug
// const getBackgroundColor = (index, seqLength) => {
//   if (index < boxSeqLen * 0.06) {
//     return "yellow"; // First 50 characters
//   } else if (index === Math.floor(seqLength / 2)) {
//     return "red"; // Middle character
//   } else if (index >= seqLength - boxSeqLen * 0.06) {
//     return "green"; // Last 50 characters
//   }
//   return "transparent"; // Default background
// };