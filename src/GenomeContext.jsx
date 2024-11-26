import React, { createContext, useContext, useState, useEffect } from "react";

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

    const fetchSequence = async () => {
        const start = coordinate - halfLen;
        const end = coordinate + halfLen;
        // hard code hg38 for now, might change later
        const url = `https://tss.zhoulab.io/apiseq?seqstr=\[${genome}\]${chromosome}:${start}-${end}\ ${strand}`;

        try {
            const response = await fetch(url);
            const data = await response.json();
            setSequence(data[0]?.data || "");
        } catch (error) { console.error("Failed to fetch sequence: ", error); }
    };

    // Update sequence when genome, chrom, coord or strand changes
    useEffect(()=>{
        // when clear out coord field, coordinate becomes NaN
        if (coordinate && !isNaN(coordinate)) { fetchSequence(); }
    }, [genome, chromosome, coordinate, strand]);

    const contextValue={
        genome, setGenome, chromosome, setChromosome, coordinate, setCoordinate, strand, setStrand, gene, setGene, sequence,
    };

    return <GenomeContext.Provider value={contextValue}>{children}</GenomeContext.Provider>
};