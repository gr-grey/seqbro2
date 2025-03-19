import React, { useState, useEffect } from "react";
import useDebounce from "./useDebounce";
import { FiSearch } from "react-icons/fi";

const labelStyle = "text-sm font-md text-gray-700";
const fieldStyle = "rounded-md border border-gray-300 px-2 h-10";
const humanChrs = ["chr1", "chr2", "chr3", "chr4", "chr5", "chr6", "chr7", "chr8", "chr9", "chr10", "chr11", "chr12", "chr13", "chr14", "chr15", "chr16", "chr17", "chr18", "chr19", "chr20", "chr21", "chr22", "chrX", "chrY"];
const mouseChrs = ["chr1", "chr2", "chr3", "chr4", "chr5", "chr6", "chr7", "chr8", "chr9", "chr10", "chr11", "chr12", "chr13", "chr14", "chr15", "chr16", "chr17", "chr18", "chr19", "chrX", "chrY"];

const GenomeForm = ({ genome, setGenome, chromosome, setChromosome, centerCoordinate, setCenterCoordinate, strand, setStrand, gene, setGene }) => {
    const [tempCoordinate, setTempCoordinate] = useState(centerCoordinate);
    const debouncedCoordinate = useDebounce(tempCoordinate, 500);

    useEffect(() => {
        setCenterCoordinate(debouncedCoordinate);
    }, [debouncedCoordinate]);

    // Determine chromosome list based on genome selection
    const chromosomeList = genome === "hg38" ? humanChrs : mouseChrs;

    return (
        <div>
            <form className="flex flex-wrap justify-between">
                <div className="flex flex-wrap gap-4">
                    {/* Genome */}
                    <div className="flex flex-col">
                        <label className={labelStyle}>Genome</label>
                        <select value={genome} onChange={(e) => setGenome(e.target.value)} className={fieldStyle}>
                            <option value="hg38">Human</option>
                            <option value="mm10">Mouse</option>
                        </select>
                    </div>
                    {/* Chromosome */}
                    <div className="flex flex-col">
                        <label className={labelStyle}>Chromosome</label>
                        <select value={chromosome} onChange={(e) => setChromosome(e.target.value)} className={fieldStyle}>
                            {chromosomeList.map((chr) => (
                                <option key={chr} value={chr}>
                                    {chr}
                                </option>
                            ))}
                        </select>
                    </div>
                    {/* Coordinate */}
                    <div className="flex flex-col w-1/5">
                        <label className={labelStyle}>Coordinate</label>
                        <input type="number" value={tempCoordinate} onChange={(e) => setTempCoordinate(parseInt(e.target.value))} className={fieldStyle} />
                    </div>
                    {/* Strand */}
                    <div className="flex flex-col">
                        <label className={labelStyle}>Strand</label>
                        <div className="flex">
                            <button
                                type="button"
                                onClick={() => setStrand("-")}
                                className={`w-12 h-10 rounded-l-md p-2 ${strand === "-" ? "bg-gray-400 text-white" : "border border-gray-300"}`}
                            >
                                -
                            </button>
                            <button
                                type="button"
                                onClick={() => setStrand("+")}
                                className={`w-12 h-10 rounded-r-md p-2 ${strand === "+" ? "bg-gray-400 text-white" : "border border-gray-300"}`}
                            >
                                +
                            </button>
                        </div>
                    </div>
                </div>

                {/* Gene */}
                <div className="flex flex-col">
                    <label className={labelStyle}>Gene</label>
                    <div className="relative">
                        <input type="text" value={gene} onChange={(e) => setGene(e.target.value)} className="rounded-md border border-gray-300 px-2 h-10 w-25" />
                        <FiSearch className="absolute right-3 top-3 text-gray-500" size={18} />
                    </div>
                </div>
            </form>
        </div>
    );
};

export default GenomeForm;