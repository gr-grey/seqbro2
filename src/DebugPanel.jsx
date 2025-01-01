import React from "react";

const DebugPanel = ({ boxSeqFullWidth, boxWidth, viewSeqLen, commonScrollPercent, fullStart, fullEnd, boxStart, boxEnd, fullSeq, boxSeq, genome, chromosome, strand, tooltips, is1kMode, scrollingBox, scrollLeft, scrollLeftMax, viewCoords, plotDivHeight, plotLayout, showCentralLine,}) => {

    return (
        <>
            <div className="border-t border-gray-200 mt-2">
                <h1>Debug:</h1>
                <ul className="space-y-2 text-sm">
                    <li><span> scroll percent</span> {commonScrollPercent}</li>
                    <li><span> --------Plotly plot tracking---------</span></li>
                    <li><span>Central line</span> {`${showCentralLine}`}</li>
                    <li><span> plot div height </span> {plotDivHeight}</li>

                    <li><span> --------SeqBox scrolling tracking---------</span></li>
                    <li><span> view coords: </span> {`${viewCoords}`}</li>
                    <li><span> 1k mode: </span> {`${is1kMode}`}</li>
                    <li><span> scrollingBox </span> {`${scrollingBox.current}`}</li>
                    <li><span> scrollLeft </span> {`${scrollLeft.current}`}</li>
                    <li><span> scrollLeftMax </span> {`${scrollLeftMax.current}`}</li>
                    <li><span> box seq width:</span> {boxSeqFullWidth.current}</li>
                    <li><span> box view width:</span> {boxWidth.current}</li>
                    <li><span> viewSeqLen:</span> {viewSeqLen.current}</li>
                    <li>
                        <span> Full seq Start - End (zero based, exclude last) coordinate:</span>
                        {fullStart.current} - {fullEnd.current}
                    </li>
                    <li><span> Box seq start end:</span> {boxStart.current} - {boxEnd.current}</li>
                    <li>
                        <span> Full seq length:</span> {fullSeq.current ? fullSeq.current.length : 0};
                        <span> display seq length:</span> {boxSeq.length};
                    </li>

                    <li><span> --------Genome forms---------</span></li>
                    <li><span> Genome:</span> {genome}</li>
                    <li><span> Chromosome:</span> {chromosome}   </li>
                    <li><span> strand:</span> {strand}</li>

                    <li>
                        <span> tooltip length</span> {tooltips.length};
                    </li>

                    <li><span> full seq:</span>
                        {/* mini sequence box */}
                        <div className="block max-w-2xl px-2 border border-gray-200 rounded-md break-words text-gray-700 text-wrap font-mono mt-2">{fullSeq.current}</div>
                    </li>

                    <li><span> box seq:</span>
                        <div className="block max-w-2xl px-2 border border-gray-200 rounded-md break-words text-gray-700 text-wrap font-mono mt-2">{boxSeq}</div>
                    </li>
                </ul>
            </div>
        </>
    )
};

export default DebugPanel;