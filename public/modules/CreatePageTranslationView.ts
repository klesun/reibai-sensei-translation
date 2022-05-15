
import type {IndexedBlock} from "../typing/CloudVisionApi";
import {Dom, Svg} from "./Dom.js";
import type {NoteTransaction, PageTransactionBase, TranslationTransaction} from "./Api";
import {collectBlockText, getBlockBounds, getFontSize} from "./OcrDataAdapter.js";
import type {BubbleMapping, TranslationsStorage} from "./DataParse";

const chunked = function*<T>(items: T[], chunkSize: number): Generator<T[]> {
    for (let i = 0; i < items.length; i += chunkSize) {
        yield items.slice(i, i + chunkSize);
    }
};
const focusBubbleSvg = (ocrIndex: number | string) => {
    [...document.querySelectorAll('.focused-block-polygon')]
        .forEach(poly => poly.classList.toggle('focused-block-polygon', false));
    [...document.querySelectorAll('polygon[data-block-ocr-index="' + ocrIndex + '"]')]
        .forEach(poly => poly.classList.toggle('focused-block-polygon', true));
};

const makeBubbleBoundsRect = (block: IndexedBlock, jpnToEng: Map<string, string>) => {
    const makeBlockStr = (b: IndexedBlock) => {
        const jpnSentence = collectBlockText(b).trimEnd();
        const engSentence = jpnToEng.get(jpnSentence);
        return jpnSentence + '\n' + engSentence;
    };

    const bounds = getBlockBounds(block);
    const pointsStr = [
        {x: bounds.minX, y: bounds.minY},
        {x: bounds.maxX, y: bounds.minY},
        {x: bounds.maxX, y: bounds.maxY},
        {x: bounds.minX, y: bounds.maxY},
    ].map(v => v.x + ',' + v.y).join(' ');

    const polygon = Svg('polygon', {
        points: pointsStr,
        class: 'block-polygon',
        'data-block-ocr-index': block.ocrIndex,
        onmousedown: () => {
            [...document.querySelectorAll('.focused-block-polygon')]
                .forEach(poly => poly.classList.toggle('focused-block-polygon', false));
            polygon.classList.toggle('focused-block-polygon', true);
        },
        onclick: () => {
            [...document.querySelectorAll('textarea[data-block-ocr-index="' + block.ocrIndex + '"]')]
                .forEach(area => (area as HTMLElement).focus());
        },
    }, [
        Svg('title', {}, makeBlockStr(block)),
    ]);

    return polygon;
};

const makeBubbleField = (
    block: IndexedBlock,
    qualifier: PageTransactionBase,
    jpnToEng: Map<string, string>,
    bubbleMapping: BubbleMapping
): HTMLElement => {
    const jpnSentence = collectBlockText(block).trimEnd();
    const engSentence = jpnToEng.get(jpnSentence);

    const txBase = {
        ...qualifier,
        ocrBubbleIndex: block.ocrIndex,
        jpn_ocr: jpnSentence,
        bounds: getBlockBounds(block),
    } as const;
    let lastValue = '';
    const textarea = Dom('textarea', {
        type: 'text',
        placeholder: engSentence || '', rows: 3,
        'data-block-ocr-index': block.ocrIndex,
        // TODO: check if blur triggers when you close browser
        onblur: (evt: Event) => {
            if (lastValue !== textarea.value) {
                lastValue = textarea.value;
                const tx: TranslationTransaction = {
                    ...txBase,
                    eng_human: lastValue,
                    sentAt: new Date().toISOString(),
                };
                bubbleMapping.set(tx);
            }
        },
    });

    const lastTranslation = bubbleMapping.get(txBase);
    if (lastTranslation) {
        textarea.value = lastTranslation.eng_human + textarea.value;
        lastValue = textarea.value;
    }

    return Dom('div', {
        class: 'sentence-block',
        onmousedown: () => focusBubbleSvg(block.ocrIndex),
    }, [
        Dom('div', {style: 'flex: 1'}),
        Dom('div', {class: 'ocred-text-block'}, [
            Dom('div', {}, jpnSentence),
            Dom('div', {style: 'display: flex; align-items: end'}, [
                Dom('div', {}, [
                    Dom('div', {class: 'font-size-holder'}, getFontSize(block) + 'px'),
                    Dom('div', {
                        class: 'confidence-holder',
                        title: 'Recognized Text Confidence'
                    }, block.confidence.toFixed(2)),
                ]),
                Dom('div', {class: 'bubble-number-holder'}, '#' + block.ocrIndex),
            ]),
        ]),
        textarea,
    ]);
};

let lastFormListener: ((e: Event) => void) | null = null;
export default ({qualifier, blocks, gui, translationsStorage, jpnToEng}: {
    qualifier: PageTransactionBase,
    blocks: IndexedBlock[],
    gui: {
        annotations_svg_root: SVGElement,
        translation_blocks_rows_list: HTMLElement,
        bubbles_translations_input_form: HTMLElement,
        translator_notes_input: HTMLTextAreaElement,
    },
    translationsStorage: TranslationsStorage,
    jpnToEng: Map<string, string>,
}) => {
    const main = () => {
        gui.annotations_svg_root.innerHTML = '';
        gui.translation_blocks_rows_list.innerHTML = '';

        for (const block of blocks) {
            const polygon = makeBubbleBoundsRect(block, jpnToEng);
            gui.annotations_svg_root.appendChild(polygon);
        }

        gui.translation_blocks_rows_list.innerHTML = '';
        const CELLS_PER_ROW = 3;
        // TODO: implement arrow navigation for bubbles on image
        for (const rowBlocks of chunked(blocks, CELLS_PER_ROW)) {
            const blockCells = rowBlocks.map(block => makeBubbleField(
                block, qualifier, jpnToEng, translationsStorage.bubbles
            ));
            const remainderCells = [];
            for (let i = 0; i < CELLS_PER_ROW - blockCells.length; ++i) {
                remainderCells.push(Dom('div', {class: 'remainder-cell'}));
            }
            gui.translation_blocks_rows_list.appendChild(
                Dom('div', {class: 'translation-blocks-row'}, blockCells.concat(remainderCells)),
            );
        }

        if (lastFormListener) {
            gui.bubbles_translations_input_form.removeEventListener('focus', lastFormListener);
        }
        lastFormListener = (evt: Event) => {
            const target = evt.target as HTMLElement;
            if (target.hasAttribute('data-block-ocr-index')) {
                focusBubbleSvg(target.getAttribute('data-block-ocr-index')!);
            }
        };
        gui.bubbles_translations_input_form.addEventListener('focus', lastFormListener, true);

        const noteMapping = translationsStorage.notes;
        const lastNote = noteMapping.get(qualifier);
        let lastNoteValue = lastNote ? lastNote.text : '';
        gui.translator_notes_input.value = lastNoteValue;
        gui.translator_notes_input.onblur = () => {
            if (lastNoteValue !== gui.translator_notes_input.value) {
                lastNoteValue = gui.translator_notes_input.value;
                const tx: NoteTransaction = {
                    ...qualifier,
                    text: lastNoteValue,
                    sentAt: new Date().toISOString(),
                };
                noteMapping.set(tx);
            }
        };

        const firstInput = gui.translation_blocks_rows_list.querySelector('textarea[data-block-ocr-index]') as HTMLTextAreaElement;
        if (firstInput) {
            firstInput.focus();
        }
    };

    main();
};
