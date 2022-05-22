import type {BubbleMatrix, NoteMatrix, UnrecognizedBubbleMatrix} from "./DataParse";

const getAllTranslatedWords = (bubbleMatrix: BubbleMatrix, unrecognizedBubbles: UnrecognizedBubbleMatrix, noteMatrix: NoteMatrix) => {
    const allTranslatedWords = [];
    for (const pages of Object.values(bubbleMatrix)) {
        for (const bubbles of Object.values(pages)) {
            for (const bubble of Object.values(bubbles)) {
                if (bubble.eng_human.trim()) {
                    const words = bubble.eng_human.trim().split(/\s+/)
                        .map(w => bubble.volumeNumber + ' ' + bubble.pageIndex + ': ' + w);
                    allTranslatedWords.push(...words);
                }
                if (bubble.note && bubble.note.trim()) {
                    const words = bubble.note.trim().split(/\s+/)
                        .map(w => bubble.volumeNumber + ' ' + bubble.pageIndex + ': ' + w);
                    allTranslatedWords.push(...words);
                }
            }
        }
    }
    for (const pages of Object.values(unrecognizedBubbles)) {
        for (const bubbles of Object.values(pages)) {
            for (const bubble of Object.values(bubbles)) {
                if (bubble.eng_human.trim()) {
                    const words = bubble.eng_human.trim().split(/\s+/)
                        .map(w => bubble.volumeNumber + ' ' + bubble.pageIndex + ': ' + w);
                    allTranslatedWords.push(...words);
                }
            }
        }
    }
    for (const pages of Object.values(noteMatrix)) {
        for (const page of Object.values(pages)) {
            if (page.text.trim()) {
                const words = page.text.trim().split(/\s+/)
                    .map(w => page.volumeNumber + ' ' + page.pageIndex + ': ' + w);
                allTranslatedWords.push(...words);
            }
        }
    }
    return allTranslatedWords;
};

interface ProfitGui {
    words_translated_counter: HTMLElement,
    money_earned_counter: HTMLElement,
}

export const printMoney = (gui: ProfitGui, bubbleMatrix: BubbleMatrix, unrecognizedBubbles: UnrecognizedBubbleMatrix, noteMatrix: NoteMatrix) => {
    const allTranslatedWords = getAllTranslatedWords(bubbleMatrix, unrecognizedBubbles, noteMatrix);
    gui.words_translated_counter.textContent = String(allTranslatedWords.length);
    // 3$ per 100 words
    gui.money_earned_counter.textContent = String(3 * allTranslatedWords.length / 100);
    gui.words_translated_counter.setAttribute('title',
        allTranslatedWords
            .slice(0, 12)
            .concat(['...'])
            .concat(allTranslatedWords.slice(-12))
            .join('\n')
    );
};
