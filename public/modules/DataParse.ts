import {NoteTransaction, PageTransactionBase, TranslationTransaction, TranslationTransactionBase} from "./Api";

export const parseStreamedJson = async <
    TTransaction extends
        | TranslationTransaction
        | NoteTransaction
>(rs: Response): Promise<TTransaction[]> => {
    const dataStr = await rs.text();
    return JSON.parse(dataStr + 'null]').slice(0, -1);
};

export type BubbleMatrix = Record<number, Record<number, Record<number, TranslationTransaction>>>;
export type NoteMatrix = Record<number, Record<number, NoteTransaction>>;

export const collectBubblesStorage = (transactions: TranslationTransaction[]) => {
    const matrix: BubbleMatrix = {};
    const set = (tx: TranslationTransaction) => {
        matrix[tx.volumeNumber] = matrix[tx.volumeNumber] || {};
        matrix[tx.volumeNumber][tx.pageIndex] = matrix[tx.volumeNumber][tx.pageIndex] || {};
        matrix[tx.volumeNumber][tx.pageIndex][tx.ocrBubbleIndex] = tx;
    };
    const get = (tx: TranslationTransactionBase): TranslationTransaction | undefined => {
        if (tx.volumeNumber in matrix &&
            tx.pageIndex in matrix[tx.volumeNumber] &&
            tx.ocrBubbleIndex in matrix[tx.volumeNumber][tx.pageIndex]
        ) {
            return matrix[tx.volumeNumber][tx.pageIndex][tx.ocrBubbleIndex];
        } else {
            return undefined;
        }
    };
    transactions.forEach(set);
    return { matrix, set, get };
};

export const collectNotesStorage = (transactions: NoteTransaction[]) => {
    const matrix: NoteMatrix = {};
    const set = (tx: NoteTransaction) => {
        matrix[tx.volumeNumber] = matrix[tx.volumeNumber] || {};
        matrix[tx.volumeNumber][tx.pageIndex] = tx;
    };
    const get = (tx: PageTransactionBase): NoteTransaction | undefined => {
        if (tx.volumeNumber in matrix &&
            tx.pageIndex in matrix[tx.volumeNumber]
        ) {
            return matrix[tx.volumeNumber][tx.pageIndex];
        } else {
            return undefined;
        }
    };
    transactions.forEach(set);
    return { matrix, set, get };
};
