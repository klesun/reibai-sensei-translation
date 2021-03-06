import crypto from "crypto";
import { Unauthorized, Forbidden } from '@curveball/http-errors';

const AUTHORIZED_USERS = {
    'f9979e5a7bb85ca891ee8819b955a906f68b9a589d9d224dae6f359b9e711c5f': 'ngelzzz',
    'f1cbf1ae00f8873d26a019041883a393698df4418ece3b240d8e9af2b631601e': 'klesun',
};

/**
 * @param {IncomingMessage} req
 * @return {string}
 */
export const getAuthorizedUser = (req) => {
    const authorizationHeader = req.headers['authorization'];
    if (!authorizationHeader) {
        throw new Unauthorized('Missing authorization header');
    }
    const match = authorizationHeader.match(/^Bearer\s+(\S+)\s*$/i);
    if (!match) {
        throw new Unauthorized('Malformed authorization header');
    }
    const password = Buffer
        .from(match[1], 'base64')
        .toString();
    const passwordSha = crypto.createHash('sha256')
        .update(password).digest('hex');

    const userName = AUTHORIZED_USERS[passwordSha] || undefined;

    if (!userName) {
        throw new Unauthorized('Wrong API token supplied, please check your URL');
    }
    let replyIp = req.socket.remoteAddress.replace(/^::ffff:/, '');
    replyIp = replyIp !== '127.0.0.1' ? replyIp
        // x-forwarded-for should be enabled in the proxy
        : req.headers['x-forwarded-for'] || null;
    if (replyIp === '83.99.188.115' && userName !== 'klesun') {
        // since I know Ngelzzz's password, should add an extra check by
        // ip, to avoid accidentally mixing my alterations with hers
        throw new Forbidden('Don\'t try to impersonate people, klesun!');
    }
    return userName;
};
