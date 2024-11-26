import React, { createContext, useContext, useState } from "react";

// Variables storing genome information, like hg38, chr1, -, 1112999 etc.
// Centralize state managment of shared varaibles
const GenomeContext = createContext();

export const useGenomeContext = () => useContext(GenomeContext);

export const GenomeProvider = ({ children }) => {

    const [genome, setGenome] = useState("Human");
    const [chromosome, setChromosome] = useState("chr1");
    const [coordinate, setCoordinate] = useState(5530600);
    const [strand, setStrand] = useState("+");
    const [gene, setGene] = useState("ACTB");

    const contextValue={
        genome, setGenome, chromosome, setChromosome, coordinate, setCoordinate, strand, setStrand, gene, setGene,
    };

    return <GenomeContext.Provider value={contextValue}>{children}</GenomeContext.Provider>
};