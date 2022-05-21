
import type {IndexedBlock} from "../typing/CloudVisionApi";
import {Dom, Svg} from "./Dom.js";
import type {
    NoteTransaction,
    PageTransactionBase,
    TranslationTransaction,
    UnrecognizedTranslationTransactionBase,
} from "./Api";
import {collectBlockText, getBlockBounds, getFontSize} from "./OcrDataAdapter.js";
import type {BlockBounds, BubbleMapping, TranslationsStorage} from "./DataParse";
import type {NoteMapping} from "./DataParse";
import {createUuid} from "./Api";
import type {UnrecognizedBubbleMapping} from "./DataParse";

const CELLS_PER_ROW = 3;

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

function makePointsStr(bounds: BlockBounds): string {
    return [
        {x: bounds.minX, y: bounds.minY},
        {x: bounds.maxX, y: bounds.minY},
        {x: bounds.maxX, y: bounds.maxY},
        {x: bounds.minX, y: bounds.maxY},
    ].map(v => v.x + ',' + v.y).join(' ');
}

const makeBubbleBoundsRect = (block: IndexedBlock, jpnToEng: Map<string, string>) => {
    const makeBlockStr = (b: IndexedBlock) => {
        const jpnSentence = collectBlockText(b).trimEnd();
        const engSentence = jpnToEng.get(jpnSentence);
        return jpnSentence + '\n' + engSentence;
    };

    const bounds = getBlockBounds(block);
    const pointsStr = makePointsStr(bounds);

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

const makeUnrecognizedBubbleRect = (
    unrecognizedBubble: UnrecognizedTranslationTransactionBase & {bounds: BlockBounds},
    storage: UnrecognizedBubbleMapping,
) => {
    const pointsStr = makePointsStr(unrecognizedBubble.bounds);
    const polygon = Svg('polygon', {
        points: pointsStr,
        class: 'block-polygon',
        'data-unrecognized-bubble-uuid': unrecognizedBubble.uuid,
        onclick: () => {
            const oldState = storage.get(unrecognizedBubble)!;
            const msg = 'Edit translation for unrecognized bubble #' + unrecognizedBubble.uuid.slice(0, 4);
            const eng_human = prompt(msg, oldState.eng_human);
            if (eng_human !== null) {
                if (eng_human === '' && confirm('Delete this block?')) {
                    storage.set({
                        ...oldState,
                        eng_human,
                        sentAt: new Date().toISOString(),
                        deleted: true,
                    });
                    polygon.remove();
                } else if (eng_human !== oldState.eng_human) {
                    storage.set({
                        ...oldState,
                        eng_human,
                        sentAt: new Date().toISOString(),
                    });
                }
            }
        },
    }, [
        Svg('title', {}, 'Unrecognized block #' + unrecognizedBubble.uuid),
    ]);
    return polygon;
};

function addUnrecognizedBubble(
    svgRoot: SVGElement,
    centerX: number,
    centerY: number,
    qualifier: PageTransactionBase,
    storage: UnrecognizedBubbleMapping
) {
    const uuid = createUuid();
    const bounds: BlockBounds = {
        minX: centerX - 24,
        minY: centerY - 24,
        maxX: centerX + 24,
        maxY: centerY + 24,
    };

    const txBase = { ...qualifier, uuid, bounds } as const;

    const polygon = makeUnrecognizedBubbleRect(txBase, storage);

    svgRoot.appendChild(polygon);
    setTimeout(() => {
        const msg = 'Input translation for the unrecognized bubble #' +
            uuid.slice(0, 4) + ' at x=' + centerX + ' y=' + centerY + '...';
        const eng_human = prompt(msg);
        if (eng_human === null) {
            polygon.remove();
        } else {
            storage.set({
                ...txBase,
                eng_human,
                sentAt: new Date().toISOString(),
            });
        }
    }, 0);
}

let lastFormListener: ((e: Event) => void) | null = null;
function addBubbleFocusListener(form: HTMLFormElement) {
    if (lastFormListener) {
        form.removeEventListener('focus', lastFormListener);
    }
    lastFormListener = (evt: Event) => {
        const target = evt.target as HTMLElement;
        if (target.hasAttribute('data-block-ocr-index')) {
            focusBubbleSvg(target.getAttribute('data-block-ocr-index')!);
        }
    };
    form.addEventListener('focus', lastFormListener, true);
}

function initializeNotesInput(input: HTMLTextAreaElement, noteMapping: NoteMapping, qualifier: PageTransactionBase) {
    const lastNote = noteMapping.get(qualifier);
    let lastNoteValue = lastNote ? lastNote.text : '';
    input.value = lastNoteValue;
    input.onblur = () => {
        if (lastNoteValue !== input.value) {
            lastNoteValue = input.value;
            const tx: NoteTransaction = {
                ...qualifier,
                text: lastNoteValue,
                sentAt: new Date().toISOString(),
            };
            noteMapping.set(tx);
        }
    };
}

export default ({qualifier, blocks, gui, translationsStorage, jpnToEng}: {
    qualifier: PageTransactionBase,
    blocks: IndexedBlock[],
    gui: {
        annotations_svg_root: SVGElement,
        translation_blocks_rows_list: HTMLElement,
        bubbles_translations_input_form: HTMLFormElement,
        translator_notes_input: HTMLTextAreaElement,
    },
    translationsStorage: TranslationsStorage,
    jpnToEng: Map<string, string>,
}) => {
    const main = () => {
        gui.annotations_svg_root.innerHTML = '';
        gui.translation_blocks_rows_list.innerHTML = '';
        gui.translation_blocks_rows_list.innerHTML = '';

        for (const block of blocks) {
            const polygon = makeBubbleBoundsRect(block, jpnToEng);
            gui.annotations_svg_root.appendChild(polygon);
        }

        const unrecognizedBubbles = translationsStorage
            .unrecognizedBubbles.getAllAtPage(qualifier);
        for (const unrecognizedBubble of Object.values(unrecognizedBubbles ?? {})) {
            if (unrecognizedBubble.deleted) {
                continue;
            }
            const polygon = makeUnrecognizedBubbleRect(unrecognizedBubble, translationsStorage.unrecognizedBubbles);
            gui.annotations_svg_root.appendChild(polygon);
        }

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

        addBubbleFocusListener(gui.bubbles_translations_input_form);
        initializeNotesInput(gui.translator_notes_input, translationsStorage.notes, qualifier);

        gui.annotations_svg_root.onclick = (event: MouseEvent) => {
            if (event.target === gui.annotations_svg_root) {
                addUnrecognizedBubble(
                    gui.annotations_svg_root,
                    event.offsetX, event.offsetY, qualifier,
                    translationsStorage.unrecognizedBubbles
                );
            }
        };

        const firstInput = gui.translation_blocks_rows_list.querySelector('textarea[data-block-ocr-index]') as HTMLTextAreaElement;
        if (firstInput) {
            firstInput.focus();
        }
    };

    return main();
};
