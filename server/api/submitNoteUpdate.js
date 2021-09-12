
import {getAuthorizedUser} from "../Auth.js";
import {readJson} from "../utils/Http.js";
import {promises as fs} from "fs";
import { dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

const TARGET_PATH = __dirname + '/../../public/assets/translator_notes_transactions.json';

/**
 * @param {IncomingMessage} req
 * @return {Promise<object>}
 */
const submitNoteUpdate = async (req) => {
    const userName = getAuthorizedUser(req);
    const params = await readJson(req);
    const newTransactionsStr = params.transactions
        .map(tx => JSON.stringify({
            volumeNumber: tx.volumeNumber,
            pageIndex: tx.pageIndex,
            text: tx.text,
            author: userName,
            sentAt: tx.sentAt,
            ...!tx.jpn_human ? {} : {
                jpn_human: tx.jpn_human || undefined,
            },
        }))
        .map(line => line + ',\n')
        .join('');
    await fs.appendFile(TARGET_PATH, newTransactionsStr);

    return {status: 'SUCCESS'};
};

export default submitNoteUpdate;
