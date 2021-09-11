import {readJson} from "../utils/Http.js";
import { promises as fs } from 'fs';
import { dirname } from 'path';
import { fileURLToPath } from 'url';
import { Unauthorized } from '@curveball/http-errors';
import crypto from 'crypto';

const __dirname = dirname(fileURLToPath(import.meta.url));

const TARGET_PATH = __dirname + '/../../public/assets/translation_update_transactions.json';

const AUTHORIZED_USERS = {
    'translator': 'f9979e5a7bb85ca891ee8819b955a906f68b9a589d9d224dae6f359b9e711c5f',
};

const isAuthorized = (authorizationHeader) => {
    if (!authorizationHeader) {
        return false;
    }
    const match = authorizationHeader.match(/^Basic\s+(\S+)\s*$/i);
    if (!match) {
        return false;
    }
    const [username, password] = Buffer
        .from(match[1], 'base64')
        .toString().split(':');
    const expectedSha = AUTHORIZED_USERS[username];
    if (!expectedSha) {
        return false;
    }
    const passwordSha = crypto.createHash('sha256')
        .update(password).digest('hex');

    return expectedSha === passwordSha;
};

/**
 * @param {IncomingMessage} req
 * @return {Promise<object>}
 */
const submitUpdate = async (req) => {
    if (!isAuthorized(req.headers['authorization'])) {
        throw new Unauthorized('Wrong API token supplied, please check your URL');
    }
    const params = await readJson(req);
    const replyIp = req.socket.remoteAddress.replace(/^::ffff:/, '');
    const headerIp = replyIp !== '127.0.0.1'
        ? replyIp
        // x-forwarded-for should be enabled in the proxy
        : req.headers['x-forwarded-for'] || null;
    const newTransactionsStr = params.transactions
        .map(tx => JSON.stringify({
            volumeIndex: tx.volumeIndex,
            pageIndex: tx.pageIndex,
            ocrBubbleIndex: tx.ocrBubbleIndex,
            eng_human: tx.eng_human,
            /** just for consistency check */
            jpn_ocr: tx.jpn_ocr,
            bounds: tx.bounds,
            author: headerIp,
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

export default submitUpdate;
