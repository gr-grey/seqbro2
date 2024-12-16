import React from "react";

const DebugPanel = ({boxSeqFullWidth, boxWidth, viewSeqLen, syncScrollPercent, fullStart, fullEnd, boxStart, boxEnd, fullSeq, boxSeq, viewStart, genome, chromosome, strand, toolTips, plotFullSeq}) => {

    return (
        <>
            <div className="border-t border-gray-200 mt-2">
                <h1>Debug:</h1>
                <ul className="space-y-2 text-sm">
                    <li><span> --------SeqBox scrolling tracking---------</span></li>
                    <li><span> box seq width:</span> {boxSeqFullWidth.current}</li>
                    <li><span> box view width:</span> {boxWidth.current}</li>
                    <li><span> viewSeqLen:</span> {viewSeqLen.current}</li>
                    <li><span> scroll percent</span> {syncScrollPercent}</li>
                    <li>
                        <span> Full seq Start - End (zero based, exclude last) coordinate:</span>
                        {fullStart.current} - {fullEnd.current}
                    </li>
                    <li><span> Box seq start end:</span> {boxStart.current} - {boxEnd.current}</li>
                    <li>
                        <span> Full seq length:</span> {fullSeq.length};
                        <span> display seq length:</span> {boxSeq.length};
                        <span> plot seq length:</span> {plotFullSeq.current ? plotFullSeq.current.length : 0};
                    </li>
                    <li><span> view start coord:</span> {viewStart}</li>

                    <li><span> --------Genome forms---------</span></li>
                    <li><span> Genome:</span> {genome}</li>
                    <li><span> Chromosome:</span> {chromosome}   </li>
                    <li><span> strand:</span> {strand}</li>

                    <li>
                        <span> tooltip length</span> {toolTips.length};
                    </li>

                    <li><span> full seq:</span>
                        {/* mini sequence box */}
                        <div className="block max-w-2xl px-2 border border-gray-200 rounded-md break-words text-gray-700 text-wrap font-mono mt-2">{fullSeq}</div>
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