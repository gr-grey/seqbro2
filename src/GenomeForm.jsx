import React, { useState, useEffect } from "react";
import useDebounce from "./useDebounce";

const labelStyle = "block text-sm font-md text-gray-700";
const fieldStyle = "w-full rounded-md border border-gray-300 p-2";


const GenomeForm = ({ genome, setGenome, chromosome, setChromosome, centerCoordinate, setCenterCoordinate, strand, setStrand, gene, setGene }) => {

    // shared/ global coords only gets updated after user stop editting for 800ms
    const [tempCoordinate, setTempCoordinate] = useState(centerCoordinate);
    const debouncedCoordinate = useDebounce(tempCoordinate, 500);

    // update real coords
    useEffect(() => { setCenterCoordinate(debouncedCoordinate); }, [debouncedCoordinate]);

    return (
        <div>
            <form className="space-y-4">
                {/* Genome */}
                <div>
                    <label className={labelStyle}>Genome</label>
                    <select value={genome}
                        onChange={(e) => setGenome(e.target.value)}
                        className={fieldStyle}
                    >
                        <option value="hg38">Human</option>
                        <option value="Mouse">Mouse</option>
                    </select>
                </div>

                {/* Chromosome */}
                <div>
                    <label className={labelStyle}>Chromosome</label>
                    <select value={chromosome}
                        onChange={(e) => setChromosome(e.target.value)}
                        className={fieldStyle}
                    >
                        {/*  option chr1 to chr22 */}
                        {/* <option value="chr1">chr1</option> */}
                        {Array.from({ length: 22 }, (_, i) => (
                            <option key={`chr${i + 1}`} value={`chr${i + 1}`}>
                                {`chr${i + 1}`}
                            </option>
                        ))}
                    </select>
                </div>

                {/* Coordinate */}
                <div>
                    <label className={labelStyle}>Coordinate</label>
                    <input type="number" value={tempCoordinate}
                        onChange={(e) => setTempCoordinate(parseInt(e.target.value))}
                        className={fieldStyle}
                    />
                </div>

                {/* Strand */}
                <div>
                    <label className={labelStyle}>Strand</label>
                    <div className="flex space-x-0">
                        <button type="button" onClick={() => setStrand("-")}
                            className={`w-1/2 rounded-md p-2 ${strand === "-" ? "bg-gray-400 text-white" : "border border-gray-300"}`}>
                            -
                        </button>
                        <button type="button" onClick={() => setStrand("+")}
                            className={`w-1/2 rounded-md p-2 ${strand === "+" ? "bg-gray-400 text-white" : "border border-gray-300"}`}>
                            +
                        </button>
                    </div>
                </div>

                {/* Gene */}
                <div>
                    <label className={labelStyle}>Gene</label>
                    <input type="text" value={gene} onChange={(e) => setGene(e.target.value)}
                        className={fieldStyle} />

                </div>
            </form>
        </div>
    );
};

export default GenomeForm;