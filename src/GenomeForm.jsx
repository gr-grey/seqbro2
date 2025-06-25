import React, { useState, useEffect, useRef } from "react";
import Autosuggest from 'react-autosuggest'; // Import Autosuggest
import useDebounce from "./useDebounce"; // Assuming useDebounce is in a separate file

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
    const [geneTss, setGeneTss] = useState(''); // Value for the input field
    const [suggestions, setSuggestions] = useState([]); // List of suggestions to display
    // NEW: State for the "highly expressed TSS" checkbox, default to true (checked)
    const [isHighlyExpressedChecked, setIsHighlyExpressedChecked] = useState(true);

    // Function to fetch suggestions from your Solr backend
    // Modified to accept a parameter for whether to fetch highly expressed TSS
    const getSuggestions = async (value, useHighExpressed = true) => {
        const searchQuery = value.trim().replace(/\s/g, "");

        if (searchQuery.length < 1) { return []; }

        let url = "";
        if (useHighExpressed) {
            url = `https://solr.zhoulab.io/solr/hightss/suggest?suggest=true&suggest.build=true&suggest.dictionary=hightssSuggest&suggest.q=${searchQuery}`;
        } else {
            url = `https://solr.zhoulab.io/solr/tss/suggest?suggest=true&suggest.build=true&suggest.dictionary=tssSuggest&suggest.q=${searchQuery}`;
        }


        try {
            const response = await fetch(url);
            if (!response.ok) {
                console.error('HTTP error! Status: ', response.status);
                return [];
            }

            const data = await response.json();
            // Adjust parsing based on the dictionary name for highly expressed vs regular
            const jsonRoot = useHighExpressed ? data.suggest.hightssSuggest : data.suggest.tssSuggest;
            const jsonKey = jsonRoot[searchQuery];
            const rawSuggestions = jsonKey ? jsonKey.suggestions : [];

            const parsedSuggestions = rawSuggestions.map(item => {
                const gene_arr = item.term.split("__");
                const strand = gene_arr[3] === 'plus' ? '+' : '-';
                const gene_name = gene_arr[0].toUpperCase().replace(new RegExp(Object.keys(mapping).join('|'), 'g'), matched => mapping[matched]);
                const chrom = gene_arr[1].replace(new RegExp(Object.keys(mapping).join('|'), 'g'), matched => mapping[matched]);
                const coordinate = parseInt(gene_arr[2]);
                const formatted_label = `${gene_name} | ${chrom} : ${coordinate} ${strand}`;

                return {
                    label: formatted_label,
                    gene_name,
                    chrom,
                    coordinate,
                    strand
                };
            });

            return parsedSuggestions;
        } catch (error) {
            console.error("Error fetching tss suggestions", error);
            return [];
        }
    };

    // Autosuggest will call this function every time you need to update suggestions.
    const onSuggestionsFetchRequested = async ({ value }) => {
        // Pass the current checkbox state to getSuggestions
        setSuggestions(await getSuggestions(value, isHighlyExpressedChecked));
    };

    // Autosuggest will call this function every time you need to clear suggestions.
    const onSuggestionsClearRequested = () => {
        setSuggestions([]);
    };

    // When suggestion is clicked, Autosuggest needs to know what should be
    // displayed in the input field.
    const getSuggestionValue = suggestion => suggestion.label;

    // Use your existing rendering logic for each suggestion.
    const renderSuggestion = suggestion => (
        <div className="px-4 py-2 cursor-pointer">
            {suggestion.label}
        </div>
    );

    // This function is called when a suggestion is selected.
    const onSuggestionSelected = (event, { suggestion, suggestionValue, suggestionIndex, sectionIndex, method }) => {
        if (onSelectGene) {
            onSelectGene(suggestion); // Pass the full suggestion object to parent
        }
        setGeneTss(suggestion.label); // Update input field with selected label
    };

    const onChange = (event, { newValue }) => {
        setGeneTss(newValue);
    };

    // Handler for the checkbox change
    const handleHighlyExpressedChange = async (e) => {
        const checked = e.target.checked;
        setIsHighlyExpressedChecked(checked);
        // Immediately fetch new suggestions based on the new checkbox state
        // and the current input value.
        setSuggestions(await getSuggestions(geneTss, checked));
    };


    // Input properties for Autosuggest
    const inputProps = {
        placeholder: 'e.g., ACTB | chr7 : 5530600 -',
        value: geneTss,
        onChange: onChange,
        className: "rounded-md border border-gray-300 px-2 h-10 w-full", // Apply Tailwind classes
    };

    // Custom theme to apply Tailwind classes to Autosuggest elements
    const autosuggestTheme = {
        container: 'relative',
        input: 'rounded-md border border-gray-300 px-2 h-10 w-full',
        suggestionsContainer: 'absolute z-10 w-full bg-white rounded-md shadow-lg mt-1 max-h-60 overflow-y-auto', // Border removed as per user request
        suggestionsList: 'list-none p-0 m-0',
        suggestion: 'px-4 py-2 cursor-pointer hover:bg-gray-100',
        suggestionHighlighted: 'bg-blue-100', // Class for highlighted item
    };

    return (
        <div className="flex flex-col">
            <label className='text-sm font-md text-gray-700'>Gene</label>
            {/* Replace your custom input and suggestions list with Autosuggest */}
            <Autosuggest
                suggestions={suggestions}
                onSuggestionsFetchRequested={onSuggestionsFetchRequested}
                onSuggestionsClearRequested={onSuggestionsClearRequested}
                getSuggestionValue={getSuggestionValue}
                renderSuggestion={renderSuggestion}
                inputProps={inputProps}
                onSuggestionSelected={onSuggestionSelected}
                theme={autosuggestTheme} // Apply custom theme
            />
            {/* NEW: Highly Expressed TSS Checkbox */}
            <div className="mt-2 flex items-center">
                <input
                    type="checkbox"
                    id="highlyExpressedTSS"
                    checked={isHighlyExpressedChecked}
                    onChange={handleHighlyExpressedChange}
                    className="form-checkbox h-4 w-4 text-blue-600 rounded"
                />
                <label htmlFor="highlyExpressedTSS" className="ml-2 text-sm text-gray-700">Highly Expressed TSS</label>
            </div>
        </div>
    );
};

const GenomeForm = ({ genome, setGenome, chromosome, setChromosome, centerCoordinate, setCenterCoordinate, strand, setStrand, gene, setGene }) => {
    // This state now represents the user's input in the coordinate field,
    // which will be debounced before updating centerCoordinate.
    const [tempCoordinate, setTempCoordinate] = useState(centerCoordinate);
    const debouncedCoordinate = useDebounce(tempCoordinate, 500);

    // Effect to update the main centerCoordinate state after debounce.
    useEffect(() => {
        setCenterCoordinate(debouncedCoordinate);
    }, [debouncedCoordinate, setCenterCoordinate]);

    // Effect to keep tempCoordinate in sync with centerCoordinate when
    // centerCoordinate is changed by an external source (like gene selection).
    useEffect(() => {
        setTempCoordinate(centerCoordinate);
    }, [centerCoordinate]);


    // Determine chromosome list based on genome selection
    const chromosomeList = genome === "hg38" ? humanChrs : mouseChrs;

    const handleGeneSelect = (selectedGene) => {
        setChromosome(selectedGene.chrom);
        setTempCoordinate(selectedGene.coordinate); // Update tempCoordinate, which will then debounce
        setStrand(selectedGene.strand);
        setGene(selectedGene.gene_name);
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
                        <input
                            type="number"
                            value={tempCoordinate}
                            onChange={(e) => setTempCoordinate(parseInt(e.target.value))}
                            className={fieldStyle}
                        />
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

                {/* Gene Search */}
                <div className="flex flex-col">
                    <GeneSearch onSelectGene={handleGeneSelect} />
                </div>
            </form>
        </div>
    );
};

export default GenomeForm;