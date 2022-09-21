import {readJson} from "../utils/Http.js";
import { promises as fs } from 'fs';
import { dirname } from 'path';
import { fileURLToPath } from 'url';
import {getAuthorizedUser} from "../Auth.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

const TARGET_PATH = __dirname + '/../../docs/assets/translation_update_transactions.json';

/**
 * @param {IncomingMessage} req
 * @return {Promise<object>}
 */
const submitBubbleUpdate = async (req) => {
    const userName = getAuthorizedUser(req);
    const params = await readJson(req);
    const newTransactionsStr = params.transactions
        .map(tx => JSON.stringify({
            volumeNumber: tx.volumeNumber,
            pageIndex: tx.pageIndex,
            ocrBubbleIndex: tx.ocrBubbleIndex,
            eng_human: tx.eng_human,
            /** just for consistency check */
            jpn_ocr: tx.jpn_ocr,
            bounds: tx.bounds,
            author: userName,
            sentAt: tx.sentAt,
            ...!tx.jpn_human ? {} : {
                jpn_human: tx.jpn_human || undefined,
            },
            ...!tx.note ? {} : {
                note: tx.note,
            },
        }))
        .map(line => line + ',\n')
        .join('');
    await fs.appendFile(TARGET_PATH, newTransactionsStr);

    return {status: 'SUCCESS'};
};

export default submitBubbleUpdate;
