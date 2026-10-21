const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' })

/** Confronto "umano": "pagina 2" viene prima di "pagina 10". */
export const compareNatural = (a: string, b: string): number => collator.compare(a, b)
