
import {Svg, Dom} from "./modules/Dom.js";
import {collectBlockText, getBlockBounds, getFontSize} from "./modules/OcrDataAdapter.js";
import OcrDataAdapter from "./modules/OcrDataAdapter.js";
import {CloudVisionApiResponse, IndexedBlock} from "./typing/CloudVisionApi.d";
import Api from "./modules/Api";
import {NoteTransaction, PageTransactionBase} from "./modules/Api";
import {TranslationTransactionBase} from "./modules/Api";
import {TranslationTransaction, getApiToken} from "./modules/Api";
import {collectBubblesStorage, collectNotesStorage, parseStreamedJson} from "./modules/DataParse";

const gui = {
    annotations_svg_root: document.getElementById('annotations_svg_root')!,
    node_json_holder: document.getElementById('node_json_holder')!,
    selected_block_text_holder: document.getElementById('selected_block_text_holder')!,
    all_text_holder: document.getElementById('all_text_holder')!,
    current_page_img: document.getElementById('current_page_img')!,
    page_input: document.getElementById('page_input') as HTMLInputElement,
    volume_input: document.getElementById('volume_input') as HTMLInputElement,
    page_select_form: document.getElementById('page_select_form')!,
    bubbles_translations_input_form: document.getElementById('bubbles_translations_input_form') as HTMLFormElement,
    go_to_next_page_button: document.getElementById('go_to_next_page_button')!,
    status_message_holder: document.getElementById('status_message_holder')!,
    translator_notes_input: document.getElementById('translator_notes_input') as HTMLTextAreaElement,
    words_translated_counter: document.getElementById('words_translated_counter')!,
    money_earned_counter: document.getElementById('money_earned_counter')!,
};

type GoogleSentenceTranslation = {
    jpn_ocr: string,
    eng_google: string,
};

const chunked = function*<T>(items: T[], chunkSize: number): Generator<T[]> {
    for (let i = 0; i < items.length; i += chunkSize) {
        yield items.slice(i, i + chunkSize);
    }
};

const BUBBLE_TRANSLATION = 'BUBBLE_TRANSLATION';
const NOTE_TRANSLATION = 'NOTE_TRANSLATION';

const makeBubbleKey = (tx: TranslationTransaction) => {
    return BUBBLE_TRANSLATION + '_' + JSON.stringify([
        tx.volumeNumber, tx.pageIndex, tx.ocrBubbleIndex,
    ])
};
const makeNoteKey = (tx: NoteTransaction) => {
    return NOTE_TRANSLATION + '_' + JSON.stringify([
        tx.volumeNumber, tx.pageIndex,
    ])
};

const addLocalBackupTransactions = <
    TTransaction extends
        | TranslationTransaction
        | NoteTransaction
>(transactions: TTransaction[], storagePrefix: string) => {
    for (let i = 0; i < window.localStorage.length; ++i) {
        const key = window.localStorage.key(i);
        if (key!.startsWith(storagePrefix + '_')) {
            const tx: TTransaction = JSON.parse(window.localStorage.getItem(key!)!);
            transactions.push(tx);
        }
    }
    transactions.sort((a,b) => {
        return new Date(a.sentAt).getTime()
            - new Date(b.sentAt).getTime();
    });
};

function toHandleUpdateResponse(localKey: string) {
    return [
        (rsData: Response) => {
            const msg = 'Submitted your ' + localKey + ' update to server: ' + rsData.status;
            document.body.setAttribute('data-status', 'SUCCESS');
            gui.status_message_holder.textContent = msg;
        },
        (error: Error | unknown) => {
            const msg = 'Could not submit your ' + localKey + ' update' +
                ' to server. Your change was stored offline for now... REASON: ' + String(error).slice(0, 60);
            document.body.setAttribute('data-status', 'ERROR');
            gui.status_message_holder.textContent = msg;
        },
    ];
}

const prepareBubbleMapping = (transactions: TranslationTransaction[], api: Api) => {
    addLocalBackupTransactions(transactions, BUBBLE_TRANSLATION);
    const { matrix, set, get } = collectBubblesStorage(transactions);
    return {
        getMatrix: () => matrix,
        get: get,
        set: (tx: TranslationTransaction) => {
            set(tx);
            // just to be safe in case some server transactions fail
            const localKey = makeBubbleKey(tx);
            window.localStorage.setItem(localKey, JSON.stringify(tx));
            // TODO: make a queue of actions to preserve order and for store failed actions and retry them once 30 seconds or smth
            api.submitBubbleUpdate({ transactions: [tx] })
                .then(...toHandleUpdateResponse(localKey));
        },
    };
};
type BubbleMapping = ReturnType<typeof prepareBubbleMapping>;

const prepareNotesMapping = (transactions: NoteTransaction[], api: Api) => {
    addLocalBackupTransactions(transactions, NOTE_TRANSLATION);
    const { matrix, set, get } = collectNotesStorage(transactions);
    return {
        getMatrix: () => matrix,
        get: get,
        set: (tx: NoteTransaction) => {
            set(tx);
            // just to be safe in case some server transactions fail
            const localKey = makeNoteKey(tx);
            window.localStorage.setItem(localKey, JSON.stringify(tx));
            api.submitNoteUpdate({ transactions: [tx] })
                .then(...toHandleUpdateResponse(localKey));
        },
    };
};
type NoteMapping = ReturnType<typeof prepareNotesMapping>;

const getAllTranslatedWords = (bubbles: BubbleMapping, notes: NoteMapping) => {
    let allTranslatedWords = [];
    for (const pages of Object.values(bubbles.getMatrix())) {
        for (const bubbles of Object.values(pages)) {
            for (const bubble of Object.values(bubbles)) {
                if (bubble.eng_human.trim()) {
                    const words = bubble.eng_human.trim().split(/\s+/)
                        .map(w => bubble.volumeNumber + ' ' + bubble.pageIndex + ': ' + w);
                    allTranslatedWords.push(...words);
                }
            }
        }
    }
    for (const pages of Object.values(notes.getMatrix())) {
        for (const page of Object.values(pages)) {
            if (page.text.trim()) {
                const words = page.text.trim().split(/\s+/)
                    .map(w => page.volumeNumber + ' ' + page.pageIndex + ': ' + w);
                allTranslatedWords.push(...words);
            }
        }
    }
    return allTranslatedWords;
};

const URL_PARAM_PAGE = "pageIndex";
const URL_PARAM_VOLUME = "volumeNumber";

const focusBubbleSvg = (ocrIndex: number | string) => {
    [...document.querySelectorAll('.focused-block-polygon')]
        .forEach(poly => poly.classList.toggle('focused-block-polygon', false));
    [...document.querySelectorAll('polygon[data-block-ocr-index="' + ocrIndex + '"]')]
        .forEach(poly => poly.classList.toggle('focused-block-polygon', true));
};

const makeBubbleField = (
    block: IndexedBlock,
    qualifier: PageTransactionBase,
    jpnToEng: Map<string, string>,
    whenBubbleMapping: Promise<BubbleMapping>
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
                whenBubbleMapping.then(data => data.set(tx));
            }
        },
    });
    whenBubbleMapping.then(data => {
        const lastTranslation = data.get(txBase);
        if (lastTranslation) {
            textarea.value = lastTranslation.eng_human + textarea.value;
            lastValue = textarea.value;
        }
    });
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

export default async (fetchingBubbles: Promise<Response>) => {
    const googleTranslationsPath = './unv/google_translations.json';
    const whenGoogleTranslations = fetch(googleTranslationsPath).then(rs => rs.json());
    const fetchingNotes = fetch('./assets/translator_notes_transactions.json');

    const urlSearchParams = new URLSearchParams(window.location.search);
    let api_token: string;
    try {
        api_token = await getApiToken(urlSearchParams);
    } catch (error: unknown) {
        document.body.setAttribute('data-status', 'ERROR');
        gui.status_message_holder.textContent =
            error instanceof Error ? error.message : String(error);
        return;
    }
    const api = Api({api_token: api_token});

    const whenBubbleMapping = fetchingBubbles
        .then(rs => parseStreamedJson<TranslationTransaction>(rs))
        .then(txs => prepareBubbleMapping(txs, api));
    const whenNoteMapping = fetchingNotes
        .then(rs => parseStreamedJson<NoteTransaction>(rs))
        .then(txs => prepareNotesMapping(txs, api));

    const googleTranslations: GoogleSentenceTranslation[] = await whenGoogleTranslations;
    const jpnToEng = new Map(
        googleTranslations.map(r => [r.jpn_ocr, r.eng_google])
    );

    let lastFormListener: ((e: Event) => void) | null = null;
    const showSelectedPage = async () => {
        gui.annotations_svg_root.innerHTML = '';
        const pageIndex = +gui.page_input.value;
        const volumeNumber = +gui.volume_input.value;

        const urlSearchParams = new URLSearchParams(window.location.search);
        urlSearchParams.set(URL_PARAM_PAGE, pageIndex.toString());
        urlSearchParams.set(URL_PARAM_VOLUME, volumeNumber.toString());
        window.history.replaceState(null, "", "?" + urlSearchParams);

        const pageFileName = ('000' + pageIndex).slice(-3);
        const volumeDirName = ('00' + volumeNumber).slice(-2);
        const qualifier = { volumeNumber, pageIndex };

        gui.current_page_img.setAttribute('src', "./unv/volumes/v" + volumeDirName + "/" + pageFileName + ".jpg");

        const jsonPath = './assets/ocred_volumes/v' + volumeDirName + '/' + pageFileName + '.jpg.json';
        const whenOcrData = fetch(jsonPath).then(rs => rs.json());

        const jsonData: CloudVisionApiResponse = await whenOcrData;
        const { blocks } = OcrDataAdapter(jsonData);

        const makeBlockStr = (b: IndexedBlock) => {
            const jpnSentence = collectBlockText(b).trimEnd();
            const engSentence = jpnToEng.get(jpnSentence);
            return jpnSentence + '\n' + engSentence;
        };

        for (const block of blocks) {
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
            gui.annotations_svg_root.appendChild(polygon);
        }

        gui.all_text_holder.innerHTML = '';
        const CELLS_PER_ROW = 3;
        // TODO: implement arrow navigation for bubbles on image
        for (const rowBlocks of chunked(blocks, CELLS_PER_ROW)) {
            const blockCells = rowBlocks.map(block => makeBubbleField(
                block, qualifier, jpnToEng, whenBubbleMapping
            ));
            const remainderCells = [];
            for (let i = 0; i < CELLS_PER_ROW - blockCells.length; ++i) {
                remainderCells.push(Dom('div', {class: 'remainder-cell'}));
            }
            gui.all_text_holder.appendChild(
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

        const noteMapping = await whenNoteMapping;
        const lastNote = noteMapping.get({volumeNumber, pageIndex});
        let lastNoteValue = lastNote ? lastNote.text : '';
        gui.translator_notes_input.value = lastNoteValue;
        gui.translator_notes_input.onblur = () => {
            if (lastNoteValue !== gui.translator_notes_input.value) {
                lastNoteValue = gui.translator_notes_input.value;
                const tx: NoteTransaction = {
                    volumeNumber, pageIndex,
                    text: lastNoteValue,
                    sentAt: new Date().toISOString(),
                };
                noteMapping.set(tx);
            }
        };

        const firstInput = gui.all_text_holder.querySelector('textarea[data-block-ocr-index]') as HTMLTextAreaElement;
        if (firstInput) {
            firstInput.focus();
        }
    };

    const pageFromUrl = urlSearchParams.get(URL_PARAM_PAGE);
    const volumeFromUrl = urlSearchParams.get(URL_PARAM_VOLUME);
    if (pageFromUrl && volumeFromUrl) {
        gui.page_input.value = pageFromUrl;
        gui.volume_input.value = volumeFromUrl;
    }
    await showSelectedPage();
    gui.page_select_form.onchange = showSelectedPage;
    gui.go_to_next_page_button.onclick = () => {
        gui.page_input.value = String(+gui.page_input.value + 1);
        showSelectedPage();
    };

    whenBubbleMapping.then((mapping) => {
        document.body.setAttribute('data-status', 'READY');
        gui.status_message_holder.textContent = 'Ready for input';
    }).catch(error => {
        document.body.setAttribute('data-status', 'INITIALIZATION_ERROR');
        gui.status_message_holder.textContent = 'Failed to restore the last progress - ' + error;
    });
    Promise.all([whenBubbleMapping, whenNoteMapping]).then(([bubbles, notes]) => {
        const printMoney = () => {
            const allTranslatedWords = getAllTranslatedWords(bubbles, notes);
            gui.words_translated_counter.textContent = String(allTranslatedWords.length);
            // 3$ per 100 words
            gui.money_earned_counter.textContent = String(3 * allTranslatedWords.length / 100);
            gui.words_translated_counter.setAttribute('title',
                allTranslatedWords
                    .slice(0, 12)
                    .concat(['...'])
                    .concat(allTranslatedWords.slice(-12))
                    .join('\n')
            );
        };
        printMoney();
        setInterval(printMoney, 5000);
    });
};
