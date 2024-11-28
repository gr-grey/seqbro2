// naming is a bit confusing, but SequenceBox is the bare component in GenomeContext
// this builds upon it to style and add functions

import { useEffect, useState } from "react";
import { useGenomeContext } from "./GenomeContext";

const SeqBox = () => {
    const { SequenceBox, sequenceBoxRef, displaySequence, displayStart } = useGenomeContext();

    // Remap the mouse scrolling up and down to left and right
    // within SequenceBox
    useEffect(() => {
        const handleWheel = (event) => {
            // if mouse is inside sequenceBox
            if (sequenceBoxRef.current && sequenceBoxRef.current.contains(event.target)) {
                // deltaX is horizontal scroll, delta Y vertical
                // detect if the scrolling is dominated by vertical, if yes, remap to horizontal
                if (Math.abs(event.deltaY) > Math.abs(event.deltaX)) {
                    event.preventDefault();
                    sequenceBoxRef.current.scrollLeft += event.deltaY; // Map vertical scroll to horizontal
                }
            }
        };
        window.addEventListener("wheel", handleWheel, { passive: false });
        return () => { window.removeEventListener("wheel", handleWheel); };
    }, []);

    // left < and right > buttons with continuous scrolling
    const [scrollInterval, setScrollInterval] = useState(null);
    const startScrolling = (direction) => {
        if (!scrollInterval) {
            const interval = setInterval(() => {
                if (sequenceBoxRef.current) { sequenceBoxRef.current.scrollLeft += direction; } // use positive dir to scroll right, neg to scroll left
            }, 50); // adjust interval for smoothness
            setScrollInterval(interval);
        }
    };
    const stopScrolling = () => {
        if (scrollInterval) {
            clearInterval(scrollInterval);
            setScrollInterval(null);
        }
    };

    // tooltip array: [startCoord, endCoord)
    const coords = Array.from(
        { length: displaySequence?.length || 0 },
        (_, index) => displayStart + index
    );

    return (
        <div>
            <div className="flex mb-2">
                <button
                    onMouseDown={() => startScrolling(-30)} // scroll left
                    onMouseUp={stopScrolling}
                    onMouseLeave={stopScrolling}
                    className="px-2 py-1 mr-2 bg-gray-50 border rounded-lg hover:bg-gray-200"
                >
                    &lt; {/* Left Arrow */}
                </button>
                <button
                    onMouseDown={() => startScrolling(30)} // scroll right
                    onMouseUp={stopScrolling}
                    onMouseLeave={stopScrolling}
                    className="px-2 py-1 mr-2 bg-gray-50 border rounded-lg hover:bg-gray-200"
                >
                    &gt; {/* Right Arrow */}
                </button>
            </div>

            {/* Bare seq box, no tooltip */}
            {/* <SequenceBox 
              className="bg-gray-50 border border-gray-300 overflow-x-auto font-mono"
            >{displaySequence || "Loading...."}</SequenceBox> */}

            {/* customized tooltip, fast, but has problem clipped by other components */}
            <SequenceBox
                className="bg-gray-50 pt-8 border-b border-gray-300 overflow-x-auto font-mono whitespace-nowrap"
            >
                {displaySequence
                    ? displaySequence.split("").map((char, index) => (
                        <span
                            key={index}
                            className="relative group inline-block border-t border-gray-300"
                        >
                            {char}
                              {/* Tooltip */}
                            <span
                                className="absolute left-1/2 -translate-x-1/2 bottom-full mb-1 px-2 py-1 text-xs bg-black text-white rounded opacity-0 group-hover:opacity-100 pointer-events-none"
                                style={{ whiteSpace: "nowrap" }}
                            >
                                {coords[index]}
                            </span>
                        </span>
                    ))
                    : "Loading...."
                }
            </SequenceBox>

            {/* Native tooltips, no clipping problem, but  */}
            {/* <SequenceBox
                className="relative bg-gray-50 border border-gray-300 overflow-x-auto font-mono whitespace-nowrap"
            >
                {displaySequence?.split("").map((char, index) => (
                    <span
                        key={index}
                        className="inline-block"
                        title={coords[index]} // Native tooltip with coordinate
                    >
                        {char}
                    </span>
                ))}
            </SequenceBox> */}

        </div>
    );
};

export default SeqBox