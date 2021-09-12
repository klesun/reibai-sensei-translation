import {readJson} from "../utils/Http.js";
import { promises as fs } from 'fs';
import { dirname } from 'path';
import { fileURLToPath } from 'url';
import { Unauthorized, Forbidden } from '@curveball/http-errors';
import crypto from 'crypto';

const __dirname = dirname(fileURLToPath(import.meta.url));

const TARGET_PATH = __dirname + '/../../public/assets/translation_update_transactions.json';

const AUTHORIZED_USERS = {
    'f9979e5a7bb85ca891ee8819b955a906f68b9a589d9d224dae6f359b9e711c5f': 'ngelzzz',
    '41e90b5d85511ce65e6e3b1a8f915c3d9c91e9d6b069f70f715d96e0c776d3de': 'klesun',
};

const getAuthorizedUser = (authorizationHeader) => {
    if (!authorizationHeader) {
        return null;
    }
    const match = authorizationHeader.match(/^Bearer\s+(\S+)\s*$/i);
    if (!match) {
        return null;
    }
    const password = Buffer
        .from(match[1], 'base64')
        .toString();
    const passwordSha = crypto.createHash('sha256')
        .update(password).digest('hex');

    return AUTHORIZED_USERS[passwordSha] || undefined;
};

/**
 * @param {IncomingMessage} req
 * @return {Promise<object>}
 */
const submitUpdate = async (req) => {
    let userName = getAuthorizedUser(req.headers['authorization']);
    if (!userName) {
        throw new Unauthorized('Wrong API token supplied, please check your URL');
    }
    const params = await readJson(req);
    let replyIp = req.socket.remoteAddress.replace(/^::ffff:/, '');
    replyIp = replyIp !== '127.0.0.1' ? replyIp
        // x-forwarded-for should be enabled in the proxy
        : req.headers['x-forwarded-for'] || null;
    if (replyIp === '83.99.188.115' && userName !== 'klesun') {
        // since I know Ngelzzz's password, should add an extra check by
        // ip, to avoid accidentally mixing my alterations with hers
        throw new Forbidden('Don\'t try to impersonate people, klesun!.');
    }
    const newTransactionsStr = params.transactions
        .map(tx => JSON.stringify({
            volumeIndex: tx.volumeIndex,
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

export default submitUpdate;
