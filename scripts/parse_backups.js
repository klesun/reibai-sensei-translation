import { promises as fs } from "fs";
import { dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const backupsPath = __dirname + "/../docs/assets/local_backups";

const mapping = {};

function makeEmptyPage() {
    return {
        bubbles: [],
        unrecognizedBubbles: [],
        notes: [],
    };
}

for (const file of await fs.readdir(backupsPath)) {
    if (!file.endsWith(".json")) {
        continue;
    }
    const json = await fs.readFile(backupsPath + "/" + file, "utf8");
    const data = JSON.parse(json);
    for (const bubble of data.BUBBLE_TRANSLATION) {
        mapping[bubble.volumeNumber] = mapping[bubble.volumeNumber] || {};
        mapping[bubble.volumeNumber][bubble.pageIndex] = mapping[bubble.volumeNumber][bubble.pageIndex] || makeEmptyPage();
        mapping[bubble.volumeNumber][bubble.pageIndex].bubbles.push(bubble);
    }
    for (const unrecognizedBubble of data.UNRECOGNIZED_BUBBLE_TRANSLATION ?? []) {
        mapping[unrecognizedBubble.volumeNumber] = mapping[unrecognizedBubble.volumeNumber] || {};
        mapping[unrecognizedBubble.volumeNumber][unrecognizedBubble.pageIndex] = mapping[unrecognizedBubble.volumeNumber][unrecognizedBubble.pageIndex] || makeEmptyPage();
        mapping[unrecognizedBubble.volumeNumber][unrecognizedBubble.pageIndex].unrecognizedBubbles.push(unrecognizedBubble);
    }
    for (const note of data.NOTE_TRANSLATION) {
        mapping[note.volumeNumber] = mapping[note.volumeNumber] || {};
        mapping[note.volumeNumber][note.pageIndex] = mapping[note.volumeNumber][note.pageIndex] || makeEmptyPage();
        mapping[note.volumeNumber][note.pageIndex].notes.push(note);
    }
}

console.log(JSON.stringify(mapping, null, 4));
