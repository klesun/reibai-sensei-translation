import type {
    NoteTransaction,
    PageTransactionBase,
    TranslationTransaction,
    TranslationTransactionBase,
    UnrecognizedTranslationTransaction, UnrecognizedTranslationTransactionBase
} from "./Api";

export const parseStreamedJson = async <
    TTransaction extends
        | TranslationTransaction
        | UnrecognizedTranslationTransaction
        | NoteTransaction
>(rs: Response): Promise<TTransaction[]> => {
    const dataStr = await rs.text();
    return JSON.parse(dataStr + 'null]').slice(0, -1);
};

/** volumeNumber -> pageIndex -> Data */
type QualifierMatrix<T> = Record<number, Record<number, T>>;

export type BubbleMatrix = QualifierMatrix<Record<number, TranslationTransaction>>;
export type UnrecognizedBubbleMatrix = QualifierMatrix<Record<string, UnrecognizedTranslationTransaction>>;
export type NoteMatrix = QualifierMatrix<NoteTransaction>;
export type Translations = {
    bubbleMatrix: BubbleMatrix,
    unrecognizedBubbleMatrix: UnrecognizedBubbleMatrix,
    noteMatrix: NoteMatrix,
};

function makeQualifierMatrix<T>(): {
    matrix: QualifierMatrix<T>,
    set: (qualifier: PageTransactionBase, value: T) => void,
    get: (qualifier: PageTransactionBase) => T | undefined,
} {
    const matrix: QualifierMatrix<T> = {};
    const set = (tx: PageTransactionBase, value: T) => {
        matrix[tx.volumeNumber] = matrix[tx.volumeNumber] || {};
        matrix[tx.volumeNumber][tx.pageIndex] = value;
    };
    const get = (tx: PageTransactionBase): T | undefined => {
        if (tx.volumeNumber in matrix &&
            tx.pageIndex in matrix[tx.volumeNumber]
        ) {
            return matrix[tx.volumeNumber][tx.pageIndex];
        } else {
            return undefined;
        }
    };
    return { matrix, set, get };
}

export const collectBubblesStorage = (transactions: TranslationTransaction[]) => {
    const baseStorage = makeQualifierMatrix<Record<number, TranslationTransaction>>();
    const set = (tx: TranslationTransaction) => {
        let bubbles = baseStorage.get(tx);
        if (!bubbles) {
            bubbles = {};
            baseStorage.set(tx, bubbles);
        }
        bubbles[tx.ocrBubbleIndex] = tx;
    };
    const get = (tx: TranslationTransactionBase): TranslationTransaction | undefined => {
        return baseStorage.get(tx)?.[tx.ocrBubbleIndex];
    };
    transactions.forEach(set);
    return { matrix: baseStorage.matrix, set, get };
};

export const collectUnrecognizedBubblesStorage = (transactions: UnrecognizedTranslationTransaction[]) => {
    const baseStorage = makeQualifierMatrix<Record<string, UnrecognizedTranslationTransaction>>();
    const set = (tx: UnrecognizedTranslationTransaction) => {
        let bubbles = baseStorage.get(tx);
        if (!bubbles) {
            bubbles = {};
            baseStorage.set(tx, bubbles);
        }
        bubbles[tx.uuid] = tx;
    };
    const get = (tx: UnrecognizedTranslationTransactionBase): UnrecognizedTranslationTransaction | undefined => {
        return baseStorage.get(tx)?.[tx.uuid];
    };
    const getAllAtPage = baseStorage.get;
    transactions.forEach(set);
    return { matrix: baseStorage.matrix, set, get, getAllAtPage };
};

export const collectNotesStorage = (transactions: NoteTransaction[]) => {
    const baseStorage = makeQualifierMatrix<NoteTransaction>();
    const matrix: NoteMatrix = {};
    const set = (tx: NoteTransaction) => {
        baseStorage.set(tx, tx);
    };
    const get = (tx: PageTransactionBase): NoteTransaction | undefined => {
        return baseStorage.get(tx);
    };
    transactions.forEach(set);
    return { matrix, set, get };
};


export type BubbleMapping = ReturnType<typeof collectBubblesStorage>;
export type UnrecognizedBubbleMapping = ReturnType<typeof collectUnrecognizedBubblesStorage>;
export type NoteMapping = ReturnType<typeof collectNotesStorage>;
export type TranslationsStorage = {
    bubbles: BubbleMapping,
    unrecognizedBubbles: UnrecognizedBubbleMapping,
    notes: NoteMapping,
};

export interface BlockBounds {
    minX: number,
    minY: number,
    maxX: number,
    maxY: number,
}

export const getPageName = ({pageIndex, volumeNumber}: PageTransactionBase) => {
    const pageFileName = ('000' + pageIndex).slice(-3);
    const volumeDirName = ('00' + volumeNumber).slice(-2);
    return "v" + volumeDirName + "/" + pageFileName;
};
