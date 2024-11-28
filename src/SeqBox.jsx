// naming is a bit confusing, but SequenceBox is the bare component in GenomeContext
// this builds upon it to style and add functions

import { useEffect, useState } from "react";
import { useGenomeContext } from "./GenomeContext";

const SeqBox = () => {
    const { SequenceBox, sequenceBoxRef } = useGenomeContext();

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
            <SequenceBox />
        </div>
    );
};

export default SeqBox