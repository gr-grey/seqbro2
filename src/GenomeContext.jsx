import React, { createContext, useContext, useState, useEffect, useRef } from "react";

// Variables storing genome information, like hg38, chr1, -, 1112999 etc.
// Centralize state managment of shared varaibles
const GenomeContext = createContext();

export const useGenomeContext = () => useContext(GenomeContext);

export const GenomeProvider = ({ children }) => {

    const [genome, setGenome] = useState("hg38");
    const [chromosome, setChromosome] = useState("chr1");
    const [coordinate, setCoordinate] = useState(5530600);
    const [strand, setStrand] = useState("+");
    const [gene, setGene] = useState("ACTB");
    const [sequence, setSequence] = useState("");
    const halfLen = 500; // retrieve center -/+ 500, 1001 sequencec in total
    const [seqStart, setSeqStart] = useState(null);
    const [seqEnd, setSeqEnd] = useState(null);
    const [displayStart, setDisplayStart] = useState(null);
    const [displayEnd, setDisplayEnd] = useState(null);
    const [displaySequence, setDisplaySequence] = useState("");


    const fetchSequence = async (start, end) => {
        // hard code hg38 for now, might change later
        const url = `https://tss.zhoulab.io/apiseq?seqstr=\[${genome}\]${chromosome}:${start}-${end}\ ${strand}`;
        try {
            const response = await fetch(url);
            const data = await response.json();
            // setSequence(data[0]?.data || "");
            return data[0]?.data || "";
        } catch (error) { 
            console.error("Failed to fetch sequence: ", error); 
            return ""; 
        }
    };

    // Update sequence when genome, chrom, coord or strand changes
    useEffect(()=>{
        // when clear out coord field, coordinate becomes NaN
        if (coordinate && Number.isInteger(coordinate)) { 
            const fetchAndSetSequence = async () => {
                const start = coordinate - halfLen;
                const end = coordinate + halfLen + 1; // seqstr exclude the last coord, but we want that letter too
                const tempSequence = await fetchSequence(start, end);
                setSequence(tempSequence);
                setSeqStart(start); setSeqEnd(end);
                // display the middle half of full sequence
                setDisplaySequence(tempSequence.slice(halfLen/2, - halfLen/2));
                // start/end display start/end are for debugging purpose
                setDisplayStart(start + halfLen/2);
                setDisplayEnd(end - halfLen/2);
            };
            fetchAndSetSequence();
        }
    }, [genome, chromosome, coordinate, strand]);

    // Sequence Box, needed width for scrolling implementation
    const sequenceBoxRef = useRef(null);
    const SequenceBox = ({ children, className }) => (
        <div className={className} ref={sequenceBoxRef}>
            {children}
        </div>
    );

    const contextValue={
        genome, setGenome, chromosome, setChromosome, coordinate, setCoordinate, strand, setStrand, gene, setGene, sequence, SequenceBox, sequenceBoxRef, halfLen, seqStart, seqEnd, displaySequence, displayStart, displayEnd,
    };


    return <GenomeContext.Provider value={contextValue}>{children}</GenomeContext.Provider>
};