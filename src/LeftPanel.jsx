import React, { useState, useEffect } from "react";
import { useGenomeContext } from "./GenomeContext";
import useDebounce from "./useDebounce";

const labelStyle = "block text-sm font-md text-gray-700";
const fieldStyle = "w-full rounded-md border border-gray-300 p-2";


const LeftPanel = () => {
    const { genome, setGenome, chromosome, setChromosome, coordinate, setCoordinate, strand, setStrand, gene, setGene } = useGenomeContext();

    // shared/ global coords only gets updated after user stop editting for 800ms
    const [tempCoordinate, setTempCoordinate] = useState(coordinate);
    const debouncedCoordinate = useDebounce(tempCoordinate, 500);

    // update real coords
    useEffect(() => {setCoordinate(debouncedCoordinate);}, [debouncedCoordinate]);

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
                        <option value="chr1">chr1</option>
                        <option value="chr2">chr2</option>
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
                        <button type="button" onClick={()=>setStrand("-")}
                            className={`w-1/2 rounded-md p-2 ${ strand === "-" ? "bg-gray-400 text-white" : "border border-gray-300" }`}>
                            -
                        </button>
                        <button type="button" onClick={()=>setStrand("+")}
                            className={`w-1/2 rounded-md p-2 ${ strand === "+" ? "bg-gray-400 text-white" : "border border-gray-300" }`}>
                            +
                        </button>
                    </div>
                </div>

                {/* Gene */}
                <div>
                    <label className={labelStyle}>Gene</label>
                    <input type="text" value={gene} onChange={(e) => setGene(e.target.value)}
                    className={fieldStyle}/>
                    
                </div>
            </form>
        </div>
    );
};

export default LeftPanel;