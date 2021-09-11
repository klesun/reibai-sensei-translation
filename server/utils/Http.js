
import { BadRequest } from "@curveball/http-errors";

/**
 * @param {IncomingMessage} req
 * @return {Promise<string>}
 */
export const readPost = (req) => new Promise((ok, err) => {
    if (req.method === 'POST') {
        let body = '';
        req.on('data', (data) => body += data);
        req.on('error', (exc) => err(exc));
        req.on('end', () => ok(body));
    } else {
        ok('');
    }
});

/** @param {IncomingMessage} req */
export const readJson = async (req) => {
    const postStr = await readPost(req);
    if (!postStr) {
        const msg = 'POST body missing, must be a JSON string';
        throw new BadRequest(msg);
    }
    try {
        return JSON.parse(postStr);
    } catch (error) {
        const msg = 'Request body is not valid JSON - ' + error;
        throw new BadRequest(msg);
    }
};
