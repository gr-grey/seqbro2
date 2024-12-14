import { useEffect } from 'react';

const DallianceViewer = ({ viewerRef, browserRef, chromosome }) => {
  useEffect(() => {
    if (viewerRef.current) {
      browserRef.current = new Browser({
        chr: chromosome,
        viewStart: 5530600,
        viewEnd: 5531600,
        noPersist: true,
        coordSystem: {
          speciesName: 'Human',
          taxon: 9606,
          auth: 'GRCh',
          version: '38',
          ucscName: 'hg38',
        },
        sources: [
          {
            name: 'Genome',
            twoBitURI: 'https://hgdownload.soe.ucsc.edu/goldenPath/hg38/bigZips/hg38.2bit',
            tier_type: 'sequence',
            disabled: true,
            pinned: true,
          },
          {
            name: 'Genes',
            desc: 'Gene structures',
            bwgURI: 'https://hgdownload.soe.ucsc.edu/gbdb/hg38/knownGene.bb',
            collapseSuperGroups: true,
            trixURI: 'https://hgdownload.soe.ucsc.edu/gbdb/hg38/knownGene.ix'
          },
        ],
        holder: viewerRef.current, // Use the div as the viewer container
      });
    }
  }, []);

  return (
    <div
      ref={viewerRef}
      id="svgHolder"
      style={{ width: '100%', border: '1px solid #ccc' }}
    ></div>
  );
};

export default DallianceViewer;