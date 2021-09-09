
/**
 * @typedef {import('./../typing/CloudVisionApi.d.ts').CloudVisionApiResponse} CloudVisionApiResponse
 * @typedef {import('./../typing/CloudVisionApi.d.ts').Paragraph} Paragraph
 * @typedef {import('./../typing/CloudVisionApi.d.ts').Block} Block
 */

/** @param {Block|IndexedBlock} block */
export const collectBlockText = (block) => {
    return block.paragraphs.map(
        paragraph => paragraph.words
            .flatMap(w => w.symbols)
            .filter(s => s.confidence > 0.3)
            .map(s => s.text + (s.property?.detectedBreak ? '\n' : ''))
            .join('')
    ).join('\n');
};

const getMiddlePoint = (vertices) => {
    let xSum = 0;
    let ySum = 0;
    for (const verticle of vertices) {
        xSum += verticle.x;
        ySum += verticle.y;
    }
    return {
        x: xSum / vertices.length,
        y: ySum / vertices.length,
    };
};

const getTopRightPoint = (vertices) => {
    let maxX = 0;
    let minY = 9999999;
    for (const verticle of vertices) {
        maxX = Math.max(maxX, verticle.x);
        minY = Math.min(minY, verticle.y);
    }
    return { x: maxX, y: minY };
};

const hasJapaneseCharacters = (sentence) => {
    return sentence.match(/[ぁ-ゖ]/) // hiragana
        || sentence.match(/[ァ-ヺ]/) // katakana
        || sentence.match(/[㐀-龯]/); // kanji
};

/** @param {IndexedBlock} block */
export const getFontSize = (block) => {
    let maxWidth = 0;
    for (const paragraph of block.paragraphs) {
        for (const word of paragraph.words) {
            for (const symbol of word.symbols) {
                const xes = symbol.boundingBox.vertices
                    .map(v => v.x)
                    .sort((a,b) => a - b);
                const minX = xes[0];
                const maxX = xes.slice(-1)[0];
                const width = maxX - minX;

                const yes = symbol.boundingBox.vertices
                    .map(v => v.y)
                    .sort((a,b) => a - b);
                const minY = yes[0];
                const maxY = yes.slice(-1)[0];
                const height = maxY - minY;

                maxWidth = Math.max(maxWidth, width, height);
            }
        }
    }
    return maxWidth;
};

/**
 * @param {CloudVisionApiResponse} ocrData
 * @return {{blocks: IndexedBlock[]}}
 */
const OcrDataAdapter = (ocrData) => {
    const page = ocrData[0].fullTextAnnotation?.pages[0];
    if (!page) {
        // blank image, no text
        return {blocks: []};
    }

    /** @param {Block} block */
    const getEdgeDistance = (block) => {
        const topRightPoint = getTopRightPoint(block.boundingBox.vertices);
        const vector = {
            x: topRightPoint.x - page.width,
            y: topRightPoint.y,
        };
        // *2 because we prioritize horizontal bubbles, they are more likely to be the continuation
        return Math.sqrt(vector.x * vector.x + vector.y * vector.y * 4);
    };

    /** @type {IndexedBlock[]} */
    const blocks = page.blocks
        .map((b, i) => ({ocrIndex: i, ...b}))
        .filter(b => {
            return hasJapaneseCharacters(collectBlockText(b))
                // better would be to detect when there are small letters
                // glued to bigger letters, but for now this will do too
                && getFontSize(b) >= 10; // exclude small hiragana explanation of kanji
        })
        // .filter(b => b.confidence > 0.6)
        .sort((a,b) => getEdgeDistance(a) - getEdgeDistance(b));

    return {
        blocks: blocks,
    };
};

export default OcrDataAdapter;
