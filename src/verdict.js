const SECTION_PATTERN = /(DÉCISION|POURQUOI|À FAIRE|RÉSERVE)\s*:/g;

/**
 * Splits the verdict text of the presiding judge into its labelled sections.
 */
export function parseVerdict(text) {
    const sections = {};
    const matches = [...(text ?? '').matchAll(SECTION_PATTERN)];
    matches.forEach((match, index) => {
        const start = match.index + match[0].length;
        const end = index + 1 < matches.length ? matches[index + 1].index : text.length;
        sections[match[1]] = text.slice(start, end).trim();
    });
    return {
        decision: sections['DÉCISION'] ?? '',
        reasons: sections['POURQUOI'] ?? '',
        actions: (sections['À FAIRE'] ?? '').split(';').map((action) => action.trim().replace(/\.$/, '')).filter(Boolean),
        caveat: sections['RÉSERVE'] ?? '',
        isStructured: matches.length > 0,
    };
}
