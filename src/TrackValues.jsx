import React from "react";
import { useGenomeContext } from "./GenomeContext";

const TrackValues = () => {
    const { genome, chromosome, coordinate, strand, gene, sequence } = useGenomeContext();

    return (
        <div>
            <h2 className="mb-4 text-lg font-bold"> Current Values</h2>
            <ul className="space-y-2 text-sm">
                <li><span> Genome:</span> {genome}</li>
                <li><span> Chromosome:</span> {chromosome}</li>
                <li><span> coordinate:</span> {coordinate}</li>
                <li><span> strand:</span> {strand}</li>
                <li><span> gene:</span> {gene}</li>
                <li><span> seq:</span>
                    {/* mini sequence box */}
                    <div className="block max-w-2xl px-2 border border-grey-200 rounded-md break-words text-gray-700 text-wrap font-mono mt-2">{sequence}</div>
                </li>

            </ul>
        </div>
    );
};

export default TrackValues;