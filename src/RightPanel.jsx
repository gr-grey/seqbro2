import React from "react";
import { useGenomeContext } from "./GenomeContext";

const RightPanel = () => {
    const { genome, chromosome, coordinate, strand, gene } = useGenomeContext();

    return(
        <div className="w-full p-4">
            <h2 className="mb-4 text-lg font-bold"> Current Values</h2>
            <ul className="space-y-2 text-sm">
                <li><span> Genome:</span> {genome}</li>
                <li><span> Chromosome:</span> {chromosome}</li>
                <li><span> coordinate:</span> {coordinate}</li>
                <li><span> strand:</span> {strand}</li>
                <li><span> gene:</span> {gene}</li>
            </ul>

        </div>
    );
};

export default RightPanel;