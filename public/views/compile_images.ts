import {collectBubblesStorage, collectNotesStorage, getPageName, parseStreamedJson} from "../modules/DataParse";
import {NoteTransaction, TranslationTransaction} from "../modules/Api";
import {Svg} from "../modules/Dom.js";

const gui = {
    injected_translations_svg_root: document.getElementById("injected_translations_svg_root")!,
    bubble_text_paths_list: document.getElementById("bubble_text_paths_list")!,
    translators_note_text_path: document.getElementById("translators_note_text_path")!,
    download_svg_btn: document.getElementById("download_svg_link") as HTMLAnchorElement,
    src_scan_image: document.getElementById("src_scan_image") as SVGImageElement,
    bubble_texts_list: document.getElementById("bubble_texts_list")!,
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

    const zip = new JSZip();

    const volumeNumber = 2;
    for (let pageIndex = 0; pageIndex < 20; ++pageIndex) {
        const qualifier = {volumeNumber, pageIndex};
        const pageName = getPageName(qualifier);
        gui.src_scan_image.setAttribute('href', `https://reibai.info/unv/volumes/${pageName}.jpg`);
        gui.bubble_text_paths_list.innerHTML = '';
        gui.bubble_texts_list.innerHTML = '';
        const transactions = Object.values(bubbleMapping.matrix?.[volumeNumber]?.[pageIndex] ?? {})
            .filter(tx => !tx.eng_human.trim().toLocaleLowerCase().match(/^x*$/));
        for (const tx of transactions) {
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
            gui.bubble_text_paths_list.appendChild(pathNode);

            for (const classes of [['outline'], []]) {
                const textNode = Svg('text', {
                    class: [...classes, 'comic-text'].join(" "),
                }, [
                    Svg('textPath', {
                        'href': '#' + pathId,
                        'xlink:href': '#' + pathId,
                    }, tx.eng_human)
                ]);
                gui.bubble_texts_list.appendChild(textNode);
            }
        }
        const translatorsNote = noteMapping.matrix?.[volumeNumber]?.[pageIndex]?.text;
        gui.translators_note_text_path.textContent = !translatorsNote ? '' : 'tr. note: ' + translatorsNote;

        const svgStr = gui.injected_translations_svg_root.outerHTML;
        const svgFileName = 'reibai_v' + volumeNumber + '_p' + pageIndex + '.svg';
        zip.file(svgFileName, svgStr);
    }
    zip.generateAsync({type: 'blob'}).then(content => {
        gui.download_svg_btn.download = 'reibai_sinsei_eng_v' + volumeNumber + '.zip';
        gui.download_svg_btn.setAttribute('href', URL.createObjectURL(content));
    });
};
