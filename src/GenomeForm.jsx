import React, { useState, useEffect, useRef } from "react";
import useDebounce from "./useDebounce";
import { FiSearch } from "react-icons/fi";

const labelStyle = "text-sm font-md text-gray-700";
const fieldStyle = "rounded-md border border-gray-300 px-2 h-10";
const humanChrs = ["chr1", "chr2", "chr3", "chr4", "chr5", "chr6", "chr7", "chr8", "chr9", "chr10", "chr11", "chr12", "chr13", "chr14", "chr15", "chr16", "chr17", "chr18", "chr19", "chr20", "chr21", "chr22", "chrX", "chrY"];
const mouseChrs = ["chr1", "chr2", "chr3", "chr4", "chr5", "chr6", "chr7", "chr8", "chr9", "chr10", "chr11", "chr12", "chr13", "chr14", "chr15", "chr16", "chr17", "chr18", "chr19", "chrX", "chrY"];

const mapping = {
    '_leftp': '(',
    '_rightp': ')',
    '_dash': '-',
    '_dt': '.',
    '_underl': '_'
}

const GeneSearch = ({ onSelectGene }) => {
    const [geneTss, setGeneTss] = useState('')
    const [suggestions, setSuggestions] = useState([])
    const [showSuggestions, setShowSuggestions] = useState(false)
    const suggestionsRef = useRef(null)
    const inputRef = useRef(null)
    const [highlightedIndex, setHighlightedIndex] = useState(-1)

    // fetch suggestions from solr backend
    const fetchSuggestions = async (value) => {
        // remove space
        const searchQuery = value.trim().replace(/\s/g, "")

        // need at least 1 character to start suggesting
        if (searchQuery.length < 1) { return [] }

        const url = `https://solr.zhoulab.io/solr/tss/suggest?suggest=true&suggest.build=true&suggest.dictionary=tssSuggest&suggest.q=${searchQuery}`

        try {
            // get suggestions
            const response = await fetch(url)
            if (!response.ok) {
                console.error('HTTP error! Status: ', response.status)
                return []
            }

            const data = await response.json()
            const jsonRoot = data.suggest.tssSuggest
            const jsonKey = jsonRoot[searchQuery]
            const rawSuggestions = jsonKey ? jsonKey.suggestions : []


            // raw suggestions are like "A1BG-AS1__chr19__58347315__plus"
            const suggestions = rawSuggestions.map(item => {
                const gene_arr = item.term.split("__")
                const strand = gene_arr[3] === 'plus' ? '+' : '-'
                const gene_name = gene_arr[0].toUpperCase().replace(new RegExp(Object.keys(mapping).join('|'), 'g'), matched => mapping[matched])
                const chrom = gene_arr[1].replace(new RegExp(Object.keys(mapping).join('|'), 'g'), matched => mapping[matched])

                const coordinate = parseInt(gene_arr[2])
                const formatted_label = `${gene_name} | ${chrom} : ${coordinate} ${strand}`

                // return {label: formatted_label}
                return {
                    label: formatted_label,
                    gene_name,
                    chrom,
                    coordinate,
                    strand
                }
            })

            return suggestions
        } catch (error) {
            console.error("Error fetching tss suggestions", error)
            return []
        }
    }

    const onChange = async (e) => {
        const newValue = e.target.value
        setGeneTss(newValue)
        setHighlightedIndex(-1)

        const newSuggestions = await fetchSuggestions(newValue)
        setSuggestions(newSuggestions)

        // show suggestions only when there are any and input is not empty
        setShowSuggestions(newSuggestions.length > 0 && newValue.trim().length > 0)
    }

    const handleSuggestionClick = (suggestion) => {
        setGeneTss(suggestion.label)
        setSuggestions([])
        setShowSuggestions(false)
        if (onSelectGene) {
            onSelectGene(suggestion) // notify parent component
        }
    }

    const handleKeyDown = (e) => {
        if (suggestions.length === 0) return

        if (e.key === 'ArrowDown') {
            e.preventDefault()
            setHighlightedIndex(
                prevIndex => (prevIndex + 1) % suggestions.length
            )
        } else if (e.key === 'ArrowUp') {
            e.preventDefault()
            setHighlightedIndex(
                prevIndex => (prevIndex - 1 + suggestions.length) % suggestions.length
            )
        } else if (e.key === 'Enter') {
            if (highlightedIndex !== -1 && suggestions[highlightedIndex]) {
                e.preventDefault()
                handleSuggestionClick(suggestions[highlightedIndex])
            }
        } else if (e.key === 'Escape') {
            setShowSuggestions(false)
            setHighlightedIndex(-1)
            inputRef.current.blur()
        }
    }

    return (
        <div className="flex flex-col">

            <label className='text-sm font-md text-gray-700'>Gene</label>
            <div className="relative">
                <input
                    type="text"
                    className="rounded-md border border-gray-300 px-2 h-10"
                    placeholder='e.g., ACTB | chr7 : 5530600 -'
                    onKeyDown={handleKeyDown}
                    value={geneTss}
                    onChange={onChange}
                />
                {/* <FiSearch className="absolute right-3 top-3 text-gray-500" size={18} /> */}
                {showSuggestions && suggestions.length > 0 && (
                    <div
                        ref={suggestionsRef}
                        className="absolute z-10 w-full bg-white border border-gray-300 rounded-md shadow-lg mt-1 max-h-60 overflow-y-auto"
                        // Use onMouseDown to prevent blur event from firing before click on suggestion
                        onMouseDown={(e) => e.preventDefault()}
                    >
                        <ul className="list-none p-0 m-0">
                            {suggestions.map((suggestion, index) => (
                                <li
                                    key={index} // Use a unique key
                                    className={`px-4 py-2 cursor-pointer hover:bg-gray-100 ${index === highlightedIndex ? 'bg-blue-100' : ''
                                        }`}
                                    onClick={() => handleSuggestionClick(suggestion)}
                                    // onMouseEnter for keyboard highlight
                                    onMouseEnter={() => setHighlightedIndex(index)}
                                    onMouseLeave={() => setHighlightedIndex(-1)}
                                >
                                    {suggestion.label}
                                </li>
                            ))}
                        </ul>
                    </div>
                )}
            </div>
        </div>
    )
}

const GenomeForm = ({ genome, setGenome, chromosome, setChromosome, centerCoordinate, setCenterCoordinate, strand, setStrand, gene, setGene }) => {
    const [tempCoordinate, setTempCoordinate] = useState(centerCoordinate);
    const debouncedCoordinate = useDebounce(tempCoordinate, 500);

    useEffect(() => {
        setCenterCoordinate(debouncedCoordinate);
    }, [debouncedCoordinate]);

    // Determine chromosome list based on genome selection
    const chromosomeList = genome === "hg38" ? humanChrs : mouseChrs;

    const handleGeneSelect = (selectedGene) => {
        console.log('setting state variables by', selectedGene)
        setChromosome(selectedGene.chrom);
        setCenterCoordinate(selectedGene.coordinate);
        setStrand(selectedGene.strand);
        setGene(selectedGene.gene_name); // Also set the gene name if you want to display it separately
    };

    return (
        <div>
            <form className="flex flex-wrap justify-between">
                <div className="flex flex-wrap gap-4">
                    {/* Genome */}
                    <div className="flex flex-col">
                        <label className={labelStyle}>Genome</label>
                        <select value={genome} onChange={(e) => setGenome(e.target.value)} className={fieldStyle}>
                            <option value="hg38">Human</option>
                            <option value="mm10">Mouse</option>
                        </select>
                    </div>
                    {/* Chromosome */}
                    <div className="flex flex-col">
                        <label className={labelStyle}>Chromosome</label>
                        <select value={chromosome} onChange={(e) => setChromosome(e.target.value)} className={fieldStyle}>
                            {chromosomeList.map((chr) => (
                                <option key={chr} value={chr}>
                                    {chr}
                                </option>
                            ))}
                        </select>
                    </div>
                    {/* Coordinate */}
                    <div className="flex flex-col w-1/5">
                        <label className={labelStyle}>Coordinate</label>
                        <input type="number" value={tempCoordinate} onChange={(e) => setTempCoordinate(parseInt(e.target.value))} className={fieldStyle} />
                    </div>
                    {/* Strand */}
                    <div className="flex flex-col">
                        <label className={labelStyle}>Strand</label>
                        <div className="flex">
                            <button
                                type="button"
                                onClick={() => setStrand("-")}
                                className={`w-12 h-10 rounded-l-md p-2 ${strand === "-" ? "bg-gray-400 text-white" : "border border-gray-300"}`}
                            >
                                -
                            </button>
                            <button
                                type="button"
                                onClick={() => setStrand("+")}
                                className={`w-12 h-10 rounded-r-md p-2 ${strand === "+" ? "bg-gray-400 text-white" : "border border-gray-300"}`}
                            >
                                +
                            </button>
                        </div>
                    </div>
                </div>

                {/* Gene */}
                <div className="flex flex-col">

                    <GeneSearch onSelectGene={handleGeneSelect}/>
                    {/* <label className={labelStyle}>Gene</label>
                    <div className="relative">
                        <input type="text" value={gene} onChange={(e) => setGene(e.target.value)} className="rounded-md border border-gray-300 px-2 h-10 w-25" />
                        <FiSearch className="absolute right-3 top-3 text-gray-500" size={18} />
                    </div> */}
                </div>
            </form>
        </div>
    );
};

export default GenomeForm;