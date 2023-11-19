
export type PageTransactionBase = {
    /** 1-based, should rename to number... */
    volumeNumber: number,
    /** 0-based */
    pageIndex: number,
};

export type TranslationTransactionBase = PageTransactionBase & {
    /**
     * 0-based, the order in which Google Vision API returned the blocks,
     * it usually goes from top to bottom and then from right to left which _differs_ from order in which
     * blocks are displayed in the UI, OcrDataAdapter tries to sort them to go approximately in the reading order
     */
    ocrBubbleIndex: number,
};

export type UnrecognizedTranslationTransactionBase = PageTransactionBase & {
    uuid: string,
};

type TransactionCreationData = {
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
};

export type TranslationTransaction = TranslationTransactionBase & TransactionCreationData & {
    /** just for consistency check, the OCRed Japanese text from the bubble */
    jpn_ocr: string,
    /** the English translation of the text in the bubble, may be overridden by newer transactions */
    eng_human: string,
    /**
     * the position of the text belonging to this bubble on the image, the
     * size of all images in all volumes is expected to be 685px x 1024px
     */
    bounds: {
        minX: number,
        minY: number,
        maxX: number,
        maxY: number,
    }
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

export type UnrecognizedTranslationTransaction = UnrecognizedTranslationTransactionBase & TransactionCreationData & {
    jpn_human?: string,
    eng_human: string,
    bounds: {
        minX: number,
        minY: number,
        maxX: number,
        maxY: number,
    },
    deleted?: true,
};

export type NoteTransaction = PageTransactionBase & TransactionCreationData & {
    text: string,
}

type submitBubbleUpdate_rq = {
    transactions: TranslationTransaction[],
};

type submitUnrecognizedBubbleUpdate_rq = {
    transactions: UnrecognizedTranslationTransaction[],
};

type submitNoteUpdate_rq = {
    transactions: NoteTransaction[],
};

const parseResponse = (rs: Response) => rs.status !== 200
    ? Promise.reject(rs.statusText)
    : rs.json();

/** @cudos https://stackoverflow.com/a/50767210/2750743 */
function bufferToHex (buffer: ArrayBuffer) {
    return [...new Uint8Array(buffer)]
        .map(b => b.toString(16).padStart(2, "0"))
        .join("");
}

// export const API_ENDPOINT = "http://localhost:36418";
// export const API_ENDPOINT = "https://ololo-4dk5v5gk4a-uc.a.run.app";
export const API_ENDPOINT = "https://api.reibai.info";

export const getApiToken = async (urlSearchParams: URLSearchParams): Promise<string> => {
    if (urlSearchParams.has('api_token')) {
        window.localStorage.setItem('REIBAI_API_TOKEN', urlSearchParams.get('api_token')!);
    } else if (!window.localStorage.getItem('REIBAI_API_TOKEN')) {
        const msg = 'Missing api_token in the URL. It should have been included in ' +
            'the link I gave you, unless I was a potato... Email me if you need help.';
        throw new Error(msg);
    }
    if (crypto.subtle) { // can check if we are in a secure context
        const passwordBytes = new TextEncoder().encode(
            window.localStorage.getItem('REIBAI_API_TOKEN')!
        );
        const hash = await crypto.subtle
            .digest('SHA-256', passwordBytes)
            .then(bufferToHex);
        if (hash !== 'f9979e5a7bb85ca891ee8819b955a906f68b9a589d9d224dae6f359b9e711c5f' &&
            hash !== 'f1cbf1ae00f8873d26a019041883a393698df4418ece3b240d8e9af2b631601e'
        ) {
            const msg = 'Wrong api_token in the URL. Possibly some characters got ' +
                'missing during a copy-paste or smth. Email me if you need help.';
            throw new Error(msg);
        }
    }
    return window.localStorage.getItem('REIBAI_API_TOKEN')!;
};

export const createUuid = () => {
    // not very reliable, but whatever
    return Math.random().toString().replace(".", "");
};

export type LocalBackup = {
    deviceUid: string,
    BUBBLE_TRANSLATION: TranslationTransaction[],
    UNRECOGNIZED_BUBBLE_TRANSLATION: UnrecognizedTranslationTransaction[],
    NOTE_TRANSLATION: NoteTransaction[],
};

const Api = ({api_token}: {api_token: string}) => {
    const post = (route: string, params: Record<string, unknown>) => {
        return fetch(API_ENDPOINT + route, {
            method: 'POST',
            body: JSON.stringify(params),
            headers: {
                'authorization': 'Bearer ' + btoa(api_token),
            },
        }).then(parseResponse);
    };

    return {
        submitBubbleUpdate: (params: submitBubbleUpdate_rq) => post('/api/submitBubbleUpdate', params),
        submitUnrecognizedBubbleUpdate: (params: submitUnrecognizedBubbleUpdate_rq) => post('/api/submitUnrecognizedBubbleUpdate', params),
        submitNoteUpdate: (params: submitNoteUpdate_rq) => post('/api/submitNoteUpdate', params),
        submitLocalBackup: (params: LocalBackup) => post('/api/submitLocalBackup', params),
    };
};

type Api = ReturnType<typeof Api>;

export default Api;
