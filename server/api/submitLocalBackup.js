import { getAuthorizedUser } from "../Auth.js";
import { readJson } from "../utils/Http.js";
import { BadRequest } from '@curveball/http-errors';
import { promises as fs } from "fs";
import { dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

const TARGET_DIR = __dirname + '/../../docs/assets/local_backups';

const submitLocalBackup = async (req) => {
    const userName = getAuthorizedUser(req);
    /** @type {LocalBackup} */
    const params = await readJson(req);
    if (!params.deviceUid.match(/^\d+$/)) {
        throw new BadRequest("Invalid Device UID format");
    }
    const fileData = {
        userName: userName,
        submittedAt: new Date().toISOString(),
        ...params
    };
    await fs.writeFile(TARGET_DIR + '/' + params.deviceUid + '.json', JSON.stringify(fileData));

    return {status: 'SUCCESS'};
};

export default submitLocalBackup;

export function listLocalBackups(req) {
    return fs.readdir(TARGET_DIR);
}
