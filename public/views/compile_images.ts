import {collectBubblesStorage, collectNotesStorage, parseStreamedJson} from "../modules/DataParse";
import {NoteTransaction, TranslationTransaction} from "../modules/Api";
import {Svg} from "../modules/Dom.js";

const gui = {
    injected_translations_svg_root: document.getElementById("injected_translations_svg_root")!,
    injected_translations_svg_defs: document.getElementById("injected_translations_svg_defs")!,
};

export default async (
    fetchingBubbles: Promise<Response>,
    fetchingNotes: Promise<Response>
) => {
    const whenBubbleMapping = fetchingBubbles
        .then(rs => parseStreamedJson<TranslationTransaction>(rs))
        .then(txs => collectBubblesStorage(txs));
    const whenNoteMapping = fetchingNotes
        .then(rs => parseStreamedJson<NoteTransaction>(rs))
        .then(txs => collectNotesStorage(txs));

    const bubbleMapping = await whenBubbleMapping;
    const noteMapping = await whenNoteMapping;

    const volumeNumber = 2;
    const pageIndex = 33;

    for (const tx of Object.values(bubbleMapping.matrix[volumeNumber][pageIndex])) {
        if (tx.eng_human.trim().toLocaleLowerCase().match(/^x*$/)) {
            continue;
        }
        const pathId = 'path_ocr_bubble_' + tx.ocrBubbleIndex;
        const minX = tx.bounds.minX - 4;
        const maxX = tx.bounds.maxX + 4;
        const minY = tx.bounds.minY + 12;
        const width = maxX - minX;
        const pathLines = [];
        for (let i = 0; i < 10; ++i) {
            pathLines.push(`M${minX},${minY + 12 * i} H${minX + width}`);
        }
        const pathNode = Svg('path', {
            id: pathId,
            d: pathLines.join(" "),
        });
        gui.injected_translations_svg_defs.appendChild(pathNode);
        for (const className of ["outline", ""]) {
            const textNode = Svg('text', {
                class: className,
            }, [
                Svg('textPath', {
                    'href': '#' + pathId,
                    'xlink:href': '#' + pathId,
                }, tx.eng_human)
            ]);
            gui.injected_translations_svg_root.appendChild(textNode);
        }
    }
};
