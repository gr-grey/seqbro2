import { useState, useEffect } from "react";

/**
 * Custom Hook for Debouncing - only set/ update a value after it stops changing
 * @param {any}  value
 * @param {number} delay - time after change
 * @returns {any} - debounced (stable) value
 */

const useDebounce = (value, delay) => {
    const [debouncedValue, setDebouncedValue] = useState(value);
    
    useEffect(() => {
        const handler = setTimeout(() => setDebouncedValue(value), delay);

        return () => clearTimeout(handler); // Cleanup timer on value or delay change
    }, [value, delay]);

    return debouncedValue;
};

export default useDebounce;