
export type TranslationTransactionBase = {
    /** 0-based */
    volumeIndex: number,
    /** 0-based */
    pageIndex: number,
    /**
     * 0-based, the order in which Google Vision API returned the blocks,
     * it usually goes from top to bottom and then from right to left which _differs_ from order in which
     * blocks are displayed in the UI, OcrDataAdapter tries to sort them to go approximately in the reading order
     */
    ocrBubbleIndex: number,
};

export type TranslationTransaction = TranslationTransactionBase & {
    /** just for consistency check, the OCRed Japanese text from the bubble */
    jpn_ocr: string,
    /** the English translation of the text in the bubble, may be overridden by newer transactions */
    eng_human: string,
    /**
     * iso format datetime string, would be needed if server was down for
     * some time to restore the chronological order from local storage
     */
    sentAt: string,
    /**
     * the identifier of the person who submitted this translation, to distinct my
     * rubbish guesses of the meaning and tests from the real translation made by Ngelzzz
     * added by server
     */
    author?: string,
    /**
     * on optional correction of the OCRed Japanese text, would be nice for
     * consistency, but on practice probably won't be of much use to anyone...
     */
    jpn_human?: string,
    /**
     * an optional translator's note to this bubble, not sure if it will
     * be required, or general remarks for the whole page will be enough
     */
    note?: string,
};

type submitUpdate_rq = {
    transactions: TranslationTransaction[],
};

const parseResponse = (rs: Response) => rs.status !== 200
    ? Promise.reject(rs.statusText)
    : rs.json();

const post = (route: string, params: Record<string, unknown>) => {
    return fetch(route, {
        method: 'POST',
        body: JSON.stringify(params),
    }).then(parseResponse);
};

export default {
    submitUpdate: (params: submitUpdate_rq) => post('/api/submitUpdate', params),
};
