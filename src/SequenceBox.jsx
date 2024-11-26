import React, { useRef } from "react";
import { useGenomeContext } from "./GenomeContext";

const SequenceBox = () => {
    const { sequence } = useGenomeContext();
    const sequenceBoxRef = useRef(null);

    return (
        <div className="bg-gray-50 border border-gray-300 overflow-x-auto font-mono"
            ref={sequenceBoxRef}
        >
            {sequence}
        </div>
    );
};

export default SequenceBox;