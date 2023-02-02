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

function fillMapping(ocrBubbles, manualBubbles, notes, authorFallback) {
    for (const bubble of ocrBubbles) {
        bubble.author = bubble.author ?? authorFallback;
        mapping[bubble.volumeNumber] = mapping[bubble.volumeNumber] || {};
        mapping[bubble.volumeNumber][bubble.pageIndex] = mapping[bubble.volumeNumber][bubble.pageIndex] || makeEmptyPage();
        mapping[bubble.volumeNumber][bubble.pageIndex].bubbles.push(bubble);
    }
    for (const unrecognizedBubble of manualBubbles) {
        unrecognizedBubble.author = unrecognizedBubble.author ?? authorFallback;
        mapping[unrecognizedBubble.volumeNumber] = mapping[unrecognizedBubble.volumeNumber] || {};
        mapping[unrecognizedBubble.volumeNumber][unrecognizedBubble.pageIndex] = mapping[unrecognizedBubble.volumeNumber][unrecognizedBubble.pageIndex] || makeEmptyPage();
        mapping[unrecognizedBubble.volumeNumber][unrecognizedBubble.pageIndex].unrecognizedBubbles.push(unrecognizedBubble);
    }
    for (const note of notes) {
        note.author = note.author ?? authorFallback;
        mapping[note.volumeNumber] = mapping[note.volumeNumber] || {};
        mapping[note.volumeNumber][note.pageIndex] = mapping[note.volumeNumber][note.pageIndex] || makeEmptyPage();
        mapping[note.volumeNumber][note.pageIndex].notes.push(note);
    }
}

let versionedOcrBubbles = [];
let versionedNotes = [];
let versionedPlacedBubbles = [];

// fillMapping(versionedOcrBubbles, versionedPlacedBubbles, versionedNotes, undefined);

for (const file of await fs.readdir(backupsPath)) {
    if (!file.endsWith(".json")) {
        continue;
    }
    const json = await fs.readFile(backupsPath + "/" + file, "utf8");
    const data = JSON.parse(json);
    versionedOcrBubbles.push(...data.BUBBLE_TRANSLATION);
    versionedPlacedBubbles.push(...(data.UNRECOGNIZED_BUBBLE_TRANSLATION ?? []));
    versionedNotes.push(...data.NOTE_TRANSLATION);

    // fillMapping(
    //     data.BUBBLE_TRANSLATION,
    //     data.UNRECOGNIZED_BUBBLE_TRANSLATION ?? [],
    //     data.NOTE_TRANSLATION
    // );
}


versionedOcrBubbles.push(...JSON.parse((await fs.readFile(
    __dirname + "/../docs/assets/translation_update_transactions.json", "utf8"
)) + "null]").slice(0, -1));
versionedNotes.push(...JSON.parse((await fs.readFile(
    __dirname + "/../docs/assets/translator_notes_transactions.json", "utf8"
)) + "null]").slice(0, -1));
versionedPlacedBubbles.push(...JSON.parse((await fs.readFile(
    __dirname + "/../docs/assets/unrecognized_bubble_transactions.json", "utf8"
)) + "null]").slice(0, -1));

// for (let volumeNumber in mapping) {
//     for (let pageIndex in mapping[volumeNumber]) {
//         (mapping[volumeNumber][pageIndex].bubbles ?? []).sort((a,b) => {
//             return a.sentAt > b.sentAt ? 1 : a.sentAt < b.sentAt ? -1 : 0;
//         });
//         (mapping[volumeNumber][pageIndex].unrecognizedBubbles ?? []).sort((a,b) => {
//             return a.sentAt > b.sentAt ? 1 : a.sentAt < b.sentAt ? -1 : 0;
//         });
//         (mapping[volumeNumber][pageIndex].notes ?? []).sort((a,b) => {
//             return a.sentAt > b.sentAt ? 1 : a.sentAt < b.sentAt ? -1 : 0;
//         });
//         const ocrIndexes = (mapping[volumeNumber][pageIndex].bubbles ?? []).map(b => b.ocrBubbleIndex);
//         if (ocrIndexes.length > new Set(ocrIndexes).size) {
//             console.log(mapping[volumeNumber][pageIndex]);
//         }
//     }
// }


versionedOcrBubbles.sort((a,b) => {
    return a.sentAt > b.sentAt ? 1 : a.sentAt < b.sentAt ? -1 : 0;
});
versionedPlacedBubbles.sort((a,b) => {
    return a.sentAt > b.sentAt ? 1 : a.sentAt < b.sentAt ? -1 : 0;
});
versionedNotes.sort((a,b) => {
    return a.sentAt > b.sentAt ? 1 : a.sentAt < b.sentAt ? -1 : 0;
});


versionedOcrBubbles = versionedOcrBubbles.map(bubble => {
    const { volumeNumber, pageIndex, ocrBubbleIndex, eng_human, jpn_ocr, bounds, author, sentAt, ...rest } = bubble;
    return { volumeNumber, pageIndex, ocrBubbleIndex, eng_human, jpn_ocr, bounds, author, sentAt, ...rest };
});

function getOcrBubbleKey(bubble) {
    const { volumeNumber, pageIndex, ocrBubbleIndex, eng_human, jpn_ocr, bounds, author, sentAt, note, ...rest } = bubble;
    return JSON.stringify({ volumeNumber, pageIndex, ocrBubbleIndex, eng_human, bounds, sentAt, ...rest });
}
const dedupedOcr = [...new Map(versionedOcrBubbles.map(b => [getOcrBubbleKey(b), b])).values()];
// console.log("[\n" + dedupedOcr.map(b => JSON.stringify(b)).join(",\n") + ",\n");

function getPlacedBubbleKey(placedBubble) {
    const { volumeNumber, pageIndex, uuid, eng_human, sentAt } = placedBubble;
    return JSON.stringify({ volumeNumber, pageIndex, uuid, eng_human, sentAt });
}
const dedupedPlaced = [...new Map(versionedPlacedBubbles.map(b => [getPlacedBubbleKey(b), b])).values()];
// console.log("[\n" + dedupedPlaced.map(b => JSON.stringify(b)).join(",\n") + ",\n");

function getNoteKey(placedBubble) {
    const { volumeNumber, pageIndex, text, sentAt } = placedBubble;
    return JSON.stringify({ volumeNumber, pageIndex, text, sentAt });
}
const dedupedNotes = [...new Map(versionedNotes.map(b => [getNoteKey(b), b])).values()];
console.log("[\n" + dedupedNotes.map(b => JSON.stringify(b)).join(",\n") + ",\n");
