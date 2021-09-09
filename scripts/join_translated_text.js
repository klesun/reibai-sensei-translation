import {dirname} from "path";
import {fileURLToPath} from "url";
import { promises as fs } from 'fs';

const __dirname = dirname(fileURLToPath(import.meta.url));

const main = async () => {
    const jpnJson = await fs.readFile(__dirname + '/../public/unv/sentences_ocr.json', 'utf8');
    const engTxt = await fs.readFile(__dirname + '/../public/unv/sentences_english.txt', 'utf8');

    const jpnSentences = JSON.parse(jpnJson);
    const engSentences = engTxt.trimEnd().split('\n');

    const results = [];
    for (let i = 0; i < jpnSentences.length; ++i) {
        results.push({
            jpn_ocr: jpnSentences[i].trimEnd(),
            eng_google: engSentences[i],
        });
    }
    console.log(JSON.stringify(results, null, 4));
};

main().catch(error => {
    console.error(error);
    process.exit(1);
});
